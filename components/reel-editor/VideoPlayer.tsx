'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play, Refresh2 } from 'vuesax-icons-react';
import { useVideoPlayer } from '@/lib/hooks/useVideoPlayer';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { secondsToTimecode } from '@/lib/utils/timecodeUtils';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  videoUrl: string | null;
  className?: string;
  format?: 'zoom' | 'landscape';
}

export function VideoPlayer({ videoUrl, className, format = 'zoom' }: VideoPlayerProps) {
  const t = useTranslations('videoPlayer');
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
          className={`${styles.video} ${format === 'zoom' ? styles.videoZoom : styles.videoLandscape}`}
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          onError={(e) => {
            console.error('Video loading error:', e);
            const video = e.currentTarget;
            const videoError = video.error;
            if (videoError) {
              let errorMessage = t('errorLoading');
              switch (videoError.code) {
                case videoError.MEDIA_ERR_ABORTED:
                  errorMessage = t('errorAborted');
                  break;
                case videoError.MEDIA_ERR_NETWORK:
                  errorMessage = t('errorNetwork');
                  break;
                case videoError.MEDIA_ERR_DECODE:
                  errorMessage = t('errorDecode');
                  break;
                case videoError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                  errorMessage = t('errorFormat');
                  break;
              }
              console.error('Video error details:', errorMessage, video.error);
            }
          }}
        />
        {!isReady && (
          <div className={styles.loading}>
            <p>{t('loadingVideo')}</p>
          </div>
        )}
        {error && (
          <div className={styles.error}>
            <p>{error.message || t('errorLoading')}</p>
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
          aria-label={isPlaying ? t('pause') : t('play')}
          title={isPlaying ? t('pause') : t('play')}
        >
          {isPlaying ? (
            <Pause size={14} variant="Bold" />
          ) : (
            <Play size={14} variant="Bold" />
          )}
        </button>
        <button
          className={styles.controlButton}
          onClick={handleReplay}
          aria-label={t('replay')}
          title={t('replay')}
        >
          <Refresh2 size={14} variant="Bold" />
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
