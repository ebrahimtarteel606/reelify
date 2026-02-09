"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";

export function useVideoPlayer(videoUrl: string | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isPlaying, trimPoints, setCurrentPlayheadTime, setIsPlaying, setSourceVideoDuration } =
    useReelEditorStore();

  // Load video
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    const video = videoRef.current;

    // Cancel any pending play() promises when URL changes
    // This prevents AbortError when navigating between reels
    video.pause();

    // Set crossOrigin for CORS support (needed for canvas operations)
    video.crossOrigin = "anonymous";

    // Set video source and load
    video.src = videoUrl;
    video.load();

    const handleLoadedMetadata = () => {
      setIsReady(true);
      setError(null);
      // Update source video duration from actual video element
      if (video.duration && !Number.isNaN(video.duration) && Number.isFinite(video.duration)) {
        setSourceVideoDuration(video.duration);
        // Get the latest trim points after duration update (Zustand updates are synchronous)
        const latestTrimPoints = useReelEditorStore.getState().trimPoints;
        // Set initial time to trim start, ensuring it's within valid bounds
        const initialTime = Math.max(0, Math.min(latestTrimPoints.startTime, video.duration));
        video.currentTime = initialTime;
        setCurrentPlayheadTime(initialTime);
      } else if (trimPoints.startTime > 0) {
        // If duration is invalid, still try to set initial time
        video.currentTime = trimPoints.startTime;
        setCurrentPlayheadTime(trimPoints.startTime);
      }
      // If duration is invalid and startTime is 0 or less, video will start at 0
    };

    const handleError = () => {
      const videoError = video.error;
      let errorMessage = "Failed to load video";

      if (videoError) {
        switch (videoError.code) {
          case videoError.MEDIA_ERR_ABORTED:
            errorMessage = "Video loading was aborted";
            break;
          case videoError.MEDIA_ERR_NETWORK:
            errorMessage = "Network error: Video file not found (404) or network issue";
            break;
          case videoError.MEDIA_ERR_DECODE:
            errorMessage = "Video decode error: File may be corrupted";
            break;
          case videoError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = "Video format not supported";
            break;
          default:
            errorMessage = `Video error (code ${videoError.code}): ${videoUrl}`;
        }
      } else {
        // Check if it's likely a 404
        errorMessage = `Video not found (404): ${videoUrl}`;
      }

      console.error("Video loading error:", {
        error: videoError,
        code: videoError?.code,
        message: errorMessage,
        url: videoUrl,
      });

      setError(new Error(errorMessage));
      setIsReady(false);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.addEventListener("loadstart", () => {
      setIsReady(false);
      setError(null);
    });

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      video.removeEventListener("loadstart", () => {
        setIsReady(false);
        setError(null);
      });
    };
  }, [videoUrl, trimPoints.startTime, setCurrentPlayheadTime, setSourceVideoDuration]);

  // Sync playhead with video and enforce trim boundaries
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    const handleTimeUpdate = () => {
      const currentTime = video.currentTime;

      // Enforce trim boundaries strictly
      if (currentTime >= trimPoints.endTime) {
        // Reached end of trim - pause and reset to start
        video.pause();
        video.currentTime = trimPoints.startTime;
        setIsPlaying(false);
        setCurrentPlayheadTime(trimPoints.startTime);
      } else if (currentTime < trimPoints.startTime) {
        // Before trim start - clamp to start
        video.currentTime = trimPoints.startTime;
        setCurrentPlayheadTime(trimPoints.startTime);
      } else {
        // Within trim bounds - update playhead
        setCurrentPlayheadTime(currentTime);
      }
    };

    // Use both timeupdate and seeking events for better accuracy
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("seeked", handleTimeUpdate);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("seeked", handleTimeUpdate);
    };
  }, [trimPoints, setCurrentPlayheadTime, setIsPlaying]);

  // Play/pause control with trim boundary enforcement
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    if (isPlaying) {
      // Ensure we're within trim bounds before playing
      const currentTime = video.currentTime;

      if (currentTime < trimPoints.startTime || currentTime >= trimPoints.endTime) {
        // If outside trim bounds, start from trim start
        video.currentTime = trimPoints.startTime;
        setCurrentPlayheadTime(trimPoints.startTime);
      }

      // Play the video
      const playPromise = video.play();

      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // AbortError is expected when video URL changes (navigation between reels)
          // Don't treat it as a real error
          if (err instanceof Error && err.name === "AbortError") {
            // This is normal - the play() was interrupted by a new load request
            // Just reset playing state, don't log as error
            setIsPlaying(false);
            return;
          }
          // For other errors, log and handle normally
          console.error("Error playing video:", err);
          setError(err instanceof Error ? err : new Error("Failed to play video"));
          setIsPlaying(false);
        });
      }
    } else {
      video.pause();
    }
  }, [isPlaying, setIsPlaying, trimPoints, setCurrentPlayheadTime]);

  // Update video time when trim points change
  useEffect(() => {
    if (!videoRef.current || !isReady) return;

    const video = videoRef.current;
    // If current time is outside new trim bounds, adjust it
    if (video.currentTime < trimPoints.startTime) {
      video.currentTime = trimPoints.startTime;
      setCurrentPlayheadTime(trimPoints.startTime);
    } else if (video.currentTime > trimPoints.endTime) {
      video.currentTime = trimPoints.endTime;
      setCurrentPlayheadTime(trimPoints.endTime);
    }
  }, [trimPoints.startTime, trimPoints.endTime, isReady, setCurrentPlayheadTime]);

  // Seek to time (clamped to trim bounds)
  const seekTo = useCallback(
    (time: number) => {
      if (!videoRef.current) return;
      const clampedTime = Math.max(trimPoints.startTime, Math.min(trimPoints.endTime, time));
      videoRef.current.currentTime = clampedTime;
      setCurrentPlayheadTime(clampedTime);
    },
    [trimPoints, setCurrentPlayheadTime]
  );

  // Play
  const play = useCallback(() => {
    setIsPlaying(true);
  }, [setIsPlaying]);

  // Pause
  const pause = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  return {
    videoRef,
    isReady,
    error,
    seekTo,
    play,
    pause,
    togglePlayPause,
  };
}
