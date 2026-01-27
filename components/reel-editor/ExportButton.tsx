'use client';

import React, { useState } from 'react';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { ReelExportService } from '@/lib/services/ReelExportService';
import { ReelExportResult } from '@/types';
import styles from './ExportButton.module.css';

interface ExportButtonProps {
  onExportSuccess?: (result: ReelExportResult) => void;
  onExportError?: (error: Error) => void;
  quality?: 'low' | 'medium' | 'high';
}

export function ExportButton({
  onExportSuccess,
  onExportError,
  quality = 'medium',
}: ExportButtonProps) {
  const {
    currentClip,
    trimPoints,
    captions,
    isExporting,
    exportProgress,
    setIsExporting,
    setExportProgress,
  } = useReelEditorStore();

  // Check if any captions have animations
  const hasAnimations = captions.some(
    (c) => c.style.animation && c.style.animation.type !== 'none'
  );

  const handleExport = async () => {
    if (!currentClip || isExporting) return;

    // Warn about animations if present
    if (hasAnimations) {
      const confirmed = window.confirm(
        'Note: Caption animations are preview-only and will NOT be included in the exported video.\n\nContinue with export?'
      );
      if (!confirmed) return;
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
      onExportSuccess?.(result);
    } catch (error) {
      console.error('Export failed:', error);
      setIsExporting(false);
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      onExportError?.(new Error(errorMessage));
      
      // Also show alert for user feedback
      alert(`Export failed: ${errorMessage}`);
    }
  };

  return (
    <div className={styles.container}>
      {hasAnimations && !isExporting && (
        <div className={styles.warning}>
          ⚠️ Animations are preview-only and won't be exported
        </div>
      )}
      <button
        onClick={handleExport}
        disabled={!currentClip || isExporting}
        className={styles.button}
      >
        {isExporting ? (
          <>
            <span className={styles.spinner} />
            Exporting... {exportProgress}%
          </>
        ) : (
          'Export Reel'
        )}
      </button>
      {isExporting && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${exportProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}
