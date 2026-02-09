"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Briefcase,
  CloseCircle,
  Facebook,
  Instagram,
  Music,
  ReceiveSquare,
  Snapchat,
  TickCircle,
  Youtube,
} from "vuesax-icons-react";
import { ReelExportService } from "@/lib/services/ReelExportService";
import { Caption, ReelExportResult, ExportFormatOptions } from "@/types";
import { useAuthStatus, Platform } from "@/lib/hooks/useAuthStatus";
import { playSuccessSound } from "@/lib/utils/audioUtils";
import posthog from "posthog-js";

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
  { label: string; icon: React.ReactNode; color: string; gradient: string }
> = {
  download: {
    label: "Download",
    icon: <ReceiveSquare size={22} variant="Bold" />,
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  },
  instagram: {
    label: "Instagram",
    icon: <Instagram size={22} variant="Bold" />,
    color: "#E1306C",
    gradient: "linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)",
  },
  tiktok: {
    label: "TikTok",
    icon: <Music size={22} variant="Bold" />,
    color: "#000000",
    gradient: "linear-gradient(135deg, #00f2ea 0%, #ff0050 100%)",
  },
  youtube: {
    label: "YouTube",
    icon: <Youtube size={22} variant="Bold" />,
    color: "#FF0000",
    gradient: "linear-gradient(135deg, #FF0000 0%, #CC0000 100%)",
  },
  snapchat: {
    label: "Snapchat",
    icon: <Snapchat size={22} variant="Bold" />,
    color: "#FFFC00",
    gradient: "linear-gradient(135deg, #FFFC00 0%, #FFE600 100%)",
  },
  facebook: {
    label: "Facebook",
    icon: <Facebook size={22} variant="Bold" />,
    color: "#1877F2",
    gradient: "linear-gradient(135deg, #1877F2 0%, #0d65d9 100%)",
  },
  linkedin: {
    label: "LinkedIn",
    icon: <Briefcase size={22} variant="Bold" />,
    color: "#0A66C2",
    gradient: "linear-gradient(135deg, #0A66C2 0%, #004182 100%)",
  },
};

export interface ExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  startTime: number;
  endTime: number;
  captions: Caption[];
  /** Whether to include captions in export (controlled by parent page toggle) */
  includeCaptions: boolean;
  title?: string;
  description?: string;
  clipId?: string;
  exportFormat?: "landscape" | "zoom";
  onExportSuccess?: (result: ReelExportResult) => void;
  onExportError?: (error: Error) => void;
  onExportStart?: () => void;
  onExportProgress?: (progress: number) => void;
}

