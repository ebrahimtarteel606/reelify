"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ReceiveSquare } from "vuesax-icons-react";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { ReelExportResult } from "@/types";
import { ExportPanel } from "./ExportPanel";
import styles from "./ExportButton.module.css";

interface ExportButtonProps {
  onExportSuccess?: (result: ReelExportResult) => void;
  onExportError?: (error: Error) => void;
}

export function ExportButton({
  onExportSuccess,
  onExportError,
}: ExportButtonProps) {
  const t = useTranslations("exportButton");
  const tCommon = useTranslations("common");
  const {
    currentClip,
    trimPoints,
    captions,
    isExporting,
    exportProgress,
    setIsExporting,
    setExportProgress,
    exportFormat,
    isEditingTranscription,
  } = useReelEditorStore();

  // UI state
  const [showPanel, setShowPanel] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close panel when user starts editing transcription
  useEffect(() => {
    if (isEditingTranscription && showPanel) {
      setShowPanel(false);
    }
  }, [isEditingTranscription, showPanel]);

  // Check if any captions have animations
  const hasAnimations = captions.some(
    (c) => c.style.animation && c.style.animation.type !== "none"
  );

  // Determine button state
  const isProcessing = isExporting;
  const statusText = isExporting
    ? t("exporting", { progress: exportProgress })
    : null;

  const handleExportStart = () => {
    setIsExporting(true);
    setExportProgress(0);
  };

  const handleExportProgress = (progress: number) => {
    setExportProgress(progress);
  };

  const handleExportComplete = (result: ReelExportResult) => {
    setIsExporting(false);
    onExportSuccess?.(result);
  };

  const handleExportError = (error: Error) => {
    setIsExporting(false);
    onExportError?.(error);
  };

  return (
    <div className={styles.container}>
      {hasAnimations && !isProcessing && (
        <div className={styles.warning}>{t("animationWarning")}</div>
      )}

      {/* Main Export Button */}
      <button
        ref={buttonRef}
        onClick={() => setShowPanel(!showPanel)}
        disabled={!currentClip || isProcessing || isEditingTranscription}
        className={styles.button}
        aria-expanded={showPanel}
        title={
          isEditingTranscription
            ? tCommon("disabledWhileEditingTranscription")
            : undefined
        }
      >
        {isProcessing ? (
          <>
            <span className={styles.spinner} />
            {statusText}
          </>
        ) : (
          <>
            <ReceiveSquare size={18} />
            {t("exportReel")}
          </>
        )}
      </button>

      {/* Export Panel */}
      {currentClip && !isEditingTranscription && (
        <ExportPanel
          isOpen={showPanel && !isProcessing}
          onClose={() => setShowPanel(false)}
          videoUrl={currentClip.videoSourceUrl}
          startTime={trimPoints.startTime}
          endTime={trimPoints.endTime}
          captions={captions.filter((c) => c.isVisible)}
          title={currentClip.metadata?.title}
          description={currentClip.metadata?.description}
          clipId={currentClip.clipId}
          exportFormat={exportFormat}
          onExportSuccess={handleExportComplete}
          onExportError={handleExportError}
          onExportStart={handleExportStart}
          onExportProgress={handleExportProgress}
        />
      )}

      {/* Progress Bar */}
      {isProcessing && (
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
