import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { Caption, ReelExportResult, ExportFormatOptions } from "@/types";
import { buildFFmpegCommand, getExportSettings } from "@/lib/utils/ffmpegUtils";
import { ReelVideoLoaderService } from "@/lib/services/ReelVideoLoaderService";
import { CanvasExportService } from "./CanvasExportService";

export class ReelExportService {
  private static ffmpegInstance: FFmpeg | null = null;
  private static isLoaded = false;
  private static ffmpegLogs: string[] = [];

  /**
   * Initialize FFmpeg instance
   */
  static async initialize(): Promise<FFmpeg> {
    if (this.ffmpegInstance && this.isLoaded) {
      return this.ffmpegInstance;
    }

    try {
      const ffmpeg = new FFmpeg();

      // Capture FFmpeg logs for debugging
      ffmpeg.on("log", ({ message }) => {
        console.log("[FFmpeg]", message);
        this.ffmpegLogs.push(message);
        // Keep only last 100 log lines
        if (this.ffmpegLogs.length > 100) {
          this.ffmpegLogs.shift();
        }
      });

      // Use the library's default loading mechanism which handles version matching
      // This ensures compatibility with the installed @ffmpeg/ffmpeg version
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
   * Get recent FFmpeg logs for debugging
   */
  static getRecentLogs(): string[] {
    return [...this.ffmpegLogs];
  }

  /**
   * Clear FFmpeg logs
   */
  static clearLogs(): void {
    this.ffmpegLogs = [];
  }

  /**
   * Export video with trimming and captions
   *
   * Uses canvas-based rendering when captions are present to ensure 100% styling match
   * with the preview. This includes full support for:
   * - All caption animations (fade, slide, typewriter, scale, etc.)
   * - Complete styling (shadows, strokes, backgrounds, keyword highlighting)
   * - Text transforms and positioning
   *
   * Falls back to FFmpeg drawtext for videos without captions (faster).
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

    const visibleCaptions = captions.filter((c) => c.isVisible);

    // Use canvas-based export when captions are present for 100% styling match
    if (visibleCaptions.length > 0) {
      console.log("Using canvas-based export for accurate caption styling");
      return CanvasExportService.exportVideo(
        videoUrl,
        startTime,
        endTime,
        visibleCaptions,
        clipId,
        onProgress,
        formatOptions
      );
    }

    // Fall back to FFmpeg drawtext for videos without captions (faster)
    console.log("No captions detected, using FFmpeg drawtext export (faster)");

    const ffmpeg = await this.initialize();
    const duration = endTime - startTime;
    const settings = getExportSettings("high", formatOptions);

    console.log("Export parameters:", {
      videoUrl,
      startTime,
      endTime,
      duration,
      captionsCount: captions.length,
      formatOptions,
      settings,
    });

    // Set up progress tracking
    let expectedFrames = 0;
    if (onProgress) {
      // Calculate expected total frames based on duration and fps (30 fps default)
      expectedFrames = Math.ceil(duration * 30);
      console.log(`Expected frames for progress tracking: ${expectedFrames}`);

      // Parse FFmpeg log output for accurate frame-based progress
      ffmpeg.on("log", ({ message }) => {
        // Parse frame number from FFmpeg output: "frame=  294 fps= 20 q=21.0 ..."
        const frameMatch = message.match(/frame=\s*(\d+)/);
        if (frameMatch && expectedFrames > 0) {
          const currentFrame = parseInt(frameMatch[1], 10);
          const progress = Math.min(Math.round((currentFrame / expectedFrames) * 100), 99);
          onProgress(progress);
        }
      });

      // Fallback to default progress event if log parsing doesn't work
      ffmpeg.on("progress", ({ progress }) => {
        if (expectedFrames === 0) {
          // Only use this if we don't have frame-based tracking
          onProgress(Math.round(progress * 100));
        }
      });
    }

    // Clear previous logs
    this.clearLogs();

    try {
      console.log("Starting export:", {
        videoUrl,
        startTime,
        endTime,
        duration,
        captionsCount: captions.length,
      });

      // Check if video URL is accessible (basic validation)
      if (
        !videoUrl.startsWith("http://") &&
        !videoUrl.startsWith("https://") &&
        !videoUrl.startsWith("blob:") &&
        !videoUrl.startsWith("data:")
      ) {
        throw new Error(`Invalid video URL format: ${videoUrl}`);
      }

      // Write video file to FFmpeg virtual filesystem
      console.log("Fetching video file...");
      let videoData: Uint8Array;
      try {
        videoData = await fetchFile(videoUrl);
        if (!videoData || videoData.length === 0) {
          throw new Error("Video file is empty");
        }
        console.log("Video file fetched, size:", videoData.length, "bytes");
      } catch (fetchError) {
        console.error("Failed to fetch video file:", fetchError);
        const errorMsg = fetchError instanceof Error ? fetchError.message : "Unknown error";
        if (errorMsg.includes("CORS") || errorMsg.includes("Failed to fetch")) {
          throw new Error(
            `Failed to fetch video file due to CORS or network error. The video server must allow cross-origin requests. Original error: ${errorMsg}`
          );
        }
        throw new Error(`Failed to fetch video file: ${errorMsg}`);
      }

      console.log("Writing video to FFmpeg filesystem...");
      await ffmpeg.writeFile("input.mp4", videoData);
      console.log("Video file written to FFmpeg filesystem");

      // Probe video dimensions for reframing
      let inputWidth = 1920;
      let inputHeight = 1080;
      try {
        const videoMetadata = await ReelVideoLoaderService.loadVideo(videoUrl);
        inputWidth = videoMetadata.width;
        inputHeight = videoMetadata.height;
        console.log("Video dimensions:", inputWidth, "x", inputHeight);
      } catch (probeError) {
        console.warn("Failed to probe video dimensions, using defaults:", probeError);
        // Try to probe using FFmpeg
        try {
          // Use FFmpeg to probe video info
          await ffmpeg.exec(["-i", "input.mp4", "-f", "null", "-"]);
          // Note: FFmpeg logs will contain video dimensions, but parsing them is complex
          // For now, we'll use the default dimensions
        } catch {
          // Ignore probe errors, use defaults
        }
      }

      // Helper function to execute FFmpeg and check result
      const executeAndCheck = async (args: string[]): Promise<Uint8Array | null> => {
        const commandString = args.join(" ");
        console.log("FFmpeg command:", commandString);
        console.log(
          "FFmpeg command (formatted):",
          args
            .map((arg, i) => {
              if (arg === "-vf" && args[i + 1]) {
                return `-vf\n  ${args[i + 1].substring(0, 200)}...`;
              }
              return arg;
            })
            .join(" ")
        );

        try {
          await ffmpeg.exec(args);
          console.log("FFmpeg execution completed");
          const logs = this.getRecentLogs();
          if (logs.length > 0) {
            console.log("FFmpeg logs (last 50):", logs.slice(-50).join("\n"));
            // Check for drawtext-related errors
            const drawtextErrors = logs.filter(
              (log) =>
                log.toLowerCase().includes("drawtext") ||
                log.toLowerCase().includes("font") ||
                log.toLowerCase().includes("error") ||
                log.toLowerCase().includes("warning")
            );
            if (drawtextErrors.length > 0) {
              console.warn("FFmpeg drawtext-related messages:", drawtextErrors.join("\n"));
            }
          }
        } catch (execError) {
          console.error("FFmpeg execution failed:", execError);
          const allLogs = this.getRecentLogs();
          console.error("FFmpeg logs (all):", allLogs.join("\n"));
          return null;
        }

        // Read output file
        try {
          const data = await ffmpeg.readFile("output.mp4");
          const uint8Data =
            typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);

          if (uint8Data && uint8Data.length > 0) {
            return uint8Data;
          }
        } catch (readError) {
          console.error("Failed to read output file:", readError);
        }

        return null;
      };

      // Determine if we can use stream copy (no re-encoding) for faster export
      // Stream copy is nearly instant but can only be used when no filters are needed
      const visibleCaptions = captions.filter((c) => c.isVisible);
      const canUseStreamCopy = visibleCaptions.length === 0;

      console.log("Export captions check:", {
        totalCaptions: captions.length,
        visibleCaptions: visibleCaptions.length,
        captions: captions.map((c) => ({
          id: c.id,
          text: c.text.substring(0, 30),
          isVisible: c.isVisible,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
      });

      if (canUseStreamCopy) {
        console.log("No captions detected - using stream copy mode for faster export");
      } else {
        console.log(`Exporting with ${visibleCaptions.length} visible captions`);
      }

      // Note: We use drawtext filters instead of ASS subtitles for better compatibility with FFmpeg WASM
      // IMPORTANT: FFmpeg WASM drawtext filter REQUIRES a font file for ALL text (not just Arabic)

      // Check if any visible captions contain Arabic/RTL text
      const hasArabicCaptions = visibleCaptions.some((c) => /[\u0600-\u06FF]/.test(c.text));

      // ALWAYS load a font file - required by FFmpeg drawtext filter
      // If any captions exist, we MUST have a font
      if (visibleCaptions.length > 0) {
        console.log(
          "Loading font for subtitle rendering...",
          hasArabicCaptions ? "(Arabic/Mixed text detected)" : "(English text)"
        );
        try {
          let arabicFontData: ArrayBuffer | null = null;
          let englishFontData: ArrayBuffer | null = null;
          let lastError: Error | null = null;

          // STRATEGY: Use LOCAL fonts first, CDN as fallback
          // Arabic font: Noto Sans Arabic (for Arabic with text_shaping)
          // English font: Roboto (for Latin text)

          // Load Arabic font (try local first, then CDN)
          // Try local paths first (more reliable)
          const localArabicPaths = [
            "/NotoSansArabic-Regular.ttf", // Public folder (served from root)
            "./NotoSansArabic-Regular.ttf",
            "/public/NotoSansArabic-Regular.ttf",
            "NotoSansArabic-Regular.ttf",
          ];

          for (const path of localArabicPaths) {
            try {
              console.log(`Trying local Arabic font: ${path}`);
              const response = await fetch(path, { cache: "no-cache" });
              if (response.ok) {
                const data = await response.arrayBuffer();
                console.log(`Arabic font response from ${path}: ${data.byteLength} bytes`);
                if (data.byteLength > 10000) {
                  arabicFontData = data;
                  console.log(
                    `✓ Arabic font loaded from local: ${path} (${data.byteLength} bytes)`
                  );
                  break;
                } else {
                  console.warn(
                    `Arabic font file too small: ${data.byteLength} bytes (expected > 10000)`
                  );
                }
              } else {
                console.warn(
                  `Arabic font fetch failed for ${path}: ${response.status} ${response.statusText}`
                );
              }
            } catch (err) {
              console.warn(`Local Arabic font ${path} failed:`, err);
            }
          }

          // Fallback: Try CDN if local loading failed
          if (!arabicFontData) {
            try {
              const arabicFontUrl =
                "https://fonts.gstatic.com/s/notosansarabic/v18/nwpxtLGrOAZMl5nJ_wfgRg3DrWFZWsnVBJ_sS6tlqHHFlhQ5l3sQWIHPqzCfyG2vu3CBFQLaig.ttf";
              console.log(`Loading Noto Sans Arabic from CDN...`);

              const arabicResponse = await fetch(arabicFontUrl, {
                mode: "cors",
                credentials: "omit",
                cache: "force-cache",
              });

              if (arabicResponse.ok) {
                arabicFontData = await arabicResponse.arrayBuffer();
                if (arabicFontData.byteLength > 10000) {
                  console.log(`✓ Arabic font loaded from CDN: ${arabicFontData.byteLength} bytes`);
                } else {
                  const size = arabicFontData.byteLength;
                  arabicFontData = null;
                  console.warn(`CDN Arabic font too small: ${size} bytes`);
                }
              } else {
                console.error(
                  `CDN Arabic font fetch failed: ${arabicResponse.status} ${arabicResponse.statusText}`
                );
              }
            } catch (err) {
              console.error("CDN Arabic font failed:", err);
            }
          }

          // Load English font - ALWAYS load Roboto separately for proper Latin rendering
          // Noto Sans Arabic supports Latin but may have rendering issues in FFmpeg without text_shaping
          // Using Roboto for English ensures proper rendering
          const englishLocalPaths = [
            "./Roboto-Regular.ttf",
            "/Roboto-Regular.ttf",
            "Roboto-Regular.ttf",
          ];
          for (const path of englishLocalPaths) {
            try {
              console.log(`Trying local English font: ${path}`);
              const response = await fetch(path, { cache: "no-cache" });
              if (response.ok) {
                const data = await response.arrayBuffer();
                console.log(`English font response: ${data.byteLength} bytes`);
                if (data.byteLength > 10000) {
                  englishFontData = data;
                  console.log(`✓ English font loaded from local: ${data.byteLength} bytes`);
                  break;
                }
              }
            } catch (err) {
              console.warn(`Local English font ${path} failed:`, err);
              lastError = err instanceof Error ? err : new Error(String(err));
            }
          }

          // Fallback: If Roboto loading failed, try CDN or use Noto Sans Arabic
          if (!englishFontData && arabicFontData) {
            console.warn("Roboto font not found, falling back to Noto Sans Arabic for English");
            englishFontData = arabicFontData.slice(0); // Clone the buffer
            console.log(
              `✓ English font using Noto Sans Arabic fallback: ${englishFontData.byteLength} bytes`
            );
          }

          // Validation - Arabic font only required if there are Arabic captions
          if (hasArabicCaptions) {
            if (!arabicFontData || arabicFontData.byteLength < 10000) {
              throw new Error(
                `Arabic font loading failed. Size: ${arabicFontData?.byteLength || 0} bytes`
              );
            }
          }

          // English font is always required (for English-only or mixed captions)
          if (!englishFontData || englishFontData.byteLength < 10000) {
            throw new Error(
              `English font loading failed. Size: ${englishFontData?.byteLength || 0} bytes. Last error: ${lastError?.message || "Unknown"}`
            );
          }

          // If Arabic font failed but we have English font and no Arabic captions, use English font for both
          if (!arabicFontData && !hasArabicCaptions && englishFontData) {
            arabicFontData = englishFontData.slice(0); // Clone for consistency
            console.log(`Using English font as Arabic font fallback (no Arabic captions detected)`);
          }

          // Write both fonts to FFmpeg
          // Ensure both fonts are loaded before writing
          if (!arabicFontData || !englishFontData) {
            throw new Error(
              `Font data missing: arabic=${!!arabicFontData}, english=${!!englishFontData}`
            );
          }

          // Convert ArrayBuffer to Uint8Array for FFmpeg
          const arabicFontBytes = new Uint8Array(arabicFontData);
          const englishFontBytes = new Uint8Array(englishFontData);

          // Write fonts to FFmpeg virtual filesystem
          // CRITICAL: Write fonts before using them in filters
          console.log(`Writing fonts to FFmpeg filesystem...`);
          console.log(`  - arabic.ttf: ${arabicFontData.byteLength} bytes`);
          console.log(`  - default.ttf: ${englishFontData.byteLength} bytes`);

          await ffmpeg.writeFile("arabic.ttf", arabicFontBytes);
          await ffmpeg.writeFile("default.ttf", englishFontBytes);

          // Verify fonts were written correctly by reading them back
          try {
            const verifyArabic = await ffmpeg.readFile("arabic.ttf");
            const verifyEnglish = await ffmpeg.readFile("default.ttf");
            const arabicSize =
              verifyArabic instanceof Uint8Array
                ? verifyArabic.length
                : typeof verifyArabic === "string"
                  ? new TextEncoder().encode(verifyArabic).length
                  : new Uint8Array(verifyArabic as ArrayBuffer).length;
            const englishSize =
              verifyEnglish instanceof Uint8Array
                ? verifyEnglish.length
                : typeof verifyEnglish === "string"
                  ? new TextEncoder().encode(verifyEnglish).length
                  : new Uint8Array(verifyEnglish as ArrayBuffer).length;
            console.log(
              `✓ Font verification: arabic.ttf=${arabicSize} bytes, default.ttf=${englishSize} bytes`
            );

            if (
              arabicSize !== arabicFontData.byteLength ||
              englishSize !== englishFontData.byteLength
            ) {
              console.warn(
                `⚠ Font size mismatch - expected arabic=${arabicFontData.byteLength}, got=${arabicSize}, expected english=${englishFontData.byteLength}, got=${englishSize}`
              );
            }
          } catch (verifyError) {
            console.warn("⚠ Font verification failed (non-fatal):", verifyError);
          }

          console.log(`✓ Fonts written to FFmpeg successfully`);
          console.log(`✓ Mixed Arabic+English text ready!`);
        } catch (fontError) {
          console.error("Failed to load font:", fontError);
          console.error("Font error details:", {
            error: fontError instanceof Error ? fontError.message : String(fontError),
            hasArabic: hasArabicCaptions,
          });
          throw new Error(
            `FONT_LOAD_ERROR: Cannot export with captions - font loading failed. ${fontError instanceof Error ? fontError.message : String(fontError)}`
          );
        }
      }

      console.log("Using drawtext filters for captions:", {
        visibleCaptionsCount: visibleCaptions.length,
        hasArabicCaptions,
        captionTimings: visibleCaptions.map((c) => ({
          text: c.text.substring(0, 30),
          start: c.startTime,
          end: c.endTime,
          adjustedStart: Math.max(0, c.startTime - startTime),
          adjustedEnd: Math.max(0, c.endTime - startTime),
        })),
      });

      // Try with captions first (or stream copy if no captions)
      // Note: Captions are applied via drawtext filters in the video filter chain
      // Pass the full captions array - buildFFmpegCommand will filter internally
      let args = buildFFmpegCommand(
        startTime,
        duration,
        captions,
        settings,
        "input.mp4",
        "output.mp4",
        canUseStreamCopy,
        inputWidth,
        inputHeight
      );
      let uint8Data = await executeAndCheck(args);

      // If stream copy failed, fall back to re-encoding
      if (!uint8Data && canUseStreamCopy) {
        console.warn("Stream copy failed, falling back to re-encoding...");

        // Clean up failed output
        try {
          await ffmpeg.deleteFile("output.mp4");
        } catch {
          /* ignore */
        }

        // Retry without stream copy
        args = buildFFmpegCommand(
          startTime,
          duration,
          captions,
          settings,
          "input.mp4",
          "output.mp4",
          false,
          inputWidth,
          inputHeight
        );
        uint8Data = await executeAndCheck(args);
      }

