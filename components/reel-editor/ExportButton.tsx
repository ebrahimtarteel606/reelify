"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Download, X, Check } from "lucide-react";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { ReelExportService } from "@/lib/services/ReelExportService";
import { ReelExportResult, ExportFormatOptions } from "@/types";
import { useAuthStatus, Platform } from "@/lib/hooks/useAuthStatus";
import { playSuccessSound } from "@/lib/utils/audioUtils";
import styles from "./ExportButton.module.css";

interface ExportButtonProps {
  onExportSuccess?: (result: ReelExportResult) => void;
  onExportError?: (error: Error) => void;
}

type SelectedPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "snapchat"
  | "facebook"
  | "linkedin"
  | "download";

const PUBLISHABLE_PLATFORMS: SelectedPlatform[] = ["youtube", "facebook"];

const PLATFORM_CONFIG: Record<
  SelectedPlatform,
  { label: string; icon: string; color: string; gradient: string }
> = {
  download: {
    label: "Download",
    icon: "💾",
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  },
  instagram: {
    label: "Instagram",
    icon: "📸",
    color: "#E1306C",
    gradient: "linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)",
  },
  tiktok: {
    label: "TikTok",
    icon: "🎵",
    color: "#000000",
    gradient: "linear-gradient(135deg, #00f2ea 0%, #ff0050 100%)",
  },
  youtube: {
    label: "YouTube",
    icon: "▶️",
    color: "#FF0000",
    gradient: "linear-gradient(135deg, #FF0000 0%, #CC0000 100%)",
  },
  snapchat: {
    label: "Snapchat",
    icon: "👻",
    color: "#FFFC00",
    gradient: "linear-gradient(135deg, #FFFC00 0%, #FFE600 100%)",
  },
  facebook: {
    label: "Facebook",
    icon: "📘",
    color: "#1877F2",
    gradient: "linear-gradient(135deg, #1877F2 0%, #0d65d9 100%)",
  },
  linkedin: {
    label: "LinkedIn",
    icon: "💼",
    color: "#0A66C2",
    gradient: "linear-gradient(135deg, #0A66C2 0%, #004182 100%)",
  },
};

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

  const { authStatus, authenticate, logout } = useAuthStatus();

  // UI state
  const [showPanel, setShowPanel] = useState(false);
  const [selectedPlatform, setSelectedPlatform] =
    useState<SelectedPlatform>("download");
  const [includeCaptions, setIncludeCaptions] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [exportedResult, setExportedResult] = useState<ReelExportResult | null>(
    null,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  // Set mounted state for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close panel when user starts editing transcription
  useEffect(() => {
    if (isEditingTranscription && showPanel) {
      setShowPanel(false);
    }
  }, [isEditingTranscription, showPanel]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!showPanel) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setShowPanel(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPanel]);

  // Close on escape key
  useEffect(() => {
    if (!showPanel) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowPanel(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showPanel]);

  // Auth helpers per publishable platform (user can export/publish to any platform)
  const isAuthenticatedFor = (p: SelectedPlatform) => {
    if (p === "youtube") return authStatus.youtube;
    if (p === "facebook") return authStatus.facebook;
    return false;
  };

  // Check if any captions have animations
  const hasAnimations = captions.some(
    (c) => c.style.animation && c.style.animation.type !== "none",
  );

  // Check if captions exist
  const hasCaptions = captions.length > 0;

  /**
   * Export video and return the result
   */
  const handleExport = async (
    withCaptions: boolean = true,
  ): Promise<ReelExportResult | null> => {
    if (!currentClip || isExporting) return null;

    // Warn about animations if present and captions are included
    if (withCaptions && hasAnimations) {
      const confirmed = window.confirm(t("animationConfirm"));
      if (!confirmed) return null;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      console.log("Export button clicked, starting export...");

      const formatOptions: ExportFormatOptions = {
        format: exportFormat,
        reframing: {
          mode: "smart",
          enabled: true,
        },
      };

      // Filter captions based on user choice
      const captionsToExport = withCaptions
        ? captions.filter((c) => c.isVisible)
        : [];

      // Log caption state before export
      console.log("[ExportButton] Caption state before export:", {
        totalCaptions: captions.length,
        visibleCaptions: captions.filter((c) => c.isVisible).length,
        exportingWithCaptions: withCaptions,
        captionsToExport: captionsToExport.length,
        trimRange: `${trimPoints.startTime.toFixed(
          2,
        )} - ${trimPoints.endTime.toFixed(2)}`,
        captionDetails: captions.map((c) => ({
          id: c.id,
          text: c.text.substring(0, 30),
          isVisible: c.isVisible,
          startTime: c.startTime,
          endTime: c.endTime,
          overlapsTrim:
            c.startTime < trimPoints.endTime &&
            c.endTime > trimPoints.startTime,
        })),
      });

      const result = await ReelExportService.exportVideo(
        currentClip.videoSourceUrl,
        trimPoints.startTime,
        trimPoints.endTime,
        captionsToExport,
        currentClip.clipId,
        (progress) => setExportProgress(progress),
        formatOptions,
      );

      console.log("Export successful:", result);
      setIsExporting(false);
      setExportedResult(result);
      
      // Play congratulation sound when export is ready
      playSuccessSound();
      
      return result;
    } catch (error) {
      console.error("Export failed:", error);
      setIsExporting(false);
      const errorMessage =
        error instanceof Error ? error.message : "Export failed";
      onExportError?.(new Error(errorMessage));
      alert(t("exportFailed", { error: errorMessage }));
      return null;
    }
  };

  /**
   * Handle download action
   */
  const handleDownload = async () => {
    setShowPanel(false);
    const result = await handleExport(includeCaptions);
    if (result) {
      onExportSuccess?.(result);
    }
  };

  /**
   * Handle the main export/publish action based on selected platform
   */
  const handleExportAction = async () => {
    if (selectedPlatform === "download") {
      await handleDownload();
      return;
    }

    // For social platforms, publish
    await handlePublish(selectedPlatform);
  };

  /**
   * Handle publish action for a specific platform (user chooses at export time)
   */
  const handlePublish = async (targetPlatform: SelectedPlatform) => {
    if (targetPlatform === "download") {
      await handleDownload();
      return;
    }

    // Check if this platform supports publishing
    if (!PUBLISHABLE_PLATFORMS.includes(targetPlatform)) {
      // For non-publishable platforms, just download
      await handleDownload();
      return;
    }

    setShowPanel(false);

    // Check if authenticated for this platform
    if (!isAuthenticatedFor(targetPlatform)) {
      authenticate(targetPlatform as Platform);
      return;
    }

    // Export first if not already exported
    let result = exportedResult;
    if (!result) {
      result = await handleExport(includeCaptions);
      if (!result) return;
    }

    // Publish to platform
    setIsPublishing(true);
    setPublishProgress(0);

    try {
      const formData = new FormData();
      formData.append("video", result.videoBlob, "reel.mp4");
      formData.append(
        "title",
        currentClip?.metadata?.title || t("defaultReelTitle"),
      );
      formData.append("description", currentClip?.metadata?.description || "");

      if (targetPlatform === "youtube") {
        formData.append("privacyStatus", "public");
      }

      setPublishProgress(30);

      const response = await fetch(`/api/publish/${targetPlatform}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      setPublishProgress(80);

      const data = await response.json();

      if (!response.ok) {
        if (data.needsReauth) {
          authenticate(targetPlatform as Platform);
          return;
        }
        throw new Error(data.error || "Publishing failed");
      }

      setPublishProgress(100);
      
      // Play congratulation sound when publish is complete
      playSuccessSound();

      const platformLabel = PLATFORM_CONFIG[targetPlatform].label;
      const postUrl = data.videoUrl || data.postUrl;

      alert(t("publishSuccess", { platform: platformLabel, url: postUrl }));

      if (postUrl) {
        window.open(postUrl, "_blank");
      }
    } catch (error) {
      console.error("Publish failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Publishing failed";
      onExportError?.(new Error(errorMessage));
      alert(t("publishFailed", { error: errorMessage }));
    } finally {
      setIsPublishing(false);
      setPublishProgress(0);
    }
  };

  /**
   * Handle logout for a specific platform
   */
  const handleLogout = async (targetPlatform: SelectedPlatform) => {
    if (targetPlatform === "download") return;
    await logout(targetPlatform as Platform);
  };

  // Determine button state
  const isProcessing = isExporting || isPublishing;
  const progressValue = isExporting ? exportProgress : publishProgress;
  const statusText = isExporting
    ? t("exporting", { progress: exportProgress })
    : isPublishing
    ? t("publishing", { progress: publishProgress })
    : null;

  // Available platforms to show in the grid
  const availablePlatforms: SelectedPlatform[] = [
    "download",
    "youtube",
    "facebook",
  ];

  // Get the action button text based on selected platform
  const getActionButtonText = () => {
    if (selectedPlatform === "download") {
      return t("download");
    }
    const isAuth = isAuthenticatedFor(selectedPlatform);
    const label = PLATFORM_CONFIG[selectedPlatform].label;
    return isAuth
      ? t("publishTo", { platform: label })
      : t("connect", { platform: label });
  };

  return (
    <div className={styles.container}>
      {hasAnimations && !isProcessing && includeCaptions && (
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
            <Download size={18} />
            {t("exportReel")}
          </>
        )}
      </button>

      {/* Export Panel Modal */}
      {showPanel &&
        !isProcessing &&
        !isEditingTranscription &&
        mounted &&
        typeof document !== "undefined" &&
        document.body &&
        createPortal(
          <div className={styles.panelOverlay} onClick={() => setShowPanel(false)}>
            <div
              ref={panelRef}
              className={styles.panel}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className={styles.panelHeader}>
                <h3>{t("exportSettings")}</h3>
                <button
                  className={styles.closeButton}
                  onClick={() => setShowPanel(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Panel Content */}
              <div className={styles.panelContent}>
                {/* Caption Toggle Section */}
                {hasCaptions && (
                  <div className={styles.section}>
                    <div className={styles.sectionLabel}>{t("captions") || "Captions"}</div>
                    <div className={styles.captionToggleContainer}>
                      <button
                        className={`${styles.captionOption} ${
                          includeCaptions ? styles.captionOptionActive : ""
                        }`}
                        onClick={() => setIncludeCaptions(true)}
                      >
                        <span className={styles.captionIcon}>💬</span>
                        <span>{t("withCaptions") || "With Captions"}</span>
                        {includeCaptions && (
                          <Check size={16} className={styles.checkIcon} />
                        )}
                      </button>
                      <button
                        className={`${styles.captionOption} ${
                          !includeCaptions ? styles.captionOptionActive : ""
                        }`}
                        onClick={() => setIncludeCaptions(false)}
                      >
                        <span className={styles.captionIcon}>🔇</span>
                        <span>{t("withoutCaptions") || "Without Captions"}</span>
                        {!includeCaptions && (
                          <Check size={16} className={styles.checkIcon} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Platform Selection Section */}
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>
                    {t("exportTo") || "Export to"}
                  </div>
                  <div className={styles.platformGrid}>
                    {availablePlatforms.map((platform) => {
                      const config = PLATFORM_CONFIG[platform];
                      const isSelected = selectedPlatform === platform;
                      const isAuth =
                        platform === "download" || isAuthenticatedFor(platform);
                      const isPublishable = PUBLISHABLE_PLATFORMS.includes(platform);

                      return (
                        <button
                          key={platform}
                          className={`${styles.platformCard} ${
                            isSelected ? styles.platformCardSelected : ""
                          }`}
                          onClick={() => setSelectedPlatform(platform)}
                          style={
                            isSelected
                              ? { borderColor: config.color }
                              : undefined
                          }
                        >
                          <span className={styles.platformIcon}>
                            {config.icon}
                          </span>
                          <span className={styles.platformLabel}>
                            {config.label}
                          </span>
                          {isPublishable && isAuth && (
                            <span className={styles.connectedBadge}>
                              <Check size={12} />
                            </span>
                          )}
                          {isSelected && (
                            <span
                              className={styles.selectedIndicator}
                              style={{ background: config.gradient }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Connected Account Info */}
                {selectedPlatform !== "download" &&
                  isAuthenticatedFor(selectedPlatform) && (
                    <div className={styles.connectedInfo}>
                      <Check size={14} />
                      <span>
                        {t("connectedTo", {
                          platform: PLATFORM_CONFIG[selectedPlatform].label,
                        })}
                      </span>
                      <button
                        className={styles.disconnectLink}
                        onClick={() => handleLogout(selectedPlatform)}
                      >
                        {t("disconnect", {
                          platform: "",
                        }).trim()}
                      </button>
                    </div>
                  )}
              </div>

              {/* Panel Footer */}
              <div className={styles.panelFooter}>
                <button
                  className={styles.exportActionButton}
                  onClick={handleExportAction}
                  style={{
                    background: PLATFORM_CONFIG[selectedPlatform].gradient,
                  }}
                >
                  {selectedPlatform === "download" ? (
                    <Download size={18} />
                  ) : (
                    <span className={styles.actionIcon}>
                      {PLATFORM_CONFIG[selectedPlatform].icon}
                    </span>
                  )}
                  {getActionButtonText()}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Progress Bar */}
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
