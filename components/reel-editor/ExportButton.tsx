'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { ReelExportService } from '@/lib/services/ReelExportService';
import { ReelExportResult } from '@/types';
import { useAuthStatus, Platform } from '@/lib/hooks/useAuthStatus';
import styles from './ExportButton.module.css';

interface ExportButtonProps {
  onExportSuccess?: (result: ReelExportResult) => void;
  onExportError?: (error: Error) => void;
  quality?: 'low' | 'medium' | 'high';
}

type SelectedPlatform = 'instagram' | 'tiktok' | 'youtube' | 'snapchat' | 'facebook' | 'linkedin';

const PUBLISHABLE_PLATFORMS: SelectedPlatform[] = ['youtube', 'facebook'];

const PLATFORM_LABELS: Record<SelectedPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  snapchat: 'Snapchat',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

export function ExportButton({
  onExportSuccess,
  onExportError,
  quality = 'medium',
}: ExportButtonProps) {
  const t = useTranslations('exportButton');
  const {
    currentClip,
    trimPoints,
    captions,
    isExporting,
    exportProgress,
    setIsExporting,
    setExportProgress,
  } = useReelEditorStore();

  const { authStatus, isLoading: isAuthLoading, authenticate, logout } = useAuthStatus();

  // Platform from sessionStorage
  const [platform, setPlatform] = useState<SelectedPlatform | null>(null);
  
  // UI state
  const [showDropdown, setShowDropdown] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [exportedResult, setExportedResult] = useState<ReelExportResult | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load platform from sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPlatform = sessionStorage.getItem('reelify_platform') as SelectedPlatform | null;
      if (storedPlatform) {
        setPlatform(storedPlatform);
      }
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if platform supports direct publishing
  const canPublish = platform && PUBLISHABLE_PLATFORMS.includes(platform);
  const isAuthenticated = platform === 'youtube' ? authStatus.youtube : platform === 'facebook' ? authStatus.facebook : false;

  // Check if any captions have animations
  const hasAnimations = captions.some(
    (c) => c.style.animation && c.style.animation.type !== 'none'
  );

  /**
   * Export video and return the result
   */
  const handleExport = async (): Promise<ReelExportResult | null> => {
    if (!currentClip || isExporting) return null;

    // Warn about animations if present
    if (hasAnimations) {
      const confirmed = window.confirm(t('animationConfirm'));
      if (!confirmed) return null;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      console.log('Export button clicked, starting export...');
      const result = await ReelExportService.exportVideo(
        currentClip.videoSourceUrl,
        trimPoints.startTime,
        trimPoints.endTime,
        captions.filter((c) => c.isVisible),
        currentClip.clipId,
        quality,
        (progress) => setExportProgress(progress)
      );

      console.log('Export successful:', result);
      setIsExporting(false);
      setExportedResult(result);
      return result;
    } catch (error) {
      console.error('Export failed:', error);
      setIsExporting(false);
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      onExportError?.(new Error(errorMessage));
      alert(t('exportFailed', { error: errorMessage }));
      return null;
    }
  };

  /**
   * Handle download action
   */
  const handleDownload = async () => {
    setShowDropdown(false);
    const result = await handleExport();
    if (result) {
      onExportSuccess?.(result);
    }
  };

  /**
   * Handle publish action
   */
  const handlePublish = async () => {
    setShowDropdown(false);

    if (!platform || !canPublish) return;

    // Check if authenticated
    if (!isAuthenticated) {
      authenticate(platform as Platform);
      return;
    }

    // Export first if not already exported
    let result = exportedResult;
    if (!result) {
      result = await handleExport();
      if (!result) return;
    }

    // Publish to platform
    setIsPublishing(true);
    setPublishProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', result.videoBlob, 'reel.mp4');
      formData.append('title', currentClip?.metadata?.title || 'My Reel');
      formData.append('description', currentClip?.metadata?.description || '');
      
      if (platform === 'youtube') {
        formData.append('privacyStatus', 'public');
      }

      setPublishProgress(30);

      const response = await fetch(`/api/publish/${platform}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setPublishProgress(80);

      const data = await response.json();

      if (!response.ok) {
        if (data.needsReauth) {
          // Need to re-authenticate
          authenticate(platform as Platform);
          return;
        }
        throw new Error(data.error || 'Publishing failed');
      }

      setPublishProgress(100);

      // Success
      const platformLabel = PLATFORM_LABELS[platform];
      const postUrl = data.videoUrl || data.postUrl;
      
      alert(t('publishSuccess', { platform: platformLabel, url: postUrl }));
      
      // Open in new tab
      if (postUrl) {
        window.open(postUrl, '_blank');
      }

    } catch (error) {
      console.error('Publish failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Publishing failed';
      onExportError?.(new Error(errorMessage));
      alert(t('publishFailed', { error: errorMessage }));
    } finally {
      setIsPublishing(false);
      setPublishProgress(0);
    }
  };

  /**
   * Handle logout
   */
  const handleLogout = async () => {
    if (platform && canPublish) {
      await logout(platform as Platform);
      setShowDropdown(false);
    }
  };

  // Determine button state
  const isProcessing = isExporting || isPublishing;
  const progressValue = isExporting ? exportProgress : publishProgress;
  const statusText = isExporting 
    ? t('exporting', { progress: exportProgress })
    : isPublishing 
      ? t('publishing', { progress: publishProgress })
      : null;

  // For non-publishable platforms, show simple export button
  if (!canPublish) {
    return (
      <div className={styles.container}>
        {hasAnimations && !isProcessing && (
          <div className={styles.warning}>
            {t('animationWarning')}
          </div>
        )}
        <button
          onClick={handleDownload}
          disabled={!currentClip || isProcessing}
          className={styles.button}
        >
          {isProcessing ? (
            <>
              <span className={styles.spinner} />
              {statusText}
            </>
          ) : (
            t('exportReel')
          )}
        </button>
        {isProcessing && (
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progressValue}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // For YouTube/Facebook, show dropdown with options
  const platformLabel = PLATFORM_LABELS[platform];

  return (
    <div className={styles.container} ref={dropdownRef}>
      {hasAnimations && !isProcessing && (
        <div className={styles.warning}>
          {t('animationWarning')}
        </div>
      )}
      
      <div className={styles.dropdownContainer}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={!currentClip || isProcessing}
          className={styles.button}
        >
          {isProcessing ? (
            <>
              <span className={styles.spinner} />
              {statusText}
            </>
          ) : (
            <>
              {t('exportReel')}
              <span className={styles.dropdownArrow}>▼</span>
            </>
          )}
        </button>

        {showDropdown && !isProcessing && (
          <div className={styles.dropdown}>
            <button
              className={styles.dropdownItem}
              onClick={handleDownload}
            >
              <span className={styles.dropdownIcon}>⬇️</span>
              {t('download')}
            </button>
            
            <div className={styles.dropdownDivider} />
            
            <button
              className={styles.dropdownItem}
              onClick={handlePublish}
            >
              <span className={styles.dropdownIcon}>
                {platform === 'youtube' ? '🎬' : '📘'}
              </span>
              {isAuthenticated 
                ? t('publishTo', { platform: platformLabel })
                : t('connect', { platform: platformLabel })}
            </button>

            {isAuthenticated && (
              <>
                <div className={styles.dropdownDivider} />
                <button
                  className={`${styles.dropdownItem} ${styles.dropdownItemSecondary}`}
                  onClick={handleLogout}
                >
                  <span className={styles.dropdownIcon}>🚪</span>
                  {t('disconnect', { platform: platformLabel })}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Auth status indicator */}
      {!isAuthLoading && isAuthenticated && (
        <div className={styles.authStatus}>
          ✓ {t('connectedTo', { platform: platformLabel })}
        </div>
      )}

      {isProcessing && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progressValue}%` }}
          />
        </div>
      )}
    </div>
  );
}