      // If failed and we had captions, try without captions as fallback
      if (!uint8Data && captions.length > 0) {
        console.warn("Export with captions failed. FFmpeg logs:", this.getRecentLogs().join("\n"));
        console.warn("Attempting export without captions...");

        // Clean up failed output
        try {
          await ffmpeg.deleteFile("output.mp4");
        } catch {
          /* ignore */
        }

        // Rebuild command without captions (try stream copy first)
        args = buildFFmpegCommand(
          startTime,
          duration,
          [],
          settings,
          "input.mp4",
          "output.mp4",
          true,
          inputWidth,
          inputHeight
        );
        uint8Data = await executeAndCheck(args);

        // If stream copy failed, try re-encoding without captions
        if (!uint8Data) {
          try {
            await ffmpeg.deleteFile("output.mp4");
          } catch {
            /* ignore */
          }

          args = buildFFmpegCommand(
            startTime,
            duration,
            [],
            settings,
            "input.mp4",
            "output.mp4",
            false,
            inputWidth,
            inputHeight
          );
          uint8Data = await executeAndCheck(args);
        }

        if (uint8Data) {
          console.warn(
            "Export succeeded without captions. Captions may contain unsupported characters or require font files not available in the browser."
          );
        }
      }

      if (!uint8Data || uint8Data.length === 0) {
        const logs = this.getRecentLogs();
        console.error("FFmpeg logs:", logs.join("\n"));
        throw new Error(
          `Exported video file is empty. FFmpeg may have failed silently. Check console for FFmpeg logs.`
        );
      }

