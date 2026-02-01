'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { ReelExportService } from '@/lib/services/ReelExportService';
import { ReelExportResult, ExportFormatOptions } from '@/types';
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
    exportFormat,
  } = useReelEditorStore();

  const { authStatus, isLoading: isAuthLoading, authenticate, logout } = useAuthStatus();

  // UI state — export/publish options are independent of CTA platform selection
  const [showDropdown, setShowDropdown] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [exportedResult, setExportedResult] = useState<ReelExportResult | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Set mounted state for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showDropdown && buttonRef.current && mounted) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + 8,
            left: rect.left,
            width: rect.width,
          });
        }
      };
      
      updatePosition();
      globalThis.window.addEventListener('scroll', updatePosition, true);
      globalThis.window.addEventListener('resize', updatePosition);
      
      return () => {
        globalThis.window.removeEventListener('scroll', updatePosition, true);
        globalThis.window.removeEventListener('resize', updatePosition);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [showDropdown, mounted]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Auth helpers per publishable platform (user can export/publish to any platform)
  const isAuthenticatedFor = (p: typeof PUBLISHABLE_PLATFORMS[number]) =>
    p === 'youtube' ? authStatus.youtube : authStatus.facebook;

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
      
      const formatOptions: ExportFormatOptions = {
        format: exportFormat,
        reframing: {
          mode: 'smart',
          enabled: true,
        },
      };
      
      // Log caption state before export
      console.log('[ExportButton] Caption state before export:', {
        totalCaptions: captions.length,
        visibleCaptions: captions.filter((c) => c.isVisible).length,
        trimRange: `${trimPoints.startTime.toFixed(2)} - ${trimPoints.endTime.toFixed(2)}`,
        captionDetails: captions.map(c => ({
          id: c.id,
          text: c.text.substring(0, 30),
          isVisible: c.isVisible,
          startTime: c.startTime,
          endTime: c.endTime,
          overlapsTrim: c.startTime < trimPoints.endTime && c.endTime > trimPoints.startTime
        }))
      });
      
      const result = await ReelExportService.exportVideo(
        currentClip.videoSourceUrl,
        trimPoints.startTime,
        trimPoints.endTime,
        captions.filter((c) => c.isVisible),
        currentClip.clipId,
        quality,
        (progress) => setExportProgress(progress),
        formatOptions
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
   * Handle publish action for a specific platform (user chooses at export time)
   */
  const handlePublish = async (targetPlatform: typeof PUBLISHABLE_PLATFORMS[number]) => {
    setShowDropdown(false);

    // Check if authenticated for this platform
    if (!isAuthenticatedFor(targetPlatform)) {
      authenticate(targetPlatform as Platform);
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
      formData.append('title', currentClip?.metadata?.title || t('defaultReelTitle'));
      formData.append('description', currentClip?.metadata?.description || '');
      
      if (targetPlatform === 'youtube') {
        formData.append('privacyStatus', 'public');
      }

      setPublishProgress(30);

      const response = await fetch(`/api/publish/${targetPlatform}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setPublishProgress(80);

      const data = await response.json();

      if (!response.ok) {
        if (data.needsReauth) {
          authenticate(targetPlatform as Platform);
          return;
        }
        throw new Error(data.error || 'Publishing failed');
      }

      setPublishProgress(100);

      const platformLabel = PLATFORM_LABELS[targetPlatform];
      const postUrl = data.videoUrl || data.postUrl;
      
      alert(t('publishSuccess', { platform: platformLabel, url: postUrl }));
      
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
   * Handle logout for a specific platform
   */
  const handleLogout = async (targetPlatform: typeof PUBLISHABLE_PLATFORMS[number]) => {
    await logout(targetPlatform as Platform);
    setShowDropdown(false);
  };

  // Determine button state
  const isProcessing = isExporting || isPublishing;
  const progressValue = isExporting ? exportProgress : publishProgress;
  const statusText = isExporting 
    ? t('exporting', { progress: exportProgress })
    : isPublishing 
      ? t('publishing', { progress: publishProgress })
      : null;

  // Always show dropdown: Download + Publish to any supported platform (independent of CTA selection)
  return (
    <div className={styles.container} ref={dropdownRef}>
      {hasAnimations && !isProcessing && (
        <div className={styles.warning}>
          {t('animationWarning')}
        </div>
      )}
      
      <div className={styles.dropdownContainer}>
        <button
          ref={buttonRef}
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={!currentClip || isProcessing}
          className={styles.button}
          aria-expanded={showDropdown}
        >
          {isProcessing ? (
            <>
              <span className={styles.spinner} />
              {statusText}
            </>
          ) : (
            <>
              {t('exportReel')}
              <ChevronDown className={styles.dropdownArrow} />
            </>
          )}
        </button>

        {showDropdown && !isProcessing && dropdownPosition && mounted && createPortal(
          <div 
            ref={dropdownRef}
            className={styles.dropdown}
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
          >
            <button
              className={styles.dropdownItem}
              onClick={handleDownload}
            >
              <span className={styles.dropdownIcon}>⬇️</span>
              {t('download')}
            </button>
            
            {PUBLISHABLE_PLATFORMS.map((p) => {
              const label = PLATFORM_LABELS[p];
              const isAuth = isAuthenticatedFor(p);
              return (
                <React.Fragment key={p}>
                  <div className={styles.dropdownDivider} />
                  <button
                    className={styles.dropdownItem}
                    onClick={() => handlePublish(p)}
                  >
                    <span className={styles.dropdownIcon}>
                      {p === 'youtube' ? '🎬' : '📘'}
                    </span>
                    {isAuth
                      ? t('publishTo', { platform: label })
                      : t('connect', { platform: label })}
                  </button>
                  {isAuth && (
                    <button
                      className={`${styles.dropdownItem} ${styles.dropdownItemSecondary}`}
                      onClick={() => handleLogout(p)}
                    >
                      <span className={styles.dropdownIcon}>🚪</span>
                      {t('disconnect', { platform: label })}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>,
          document.body!
        )}
      </div>

      {/* Auth status: show which platforms are connected */}
      {!isAuthLoading && (authStatus.youtube || authStatus.facebook) && (
        <div className={styles.authStatus}>
          ✓{' '}
          {[authStatus.youtube && PLATFORM_LABELS.youtube, authStatus.facebook && PLATFORM_LABELS.facebook]
            .filter((n): n is string => Boolean(n))
            .map((name) => t('connectedTo', { platform: name }))
            .join(' · ')}
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
