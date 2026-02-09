export class ReelVideoLoaderService {
  /**
   * Load video file and get metadata
   */
  static async loadVideo(videoUrl: string): Promise<{
    videoElement: HTMLVideoElement;
    duration: number;
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = videoUrl;

      video.addEventListener("loadedmetadata", () => {
        resolve({
          videoElement: video,
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      });

      video.addEventListener("error", (e) => {
        reject(new Error("Failed to load video"));
      });

      video.load();
    });
  }

  /**
   * Get video duration from URL
   */
  static async getVideoDuration(videoUrl: string): Promise<number> {
    const { duration } = await this.loadVideo(videoUrl);
    return duration;
  }

  /**
   * Create video element for playback
   */
  static createVideoElement(videoUrl: string): HTMLVideoElement {
    const video = document.createElement("video");
    video.src = videoUrl;
    video.controls = false;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    return video;
  }
}
