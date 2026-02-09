import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { Caption, ReelExportResult, ExportFormatOptions } from "@/types";
import { ReelCaptionRenderer } from "./ReelCaptionRenderer";
import { ReelVideoLoaderService } from "./ReelVideoLoaderService";
import { getExportSettings } from "@/lib/utils/ffmpegUtils";

/** Benchmark report for export phases (ms). Use to find bottlenecks. */
export interface ExportBenchmarkReport {
  totalMs: number;
  phases: {
    initialize: number;
    loadVideoMetadata: number;
    videoElementReady: number;
    frameRendering: number;
    writeFramesToFs: number;
    audioExtraction: number;
    videoEncoding: number;
    readAndCleanup: number;
  };
  /** Per-frame breakdown from first frame only (seek + draw + toBlob as JPEG) */
  firstFrameBreakdown?: { seekMs: number; drawMs: number; toBlobMs: number };
  totalFrames: number;
  fps: number;
  durationSec: number;
}

/**
 * Canvas-based export service that renders captions using the same
 * rendering logic as the preview, ensuring 100% styling match.
 *
 * This service:
 * 1. Captures video frames using canvas drawImage
 * 2. Renders captions using ReelCaptionRenderer (same as preview)
 * 3. Composites video + captions frame-by-frame
 * 4. Encodes frames into video using FFmpeg WASM
 */
export class CanvasExportService {
  private static ffmpegInstance: FFmpeg | null = null;
  private static isLoaded = false;

