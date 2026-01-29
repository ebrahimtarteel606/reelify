'use client';

import React from 'react';
import { useVideoPlayer } from '@/lib/hooks/useVideoPlayer';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { secondsToTimecode } from '@/lib/utils/timecodeUtils';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  videoUrl: string | null;
  className?: string;
}

export function VideoPlayer({ videoUrl, className }: VideoPlayerProps) {
  const { videoRef, isReady, error, togglePlayPause, seekTo, play } = useVideoPlayer(videoUrl);
  const { isPlaying, trimPoints, currentPlayheadTime } = useReelEditorStore();

  const handlePlayPause = () => {
    togglePlayPause();
  };

  const handleReplay = () => {
    seekTo(trimPoints.startTime);
    play();
  };

  return (
    <div className={`${styles.container} ${className || ''}`}>
      <div className={styles.videoWrapper} id="video-player-wrapper">
        <video
          ref={videoRef}
          className={styles.video}
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          onError={(e) => {
            console.error('Video loading error:', e);
            const video = e.currentTarget;
            const error = video.error;
            if (error) {
              let errorMessage = 'Error loading video';
              switch (error.code) {
                case error.MEDIA_ERR_ABORTED:
                  errorMessage = 'Video loading aborted';
                  break;
                case error.MEDIA_ERR_NETWORK:
                  errorMessage = 'Network error loading video';
                  break;
                case error.MEDIA_ERR_DECODE:
                  errorMessage = 'Video decode error';
                  break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                  errorMessage = 'Video format not supported';
                  break;
              }
              console.error('Video error details:', errorMessage, video.error);
            }
          }}
        />
        {!isReady && (
          <div className={styles.loading}>
            <p>Loading video...</p>
          </div>
        )}
        {error && (
          <div className={styles.error}>
            <p>{error.message || 'Error loading video'}</p>
            {videoUrl && (
              <p className={styles.errorUrl} style={{ fontSize: '11px', marginTop: '8px', opacity: 0.8 }}>
                URL: {videoUrl.length > 60 ? videoUrl.substring(0, 60) + '...' : videoUrl}
              </p>
            )}
          </div>
        )}
      </div>
      {/* Controls bar - below video */}
      <div className={styles.controls}>
        <button
          className={`${styles.controlButton} ${styles.playButton}`}
          onClick={handlePlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          className={styles.controlButton}
          onClick={handleReplay}
          aria-label="Replay"
          title="إعادة التشغيل"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <div className={styles.timeDisplay}>
          <span className={styles.currentTime}>{secondsToTimecode(currentPlayheadTime - trimPoints.startTime)}</span>
          <span className={styles.separator}> / </span>
          <span className={styles.totalTime}>{secondsToTimecode(trimPoints.endTime - trimPoints.startTime)}</span>
        </div>
      </div>
    </div>
  );
}
