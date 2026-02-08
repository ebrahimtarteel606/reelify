"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ReelEditorProps } from "@/types";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { ReelClipDataProcessor } from "@/lib/services/ReelClipDataProcessor";
import { ElevenLabsService } from "@/lib/services/ElevenLabsService";
import { VideoPlayer } from "./VideoPlayer";
import { CaptionCanvas } from "./CaptionCanvas";
import { Timeline } from "./Timeline";
import { TranscriptionLoader } from "./TranscriptionLoader";
import { TranscriptionEditor } from "./TranscriptionEditor";
import { CaptionStyleEditor } from "./CaptionStyleEditor";
import { CaptionOnboarding } from "./CaptionOnboarding";
import { ExportButton } from "./ExportButton";
import styles from "./ReelEditor.module.css";

export function ReelEditor({
  clipData,
  theme = "light",
  aspectRatio = "9:16",
  onClipLoaded,
  onExportSuccess,
  onExportError,
}: ReelEditorProps) {
  const t = useTranslations("editor");
  const tExport = useTranslations("exportButton");
  const {
    setCurrentClip,
    currentClip,
    transcriptionState,
    setTranscriptionState,
    exportFormat,
    setExportFormat,
    includeCaptionsForExport,
    setIncludeCaptionsForExport,
    captions,
    selectedCaptionId,
    setSelectedCaptionId,
  } = useReelEditorStore();
  const [processedClipData, setProcessedClipData] = useState<
    typeof clipData | null
  >(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Show onboarding when editor loads (unless user chose "Don't show again")
  useEffect(() => {
    if (!onboardingDismissed && !showOnboarding && currentClip) {
      // Check if user chose "Don't show again" (stored in localStorage)
      const dontShow =
        typeof window !== "undefined" &&
        localStorage.getItem("reelify_caption_onboarding_dont_show") === "true";

      console.log("[Onboarding] Check:", {
        dontShow,
        currentClip: !!currentClip,
        onboardingDismissed,
        showOnboarding,
      });

      if (!dontShow) {
        // Small delay to ensure editor is fully rendered
        const timer = setTimeout(() => {
          console.log("[Onboarding] Showing onboarding");
          setShowOnboarding(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [currentClip, onboardingDismissed, showOnboarding]);

  const handleOnboardingDismiss = () => {
    setShowOnboarding(false);
    setOnboardingDismissed(true);
    // Note: The "Don't show again" preference is handled in CaptionOnboarding component
  };

  // Keyboard shortcut to reset and show onboarding (Ctrl+Shift+O or Cmd+Shift+O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "O") {
        e.preventDefault();
        // Reset onboarding state
        if (typeof window !== "undefined") {
          localStorage.removeItem("reelify_caption_onboarding_dont_show");
          console.log("[Onboarding] Reset - cleared localStorage");
        }
        setOnboardingDismissed(false);
        // Force show onboarding
        setShowOnboarding(true);
        console.log("[Onboarding] Forced to show");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Initialize clip data
  useEffect(() => {
    // Process and validate clip data
    const processed = ReelClipDataProcessor.processClipData(clipData);
    if (processed.valid && processed.processedData) {
      setProcessedClipData(processed.processedData);

      // Check if transcription is missing or empty
      const needsTranscription =
        !processed.processedData.transcription ||
        processed.processedData.transcription.segments.length === 0;

      if (needsTranscription) {
        // Trigger auto-transcription
        handleTranscription(processed.processedData);
      } else {
        // Load clip with existing transcription
        setCurrentClip(processed.processedData);
        onClipLoaded?.(processed.processedData.clipId);
      }
    } else {
      onExportError?.(new Error(processed.error || "Invalid clip data"));
    }
  }, [clipData]);

  const handleTranscription = async (clip: typeof clipData) => {
    setTranscriptionState({ status: "loading" });

    try {
      const result = await ElevenLabsService.transcribeAudio(
        clip.videoSourceUrl,
        // Language will be auto-detected
      );

      // Update clip data with transcription
      const updatedClip = {
        ...clip,
        transcription: {
          segments: result.segments,
        },
      };

      setProcessedClipData(updatedClip);
      setCurrentClip(updatedClip);
      setTranscriptionState({ status: "success" });
      onClipLoaded?.(updatedClip.clipId);
    } catch (error) {
      console.error("Transcription error:", error);
      setTranscriptionState({
        status: "error",
        error:
          error instanceof Error ? error.message : "Failed to transcribe video",
      });
    }
  };

  const handleRetry = () => {
    if (processedClipData) {
      handleTranscription(processedClipData);
    }
  };

  const handleSkip = () => {
    if (processedClipData) {
      // Continue without captions
      setCurrentClip(processedClipData);
      setTranscriptionState({ status: "success" });
      onClipLoaded?.(processedClipData.clipId);
    }
  };

  // Show transcription loader if transcribing
  if (
    transcriptionState.status === "loading" ||
    transcriptionState.status === "error"
  ) {
    return (
      <>
        <div className={`${styles.container} ${styles[theme]}`}>
          <div className={styles.editor}>
            <div className={styles.loadingMessage}>{t("preparingEditor")}</div>
          </div>
        </div>
        <TranscriptionLoader
          state={transcriptionState}
          onRetry={handleRetry}
          onSkip={handleSkip}
        />
      </>
    );
  }

  if (!currentClip) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t("loadingEditor")}</div>
      </div>
    );
  }

  // Handle clicks outside video area to deselect caption
  const handleEditorClick = (e: React.MouseEvent) => {
    // If clicking outside the video container and sidebar, deselect caption
    const target = e.target as HTMLElement;
    const videoContainer = target.closest(`.${styles.videoContainer}`);
    const sidebar = target.closest(`.${styles.sidebar}`);

    // Don't deselect if clicking inside video container or sidebar (where style editor is)
    // Also don't deselect if clicking on moveable target or canvas (caption area)
    const isMoveableTarget =
      target.closest('[class*="moveableTarget"]') ||
      target.closest('[class*="moveable"]');
    const isCanvas = target.tagName === "CANVAS";

    if (
      !videoContainer &&
      !sidebar &&
      !isMoveableTarget &&
      !isCanvas &&
      selectedCaptionId
    ) {
      setSelectedCaptionId(null);
    }
  };

  return (
    <>
      <CaptionOnboarding
        isVisible={showOnboarding}
        onDismiss={handleOnboardingDismiss}
        selectedCaptionId={selectedCaptionId}
      />
      <div
        className={`${styles.container} ${styles[theme]}`}
        onClick={handleEditorClick}
      >
        <div className={styles.editor}>
          <div className={styles.videoSection}>
            <div className={styles.videoContainer}>
              <div
                className={styles.videoPlayerWrapper}
                data-format={exportFormat}
                data-onboarding="video-area"
              >
                <VideoPlayer
                  videoUrl={currentClip.videoSourceUrl}
                  format={exportFormat}
                />
                <CaptionCanvas videoWidth={1080} videoHeight={1920} />
              </div>
            </div>
            <div data-onboarding="timeline">
              <Timeline />
            </div>
          </div>

          <div className={styles.sidebar} data-onboarding="sidebar">
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>{t("transcription")}</h2>
              {/* Caption toggle: With / Without captions (same order as preview) */}
              {captions.length > 0 && (
                <div className={styles.exportOptionsRow}>
                  <span className={styles.exportOptionsLabel}>
                    {tExport("captions")}
                  </span>
                  <div className={styles.captionToggleGroup}>
                    <button
                      type="button"
                      className={`${styles.captionToggleBtn} ${includeCaptionsForExport ? styles.captionToggleBtnActive : ""}`}
                      onClick={() => setIncludeCaptionsForExport(true)}
                      aria-pressed={includeCaptionsForExport}
                    >
                      {tExport("withCaptions")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.captionToggleBtn} ${!includeCaptionsForExport ? styles.captionToggleBtnActive : ""}`}
                      onClick={() => setIncludeCaptionsForExport(false)}
                      aria-pressed={!includeCaptionsForExport}
                    >
                      {tExport("withoutCaptions")}
                    </button>
                  </div>
                </div>
              )}
              {/* Zoom / Landscape - directly under captions like preview */}
              <div
                className={styles.exportOptionsRow}
                data-onboarding="format-toggle"
              >
                <span className={styles.exportOptionsLabel}>
                  {tExport("exportFormat")}
                </span>
                <div className={styles.captionToggleGroup}>
                  <button
                    type="button"
                    className={`${styles.captionToggleBtn} ${exportFormat === "zoom" ? styles.captionToggleBtnActive : ""}`}
                    onClick={() => setExportFormat("zoom")}
                    aria-pressed={exportFormat === "zoom"}
                  >
                    {tExport("zoom")}
                  </button>
                  <button
                    type="button"
                    className={`${styles.captionToggleBtn} ${exportFormat === "landscape" ? styles.captionToggleBtnActive : ""}`}
                    onClick={() => setExportFormat("landscape")}
                    aria-pressed={exportFormat === "landscape"}
                  >
                    {tExport("landscape")}
                  </button>
                </div>
              </div>
              <div
                className={styles.exportButtonWrapper}
                data-onboarding="export-button"
              >
                <ExportButton
                  onExportSuccess={onExportSuccess}
                  onExportError={onExportError}
                />
              </div>
            </div>

            <div
              className={styles.sidebarContent}
              data-onboarding="transcription-editor"
            >
              {selectedCaptionId ? (
                <CaptionStyleEditor />
              ) : (
                <TranscriptionEditor />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