  /**
   * Initialize FFmpeg instance
   */
  static async initialize(): Promise<FFmpeg> {
    if (this.ffmpegInstance && this.isLoaded) {
      return this.ffmpegInstance;
    }

    try {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      this.ffmpegInstance = ffmpeg;
      this.isLoaded = true;
      return ffmpeg;
    } catch (error) {
      console.error("Failed to initialize FFmpeg:", error);
      throw new Error(
        `Failed to initialize FFmpeg: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Export video with captions using canvas rendering
   * This ensures 100% styling match with the preview
   */
  static async exportVideo(
    videoUrl: string,
    startTime: number,
    endTime: number,
    captions: Caption[],
    clipId: string,
    onProgress?: (progress: number) => void,
    formatOptions?: ExportFormatOptions
  ): Promise<ReelExportResult> {
    // Validate inputs
    if (!videoUrl || !videoUrl.trim()) {
      throw new Error("Video URL is required");
    }

    if (endTime <= startTime) {
      throw new Error(
        `Invalid time range: end time (${endTime}) must be greater than start time (${startTime})`
      );
    }

    if (startTime < 0) {
      throw new Error(`Invalid start time: ${startTime} (must be >= 0)`);
    }

    const duration = endTime - startTime;
    const settings = getExportSettings("high", formatOptions);
    const fps = settings.fps || 30;

    // Benchmark: record start and phase timestamps
    const benchStart = performance.now();
    const bench = {
      start: benchStart,
      afterInit: benchStart,
      afterMetadata: benchStart,
      afterVideoReady: benchStart,
      afterFrameRendering: benchStart,
      afterWriteFrames: benchStart,
      afterAudio: benchStart,
      afterEncoding: benchStart,
      afterCleanup: benchStart,
    };

    console.log("Canvas export parameters:", {
      videoUrl,
      startTime,
      endTime,
      duration,
      captionsCount: captions.length,
      fps,
      formatOptions,
    });

    // Initialize FFmpeg
    const ffmpeg = await this.initialize();
    bench.afterInit = performance.now();

    // Load video metadata
    let videoMetadata;
    try {
      videoMetadata = await ReelVideoLoaderService.loadVideo(videoUrl);
      console.log("Video metadata:", {
        width: videoMetadata.width,
        height: videoMetadata.height,
        duration: videoMetadata.duration,
      });
    } catch (error) {
      throw new Error(
        `Failed to load video: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
    bench.afterMetadata = performance.now();

    // Determine output dimensions based on format
    let outputWidth = 1080;
    let outputHeight = 1920;

    if (formatOptions?.format === "landscape") {
      outputWidth = 1920;
      outputHeight = 1080;
    }

    // Adjust captions for trim offset (captions are relative to full video)
    const adjustedCaptions = captions
      .map((caption) => ({
        ...caption,
        startTime: caption.startTime - startTime,
        endTime: caption.endTime - startTime,
      }))
      .filter((c) => c.endTime > 0 && c.startTime < duration);

    console.log("Adjusted captions for export:", {
      originalCount: captions.length,
      adjustedCount: adjustedCaptions.length,
      timeRange: `${startTime}s - ${endTime}s`,
    });

    // Create video element for frame capture
    const video = document.createElement("video");
    video.src = videoUrl;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true; // Mute to avoid audio issues during seeking

    // Wait for video to be ready
    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
        resolve();
      };

      const onError = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
        reject(new Error("Failed to load video for export"));
      };

      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);
      video.load();
    });
    bench.afterVideoReady = performance.now();

    // Create canvas for compositing
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to create canvas context");
    }

    // Create caption canvas (same as preview)
    const captionCanvas = document.createElement("canvas");
    captionCanvas.width = outputWidth;
    captionCanvas.height = outputHeight;

    // Calculate total frames
    const totalFrames = Math.ceil(duration * fps);
    console.log(`Rendering ${totalFrames} frames at ${fps} fps`);

    // Pre-calculate draw dimensions (moved outside loop for performance)
    const videoAspect = videoMetadata.width / videoMetadata.height;
    const outputAspect = outputWidth / outputHeight;

    let drawWidth = outputWidth;
    let drawHeight = outputHeight;
    let drawX = 0;
    let drawY = 0;

    if (formatOptions?.format === "landscape") {
      // Landscape: fit width, crop height
      if (videoAspect > outputAspect) {
        drawHeight = outputWidth / videoAspect;
        drawY = (outputHeight - drawHeight) / 2;
      } else {
        drawWidth = outputHeight * videoAspect;
        drawX = (outputWidth - drawWidth) / 2;
      }
    } else {
      // Portrait (zoom): fit height, crop width
      if (videoAspect > outputAspect) {
        drawWidth = outputHeight * videoAspect;
        drawX = (outputWidth - drawWidth) / 2;
      } else {
        drawHeight = outputWidth / videoAspect;
        drawY = (outputHeight - drawHeight) / 2;
      }
    }

    // Render frames
    const frames: Uint8Array[] = [];
    let firstFrameBreakdown: { seekMs: number; drawMs: number; toBlobMs: number } | undefined;

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const frameTime = startTime + frameIndex / fps;
      const relativeTime = frameIndex / fps; // Time relative to trimmed video

      // Benchmark: time first frame breakdown (seek / draw / toBlob)
      const isFirstFrame = frameIndex === 0;
      const tSeekStart = isFirstFrame ? performance.now() : 0;

      // Update progress (throttled to every 10 frames to reduce overhead)
      if (onProgress && frameIndex % 10 === 0) {
        const progress = Math.round((frameIndex / totalFrames) * 85); // Reserve 15% for encoding
        onProgress(progress);
      }

      // Seek video to frame time
      video.currentTime = frameTime;

      // Wait for seek to complete with timeout (no artificial delay)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          video.removeEventListener("seeked", onSeeked);
          reject(new Error(`Seek timeout at frame ${frameIndex}`));
        }, 5000); // 5 second timeout

        const onSeeked = () => {
          clearTimeout(timeout);
          video.removeEventListener("seeked", onSeeked);
          resolve(); // Removed 50ms delay - seeked event means frame is ready
        };
        video.addEventListener("seeked", onSeeked);
      });

      if (isFirstFrame) {
        const tDrawStart = performance.now();
        firstFrameBreakdown = { seekMs: tDrawStart - tSeekStart, drawMs: 0, toBlobMs: 0 };
      }

      // Clear canvas
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      // Draw video frame
      ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);

      // Render captions on caption canvas
      ReelCaptionRenderer.renderCaptions(
        captionCanvas,
        adjustedCaptions,
        relativeTime,
        outputWidth,
        outputHeight
      );

      // Composite caption canvas onto video canvas
      ctx.drawImage(captionCanvas, 0, 0);

      if (isFirstFrame && firstFrameBreakdown) {
        firstFrameBreakdown.drawMs = performance.now() - (tSeekStart + firstFrameBreakdown.seekMs);
      }

      // Export frame as JPEG (faster than PNG, quality 0.95 for high quality)
      const tToBlobStart = isFirstFrame ? performance.now() : 0;
      const frameData = await new Promise<Uint8Array>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to export frame"));
              return;
            }
            blob
              .arrayBuffer()
              .then((buffer) => {
                resolve(new Uint8Array(buffer));
              })
              .catch(reject);
          },
          "image/jpeg",
          0.95
        );
      });

      if (isFirstFrame && firstFrameBreakdown) {
        firstFrameBreakdown.toBlobMs = performance.now() - tToBlobStart;
      }

      frames.push(frameData);
    }

    bench.afterFrameRendering = performance.now();

    console.log(`Rendered ${frames.length} frames, starting encoding...`);

    // Update progress
    if (onProgress) {
      onProgress(85);
    }

    // Write frames to FFmpeg filesystem
    console.log("Writing frames to FFmpeg filesystem...");
    for (let i = 0; i < frames.length; i++) {
      await ffmpeg.writeFile(`frame_${i.toString().padStart(6, "0")}.jpg`, frames[i]);
    }
    bench.afterWriteFrames = performance.now();

    // Extract audio from original video
    let hasAudio = false;
    console.log("Extracting audio from video...");
    try {
      const videoData = await fetchFile(videoUrl);
      await ffmpeg.writeFile("input.mp4", videoData);

      // Extract audio track
      await ffmpeg.exec([
        "-i",
        "input.mp4",
        "-ss",
        startTime.toString(),
        "-t",
        duration.toString(),
        "-vn", // No video
        "-acodec",
        "aac", // Encode to AAC for compatibility
        "-b:a",
        "128k", // Audio bitrate
        "-y", // Overwrite
        "audio.aac",
      ]);
      hasAudio = true;
      console.log("Audio extracted successfully");
    } catch (error) {
      console.warn("Failed to extract audio, exporting without audio:", error);
      hasAudio = false;
    }
    bench.afterAudio = performance.now();

    // Encode frames into video using FFmpeg
    console.log("Encoding video from frames...");

    if (frames.length === 0) {
      throw new Error("No frames to encode");
    }

    // Set up progress tracking for encoding
    if (onProgress) {
      ffmpeg.on("log", ({ message }) => {
        // Parse frame number from FFmpeg output
        const frameMatch = /frame=\s*(\d+)/.exec(message);
        if (frameMatch) {
          const currentFrame = Number.parseInt(frameMatch[1], 10);
          const progress = 85 + Math.round((currentFrame / frames.length) * 10); // 85-95%
          onProgress(Math.min(progress, 95));
        }
      });
    }

    // Build FFmpeg command with or without audio
    // Use -preset and -crf for speed + quality, with -maxrate/-bufsize as cap
    const ffmpegArgs = hasAudio
      ? [
          "-framerate",
          fps.toString(),
          "-i",
          "frame_%06d.jpg",
          "-i",
          "audio.aac",
          "-c:v",
          settings.videoCodec,
          "-preset",
          settings.preset,
          "-crf",
          settings.crf.toString(),
          "-maxrate",
          settings.videoBitrate,
          "-bufsize",
          settings.videoBitrate,
          "-c:a",
          settings.audioCodec,
          "-b:a",
          settings.audioBitrate,
          "-r",
          fps.toString(),
          "-pix_fmt",
          "yuv420p",
          "-shortest", // Match audio duration
          "-y", // Overwrite
          "output.mp4",
        ]
      : [
          "-framerate",
          fps.toString(),
          "-i",
          "frame_%06d.jpg",
          "-c:v",
          settings.videoCodec,
          "-preset",
          settings.preset,
          "-crf",
          settings.crf.toString(),
          "-maxrate",
          settings.videoBitrate,
          "-bufsize",
          settings.videoBitrate,
          "-r",
          fps.toString(),
          "-pix_fmt",
          "yuv420p",
          "-y",
          "output.mp4",
        ];

    try {
      await ffmpeg.exec(ffmpegArgs);
    } catch (error) {
      // If encoding with audio failed, try without audio
      if (hasAudio) {
        console.warn("Encoding with audio failed, retrying without audio:", error);
        const argsWithoutAudio = [
          "-framerate",
          fps.toString(),
          "-i",
          "frame_%06d.jpg",
          "-c:v",
          settings.videoCodec,
          "-preset",
          settings.preset,
          "-crf",
          settings.crf.toString(),
          "-maxrate",
          settings.videoBitrate,
          "-bufsize",
          settings.videoBitrate,
          "-r",
          fps.toString(),
          "-pix_fmt",
          "yuv420p",
          "-y",
          "output.mp4",
        ];
        await ffmpeg.exec(argsWithoutAudio);
      } else {
        throw error;
      }
    }
    bench.afterEncoding = performance.now();

    // Read output video
    const outputData = await ffmpeg.readFile("output.mp4");
    const uint8Data =
      typeof outputData === "string"
        ? new TextEncoder().encode(outputData)
        : new Uint8Array(outputData);

    if (!uint8Data || uint8Data.length === 0) {
      throw new Error("Exported video file is empty");
    }

    // Cleanup frames
    console.log("Cleaning up temporary files...");
    for (let i = 0; i < frames.length; i++) {
      try {
        await ffmpeg.deleteFile(`frame_${i.toString().padStart(6, "0")}.jpg`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    try {
      await ffmpeg.deleteFile("input.mp4");
      if (hasAudio) {
        await ffmpeg.deleteFile("audio.aac");
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    // Cleanup video element
    video.src = "";
    video.load();

    bench.afterCleanup = performance.now();

    // Build and log benchmark report
    const report: ExportBenchmarkReport = {
      totalMs: bench.afterCleanup - bench.start,
      phases: {
        initialize: bench.afterInit - bench.start,
        loadVideoMetadata: bench.afterMetadata - bench.afterInit,
        videoElementReady: bench.afterVideoReady - bench.afterMetadata,
        frameRendering: bench.afterFrameRendering - bench.afterVideoReady,
        writeFramesToFs: bench.afterWriteFrames - bench.afterFrameRendering,
        audioExtraction: bench.afterAudio - bench.afterWriteFrames,
        videoEncoding: bench.afterEncoding - bench.afterAudio,
        readAndCleanup: bench.afterCleanup - bench.afterEncoding,
      },
      firstFrameBreakdown,
      totalFrames,
      fps,
      durationSec: duration,
    };
    const phaseNames = Object.keys(report.phases) as (keyof typeof report.phases)[];
    console.group("[Canvas Export Benchmark]");
    console.log("Total:", (report.totalMs / 1000).toFixed(2), "s");
    phaseNames.forEach((name) => {
      const ms = report.phases[name];
      const pct = report.totalMs > 0 ? ((100 * ms) / report.totalMs).toFixed(1) : "0";
      console.log(`  ${name}: ${(ms / 1000).toFixed(2)}s (${pct}%)`);
    });
    if (report.firstFrameBreakdown) {
      console.log(
        "  First frame breakdown: seek",
        report.firstFrameBreakdown.seekMs.toFixed(0),
        "ms, draw",
        report.firstFrameBreakdown.drawMs.toFixed(0),
        "ms, toBlob",
        report.firstFrameBreakdown.toBlobMs.toFixed(0),
        "ms"
      );
    }
    console.log(
      "  Frames:",
      report.totalFrames,
      "| FPS:",
      report.fps,
      "| Duration:",
      report.durationSec,
      "s"
    );
    console.groupEnd();

    // Create blob
    const blob = new Blob([uint8Data], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    console.log("Canvas export completed successfully, file size:", blob.size, "bytes");

    // Set progress to 100%
    if (onProgress) {
      onProgress(100);
    }

    return {
      clipId,
      videoBlob: blob,
      videoUrl: url,
      duration,
      fileSize: blob.size,
      exportSettings: {
        startTime,
        endTime,
        captionStyles: captions.map((c) => c.style),
      },
    };
  }

  /**
   * Cleanup FFmpeg instance
   */
  static async cleanup(): Promise<void> {
    if (this.ffmpegInstance) {
      try {
        await this.ffmpegInstance.terminate();
      } catch {
        // Ignore termination errors
      }
      this.ffmpegInstance = null;
      this.isLoaded = false;
    }
  }
}