export function ExportPanel({
  isOpen,
  onClose,
  videoUrl,
  startTime,
  endTime,
  captions,
  includeCaptions,
  title = "My Reel",
  description = "",
  clipId,
  exportFormat = "zoom",
  onExportSuccess,
  onExportError,
  onExportStart,
  onExportProgress,
}: ExportPanelProps) {
  const t = useTranslations("exportButton");

  const { authStatus, authenticate, logout } = useAuthStatus();

  // UI state
  const [selectedPlatform, setSelectedPlatform] = useState<SelectedPlatform>("download");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [exportedResult, setExportedResult] = useState<ReelExportResult | null>(null);
  const [mounted, setMounted] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // Set mounted state for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setExportedResult(null);
    }
  }, [isOpen]);

  // Auth helpers per publishable platform
  const isAuthenticatedFor = (p: SelectedPlatform) => {
    if (p === "youtube") return authStatus.youtube;
    if (p === "facebook") return authStatus.facebook;
    return false;
  };

  // Check if any captions have animations
  const hasAnimations = captions.some(
    (c) => c.style.animation && c.style.animation.type !== "none"
  );

  /**
   * Export video and return the result
   */
  const handleExport = async (withCaptions: boolean = true): Promise<ReelExportResult | null> => {
    if (!videoUrl || isExporting) return null;

    // Warn about animations if present and captions are included
    if (withCaptions && hasAnimations) {
      const confirmed = window.confirm(t("animationConfirm"));
      if (!confirmed) return null;
    }

    setIsExporting(true);
    setExportProgress(0);
    onExportStart?.();

    posthog.capture("export_started", {
      include_captions: withCaptions,
      export_format: exportFormat,
      captions_count: withCaptions ? captions.filter((c) => c.isVisible).length : 0,
      video_duration: Math.round(endTime - startTime),
    });

    try {
      console.log("[ExportPanel] Starting export...");

      const formatOptions: ExportFormatOptions = {
        format: exportFormat,
        reframing: {
          mode: "smart",
          enabled: true,
        },
      };

      // Filter captions based on user choice
      const captionsToExport = withCaptions ? captions.filter((c) => c.isVisible) : [];

      console.log("[ExportPanel] Export config:", {
        videoUrl: videoUrl.substring(0, 50),
        startTime,
        endTime,
        captionsCount: captionsToExport.length,
        withCaptions,
      });

      const result = await ReelExportService.exportVideo(
        videoUrl,
        startTime,
        endTime,
        captionsToExport,
        clipId || `export-${Date.now()}`,
        (progress) => {
          setExportProgress(progress);
          onExportProgress?.(progress);
        },
        formatOptions
      );

      console.log("[ExportPanel] Export successful:", result);
      setIsExporting(false);
      setExportedResult(result);

      posthog.capture("export_completed", {
        include_captions: withCaptions,
        export_format: exportFormat,
        video_duration: Math.round(endTime - startTime),
      });

      // Play congratulation sound when export is ready
      playSuccessSound();

      return result;
    } catch (error) {
      console.error("[ExportPanel] Export failed:", error);
      setIsExporting(false);
      const errorMessage = error instanceof Error ? error.message : "Export failed";
      posthog.capture("export_failed", {
        error_message: errorMessage,
        export_format: exportFormat,
      });
      onExportError?.(new Error(errorMessage));
      alert(t("exportFailed", { error: errorMessage }));
      return null;
    }
  };

  /**
   * Handle download action
   */
  const handleDownload = async () => {
    onClose();
    const result = await handleExport(includeCaptions);
    if (result) {
      posthog.capture("video_downloaded", {
        include_captions: includeCaptions,
        export_format: exportFormat,
        video_duration: Math.round(endTime - startTime),
      });
      // Trigger download
      const a = document.createElement("a");
      a.href = result.videoUrl;
      a.download = `${title}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onExportSuccess?.(result);
    }
  };

  /** Build confirmation message: e.g. "You are going to download the reel with captions in a zoom aspect." */
  const getConfirmationMessage = (): string => {
    const prefix = t("confirmPrefix");
    const action =
      selectedPlatform === "download"
        ? t("confirmDownload")
        : t("confirmPublishTo", {
            platform: PLATFORM_CONFIG[selectedPlatform].label,
          });
    const captionsPart = includeCaptions ? t("confirmWithCaptions") : t("confirmWithoutCaptions");
    const aspectPart =
      exportFormat === "zoom" ? t("confirmZoomAspect") : t("confirmLandscapeAspect");
    return `${prefix}${action} ${captionsPart} ${aspectPart}.`;
  };

  /**
   * Handle the main export/publish action based on selected platform.
   * Shows confirmation dialog first, then proceeds.
   */
  const handleExportAction = async () => {
    const message = getConfirmationMessage();
    if (!window.confirm(message)) return;

    if (selectedPlatform === "download") {
      await handleDownload();
      return;
    }

    // For social platforms, publish
    await handlePublish(selectedPlatform);
  };

  /**
   * Handle publish action for a specific platform
   */
  const handlePublish = async (targetPlatform: SelectedPlatform) => {
    if (targetPlatform === "download") {
      await handleDownload();
      return;
    }

    // Check if this platform supports publishing
    if (!PUBLISHABLE_PLATFORMS.includes(targetPlatform)) {
      await handleDownload();
      return;
    }

    onClose();

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

    posthog.capture("publish_started", {
      platform: targetPlatform,
      include_captions: includeCaptions,
      export_format: exportFormat,
    });

    try {
      const formData = new FormData();
      formData.append("video", result.videoBlob, "reel.mp4");
      formData.append("title", title || t("defaultReelTitle"));
      formData.append("description", description || "");

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

      posthog.capture("video_published", {
        platform: targetPlatform,
        include_captions: includeCaptions,
        export_format: exportFormat,
      });

      // Play congratulation sound when publish is complete
      playSuccessSound();

      const platformLabel = PLATFORM_CONFIG[targetPlatform].label;
      const postUrl = data.videoUrl || data.postUrl;

      // Clear parent loading state (e.g. preview page "Exporting... 100%")
      onExportSuccess?.(result);

      alert(t("publishSuccess", { platform: platformLabel, url: postUrl }));

      if (postUrl) {
        window.open(postUrl, "_blank");
      }
    } catch (error) {
      console.error("[ExportPanel] Publish failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Publishing failed";
      posthog.capture("publish_failed", {
        platform: targetPlatform,
        error_message: errorMessage,
      });
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

  // Determine processing state
  const isProcessing = isExporting || isPublishing;
  const progressValue = isExporting ? exportProgress : publishProgress;

  // Available platforms to show in the grid
  const availablePlatforms: SelectedPlatform[] = ["download", "youtube", "facebook"];

  // Get the action button text based on selected platform
  const getActionButtonText = () => {
    if (selectedPlatform === "download") {
      return t("download");
    }
    const isAuth = isAuthenticatedFor(selectedPlatform);
    const label = PLATFORM_CONFIG[selectedPlatform].label;
    return isAuth ? t("publishTo", { platform: label }) : t("connect", { platform: label });
  };

  if (!isOpen || !mounted || typeof document === "undefined" || !document.body) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="bg-card rounded-[20px] shadow-2xl border border-border max-w-[420px] w-[90%] max-h-[90vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h3 className="text-lg font-bold text-foreground tracking-tight">
            {t("exportSettings")}
          </h3>
          <button
            className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all hover:scale-105"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseCircle size={20} />
          </button>
        </div>

        {/* Panel Content - Only "Export to" options (Download, Facebook, Youtube) */}
        <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Platform Selection Section */}
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("exportTo")}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {availablePlatforms.map((platform) => {
                const config = PLATFORM_CONFIG[platform];
                const isSelected = selectedPlatform === platform;
                const isAuth = platform === "download" || isAuthenticatedFor(platform);
                const isPublishable = PUBLISHABLE_PLATFORMS.includes(platform);

                return (
                  <button
                    key={platform}
                    className={`flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-[14px] border-2 transition-all relative overflow-hidden ${
                      isSelected
                        ? "bg-card shadow-lg -translate-y-0.5"
                        : "bg-muted border-transparent hover:bg-muted/70 hover:-translate-y-0.5 hover:shadow-md"
                    }`}
                    onClick={() => setSelectedPlatform(platform)}
                    style={isSelected ? { borderColor: config.color } : undefined}
                  >
                    <span className="text-[28px] leading-none">{config.icon}</span>
                    <span className="text-[11px] font-semibold text-foreground text-center">
                      {config.label}
                    </span>
                    {isPublishable && isAuth && (
                      <span className="absolute top-1.5 right-1.5 w-[18px] h-[18px] bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center text-white">
                        <TickCircle size={12} />
                      </span>
                    )}
                    {isSelected && (
                      <span
                        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-xl"
                        style={{ background: config.gradient }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connected Account Info */}
          {selectedPlatform !== "download" && isAuthenticatedFor(selectedPlatform) && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 rounded-xl text-emerald-500 text-sm font-medium">
              <TickCircle size={14} />
              <span>
                {t("connectedTo", {
                  platform: PLATFORM_CONFIG[selectedPlatform].label,
                })}
              </span>
              <button
                className="ml-auto text-muted-foreground text-xs underline hover:text-destructive transition-colors"
                onClick={() => handleLogout(selectedPlatform)}
              >
                {t("disconnect")}
              </button>
            </div>
          )}
        </div>

        {/* Panel Footer */}
        <div className="px-6 py-5 border-t border-border bg-muted/30">
          <button
            className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-white text-[15px] font-semibold transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            onClick={handleExportAction}
            disabled={isProcessing}
            style={{
              background: PLATFORM_CONFIG[selectedPlatform].gradient,
              boxShadow: `0 4px 14px -4px ${PLATFORM_CONFIG[selectedPlatform].color}80`,
            }}
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isExporting
                  ? t("exporting", { progress: exportProgress })
                  : t("publishing", { progress: publishProgress })}
              </>
            ) : (
              <>
                {selectedPlatform === "download" ? (
                  <ReceiveSquare size={18} />
                ) : (
                  <span className="text-lg leading-none">
                    {PLATFORM_CONFIG[selectedPlatform].icon}
                  </span>
                )}
                {getActionButtonText()}
              </>
            )}
          </button>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-white/50 transition-all duration-300"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export { PLATFORM_CONFIG, PUBLISHABLE_PLATFORMS };
export type { SelectedPlatform };
