import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { Caption, ExportSettings, ReelExportResult } from '@/types';
import { buildFFmpegCommand, getExportSettings } from '@/lib/utils/ffmpegUtils';

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
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
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
      console.error('Failed to initialize FFmpeg:', error);
      throw new Error(`Failed to initialize FFmpeg: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    // Validate inputs
    if (!videoUrl || !videoUrl.trim()) {
      throw new Error('Video URL is required');
    }
    
    if (endTime <= startTime) {
      throw new Error(`Invalid time range: end time (${endTime}) must be greater than start time (${startTime})`);
    }
    
    if (startTime < 0) {
      throw new Error(`Invalid start time: ${startTime} (must be >= 0)`);
    }

    const ffmpeg = await this.initialize();
    const duration = endTime - startTime;
    const settings = getExportSettings(quality);
    
    console.log('Export parameters:', {
      videoUrl,
      startTime,
      endTime,
      duration,
      captionsCount: captions.length,
      quality,
      settings
    });

    // Set up progress tracking
    if (onProgress) {
      ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Clear previous logs
    this.clearLogs();
    
    try {
      console.log('Starting export:', { videoUrl, startTime, endTime, duration, captionsCount: captions.length });
      
      // Check if video URL is accessible (basic validation)
      if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://') && !videoUrl.startsWith('blob:') && !videoUrl.startsWith('data:')) {
        throw new Error(`Invalid video URL format: ${videoUrl}`);
      }
      
      // Write video file to FFmpeg virtual filesystem
      console.log('Fetching video file...');
      let videoData: Uint8Array;
      try {
        videoData = await fetchFile(videoUrl);
        if (!videoData || videoData.length === 0) {
          throw new Error('Video file is empty');
        }
        console.log('Video file fetched, size:', videoData.length, 'bytes');
      } catch (fetchError) {
        console.error('Failed to fetch video file:', fetchError);
        const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        if (errorMsg.includes('CORS') || errorMsg.includes('Failed to fetch')) {
          throw new Error(`Failed to fetch video file due to CORS or network error. The video server must allow cross-origin requests. Original error: ${errorMsg}`);
        }
        throw new Error(`Failed to fetch video file: ${errorMsg}`);
      }

      console.log('Writing video to FFmpeg filesystem...');
      await ffmpeg.writeFile('input.mp4', videoData);
      console.log('Video file written to FFmpeg filesystem');

      // Helper function to execute FFmpeg and check result
      const executeAndCheck = async (args: string[]): Promise<Uint8Array | null> => {
        console.log('FFmpeg command:', args.join(' '));
        
        try {
          await ffmpeg.exec(args);
          console.log('FFmpeg execution completed');
        } catch (execError) {
          console.error('FFmpeg execution failed:', execError);
          console.error('FFmpeg logs:', this.getRecentLogs().join('\n'));
          return null;
        }

        // Read output file
        try {
          const data = await ffmpeg.readFile('output.mp4');
          const uint8Data =
            typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
          
          if (uint8Data && uint8Data.length > 0) {
            return uint8Data;
          }
        } catch (readError) {
          console.error('Failed to read output file:', readError);
        }
        
        return null;
      };

      // Determine if we can use stream copy (no re-encoding) for faster export
      // Stream copy is nearly instant but can only be used when no filters are needed
      const visibleCaptions = captions.filter(c => c.isVisible);
      const canUseStreamCopy = visibleCaptions.length === 0;
      
      if (canUseStreamCopy) {
        console.log('No captions detected - using stream copy mode for faster export');
      }
      
      // Try with captions first (or stream copy if no captions)
      let args = buildFFmpegCommand(startTime, duration, captions, settings, 'input.mp4', 'output.mp4', canUseStreamCopy);
      let uint8Data = await executeAndCheck(args);
      
      // If stream copy failed, fall back to re-encoding
      if (!uint8Data && canUseStreamCopy) {
        console.warn('Stream copy failed, falling back to re-encoding...');
        
        // Clean up failed output
        try {
          await ffmpeg.deleteFile('output.mp4');
        } catch { /* ignore */ }
        
        // Retry without stream copy
        args = buildFFmpegCommand(startTime, duration, captions, settings, 'input.mp4', 'output.mp4', false);
        uint8Data = await executeAndCheck(args);
      }
      
      // If failed and we had captions, try without captions as fallback
      if (!uint8Data && captions.length > 0) {
        console.warn('Export with captions failed. FFmpeg logs:', this.getRecentLogs().join('\n'));
        console.warn('Attempting export without captions...');
        
        // Clean up failed output
        try {
          await ffmpeg.deleteFile('output.mp4');
        } catch { /* ignore */ }
        
        // Rebuild command without captions (try stream copy first)
        args = buildFFmpegCommand(startTime, duration, [], settings, 'input.mp4', 'output.mp4', true);
        uint8Data = await executeAndCheck(args);
        
        // If stream copy failed, try re-encoding without captions
        if (!uint8Data) {
          try {
            await ffmpeg.deleteFile('output.mp4');
          } catch { /* ignore */ }
          
          args = buildFFmpegCommand(startTime, duration, [], settings, 'input.mp4', 'output.mp4', false);
          uint8Data = await executeAndCheck(args);
        }
        
        if (uint8Data) {
          console.warn('Export succeeded without captions. Captions may contain unsupported characters or require font files not available in the browser.');
        }
      }
      
      if (!uint8Data || uint8Data.length === 0) {
        const logs = this.getRecentLogs();
        console.error('FFmpeg logs:', logs.join('\n'));
        throw new Error(`Exported video file is empty. FFmpeg may have failed silently. Check console for FFmpeg logs.`);
      }
      
      // Create a copy of the data to ensure a proper ArrayBuffer for Blob constructor
      const blobData = new Uint8Array(uint8Data);
      const blob = new Blob([blobData], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      console.log('Export completed successfully, file size:', blob.size, 'bytes');

      // Cleanup
      try {
        await ffmpeg.deleteFile('input.mp4');
        await ffmpeg.deleteFile('output.mp4');
      } catch (cleanupError) {
        console.warn('Cleanup error (non-fatal):', cleanupError);
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
      console.error('Export error:', error);
      console.error('FFmpeg logs:', this.getRecentLogs().join('\n'));
      
      // Cleanup on error
      try {
        await ffmpeg.deleteFile('input.mp4');
        await ffmpeg.deleteFile('output.mp4');
      } catch (cleanupError) {
        console.warn('Cleanup error (non-fatal):', cleanupError);
      }
      
      // Provide more helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('CORS') || error.message.includes('fetch')) {
          throw new Error('Failed to load video file. This might be a CORS (Cross-Origin) issue. The video URL must allow cross-origin requests.');
        }
        if (error.message.includes('FFmpeg')) {
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