      // Create a copy of the data to ensure a proper ArrayBuffer for Blob constructor
      const blobData = new Uint8Array(uint8Data);
      const blob = new Blob([blobData], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      console.log("Export completed successfully, file size:", blob.size, "bytes");

      // Set progress to 100% on completion
      if (onProgress) {
        onProgress(100);
      }

      // Cleanup
      try {
        await ffmpeg.deleteFile("input.mp4");
        await ffmpeg.deleteFile("output.mp4");
      } catch (cleanupError) {
        console.warn("Cleanup error (non-fatal):", cleanupError);
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
    } catch (error) {
      console.error("Export error:", error);
      console.error("FFmpeg logs:", this.getRecentLogs().join("\n"));

      // Cleanup on error
      try {
        await ffmpeg.deleteFile("input.mp4");
        await ffmpeg.deleteFile("output.mp4");
      } catch (cleanupError) {
        console.warn("Cleanup error (non-fatal):", cleanupError);
      }

      // Provide more helpful error messages
      if (error instanceof Error) {
        // Font loading errors
        if (error.message.includes("FONT_LOAD_ERROR")) {
          throw new Error(error.message.replace("FONT_LOAD_ERROR: ", ""));
        }
        // Video CORS errors
        if (
          (error.message.includes("CORS") || error.message.includes("Failed to fetch video")) &&
          !error.message.includes("font")
        ) {
          throw new Error(
            "Failed to load video file. This might be a CORS (Cross-Origin) issue. The video URL must allow cross-origin requests."
          );
        }
        // FFmpeg processing errors
        if (error.message.includes("FFmpeg")) {
          throw new Error(`FFmpeg processing failed: ${error.message}`);
        }
        throw error;
      }
      throw new Error(`Export failed: ${String(error)}`);
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
