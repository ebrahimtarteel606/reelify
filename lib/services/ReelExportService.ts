import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { Caption, ExportSettings, ReelExportResult } from '@/types';
import { buildFFmpegCommand, getExportSettings } from '@/lib/utils/ffmpegUtils';

export class ReelExportService {
  private static ffmpegInstance: FFmpeg | null = null;
  private static isLoaded = false;

  /**
   * Initialize FFmpeg instance
   */
  static async initialize(): Promise<FFmpeg> {
    if (this.ffmpegInstance && this.isLoaded) {
      return this.ffmpegInstance;
    }

    const ffmpeg = new FFmpeg();
    
    // Load FFmpeg core files from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.0/dist/umd';
    
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
      workerURL: `${baseURL}/ffmpeg-core.worker.js`,
    });

    this.ffmpegInstance = ffmpeg;
    this.isLoaded = true;
    return ffmpeg;
  }

  /**
   * Export video with trimming and captions
   * 
   * Note: Caption animations are preview-only and will NOT be included in the exported video.
   * FFmpeg's drawtext filter does not support animations. To export animations, you would need
   * to render each frame with the canvas and overlay them on the video frame-by-frame,
   * which is computationally expensive and not implemented in this version.
   * 
   * The following caption features ARE exported:
   * - Text content and positioning
   * - Font style, size, weight, and family
   * - Text color and background color
   * - Text transform (uppercase, lowercase, capitalize)
   * - Shadow effects
   * - Stroke/outline
   * - Keyword highlighting (via multiple drawtext filters)
   */
  static async exportVideo(
    videoUrl: string,
    startTime: number,
    endTime: number,
    captions: Caption[],
    clipId: string,
    quality: 'low' | 'medium' | 'high' = 'medium',
    onProgress?: (progress: number) => void
  ): Promise<ReelExportResult> {
    const ffmpeg = await this.initialize();
    const duration = endTime - startTime;
    const settings = getExportSettings(quality);

    // Set up progress tracking
    if (onProgress) {
      ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    try {
      // Write video file to FFmpeg virtual filesystem
      const videoData = await fetchFile(videoUrl);
      await ffmpeg.writeFile('input.mp4', videoData);

      // Build and execute FFmpeg command
      const args = buildFFmpegCommand(startTime, duration, captions, settings);
      await ffmpeg.exec(args);

      // Read output file
      const data = await ffmpeg.readFile('output.mp4');
      // ffmpeg.readFile returns FileData (string | Uint8Array<ArrayBufferLike>).
      // Normalize to Uint8Array so it's always Blob-compatible.
      const uint8Data =
        typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
      const blob = new Blob([uint8Data], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      // Cleanup
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');

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
    } catch (error) {
      // Cleanup on error
      try {
        await ffmpeg.deleteFile('input.mp4');
        await ffmpeg.deleteFile('output.mp4');
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
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
