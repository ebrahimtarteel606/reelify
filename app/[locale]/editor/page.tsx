"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Edit, Warning2 } from "vuesax-icons-react";
import { Card, CardContent } from "@/components/ui/card";
import { ReelEditor } from "@/components/reel-editor/ReelEditor";
import { ReelClipInput, ReelExportResult } from "@/types";
import { getVideoBlobUrl } from "@/lib/videoStorage";
import posthog from "posthog-js";

function EditorContent() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("editor");
  const tCommon = useTranslations("common");

  // Check synchronously if we need to restore URL
  const needsUrlRestore = useMemo(() => {
    if (typeof window === "undefined") return false;
    const authSuccess = searchParams.get("auth_success");
    const startTime = searchParams.get("startTime");
    const savedReturnUrl = sessionStorage.getItem("auth_return_url");
    return !!(authSuccess && !startTime && savedReturnUrl);
  }, [searchParams]);

  const [isRestoringUrl, setIsRestoringUrl] = useState(needsUrlRestore);

  useEffect(() => {
    if (!needsUrlRestore) return;

    const authSuccess = searchParams.get("auth_success");
    const savedReturnUrl = sessionStorage.getItem("auth_return_url");

    if (authSuccess && savedReturnUrl) {
      console.log("[Editor] Restoring URL from sessionStorage after OAuth");
      setIsRestoringUrl(true);
      sessionStorage.removeItem("auth_return_url");

      try {
        const returnUrl = new URL(savedReturnUrl);
        returnUrl.searchParams.set("auth_success", authSuccess);
        console.log("[Editor] Redirecting to:", returnUrl.toString());
        window.location.href = returnUrl.toString();
      } catch (e) {
        console.error("[Editor] Failed to restore URL:", e);
        setIsRestoringUrl(false);
      }
    }
  }, [needsUrlRestore, searchParams]);

  if (isRestoringUrl || needsUrlRestore) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-lg text-muted-foreground">
            {t("restoringSession")}
          </p>
        </div>
      </div>
    );
  }

  const videoUrlParam = searchParams.get("videoUrl");
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const titleInitial = searchParams.get("title") || t("defaultTitle");
  const category = searchParams.get("category") || t("defaultCategory");
  const transcript = searchParams.get("transcript") || "";
  const [editedTitle, setEditedTitle] = useState(titleInitial);
  const [videoUrl, setVideoUrl] = useState<string | null>(videoUrlParam);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isLoadingDuration, setIsLoadingDuration] = useState(true);

  useEffect(() => {
    const validateAndLoadVideo = async () => {
      const shouldUseIndexedDB =
        !videoUrlParam || videoUrlParam.startsWith("blob:");

      if (shouldUseIndexedDB) {
        const newBlobUrl = await getVideoBlobUrl();
        if (newBlobUrl) {
          setVideoUrl(newBlobUrl);
          const video = document.createElement("video");
          video.preload = "metadata";
          video.src = newBlobUrl;

          video.onloadedmetadata = () => {
            setVideoDuration(video.duration);
            setIsLoadingDuration(false);
          };

          video.onerror = () => {
            setIsLoadingDuration(false);
            if (endTimeParam) {
              const endTime = Number.parseFloat(endTimeParam);
              setVideoDuration(Math.max(endTime + 10, 60));
            }
          };

          video.load();
        } else {
          setIsLoadingDuration(false);
          if (endTimeParam) {
            const endTime = Number.parseFloat(endTimeParam);
            setVideoDuration(Math.max(endTime + 10, 60));
          }
        }
      } else {
        setVideoUrl(videoUrlParam);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.src = videoUrlParam;

        video.onloadedmetadata = () => {
          setVideoDuration(video.duration);
          setIsLoadingDuration(false);
        };

        video.onerror = async () => {
          const newBlobUrl = await getVideoBlobUrl();
          if (newBlobUrl) {
            setVideoUrl(newBlobUrl);
            const fallbackVideo = document.createElement("video");
            fallbackVideo.preload = "metadata";
            fallbackVideo.src = newBlobUrl;

            fallbackVideo.onloadedmetadata = () => {
              setVideoDuration(fallbackVideo.duration);
              setIsLoadingDuration(false);
            };

            fallbackVideo.onerror = () => {
              setIsLoadingDuration(false);
              if (endTimeParam) {
                const endTime = Number.parseFloat(endTimeParam);
                setVideoDuration(Math.max(endTime + 10, 60));
              }
            };

            fallbackVideo.load();
          } else {
            setIsLoadingDuration(false);
            if (endTimeParam) {
              const endTime = Number.parseFloat(endTimeParam);
              setVideoDuration(Math.max(endTime + 10, 60));
            }
          }
        };

        video.load();
      }
    };

    void validateAndLoadVideo();
  }, [videoUrlParam, endTimeParam]);

  const clipData: ReelClipInput | null = useMemo(() => {
    if (!videoUrl) return null;

    const startTime = startTimeParam ? Number.parseFloat(startTimeParam) : 0;
    const endTime = endTimeParam
      ? Number.parseFloat(endTimeParam)
      : Math.max(videoDuration, 60);

    let segments: Array<{
      text: string;
      start: number;
      end: number;
      language: "ar" | "en";
    }> = [];

    // Load segments from localStorage/sessionStorage (no longer using URL params to avoid 431 error)
    if (typeof window !== "undefined") {
      try {
        let raw = window.sessionStorage.getItem("reelify_segments");
        let source = "sessionStorage";

        // Fallback to localStorage (for cross-tab navigation)
        if (!raw) {
          raw = window.localStorage.getItem("reelify_segments");
          source = "localStorage";
        }

        if (raw) {
          const data = JSON.parse(raw) as unknown;
          if (
            Array.isArray(data) &&
            data.length > 0 &&
            data.every(
              (s: unknown) =>
                typeof s === "object" &&
                s !== null &&
                "start" in s &&
                "end" in s &&
                "text" in s,
            )
          ) {
            segments = (
              data as Array<{
                start: number;
                end: number;
                text: string;
                language?: "ar" | "en";
              }>
            ).map((seg) => ({
              text: String(seg.text).trim(),
              start: Number(seg.start),
              end: Number(seg.end),
              language:
                seg.language === "ar" || seg.language === "en"
                  ? seg.language
                  : /[\u0600-\u06FF]/.test(String(seg.text))
                    ? ("ar" as const)
                    : ("en" as const),
            }));
            console.log(
              `[Editor] Loaded segments from ${source}:`,
              segments.length,
            );

            // Ensure both storages have the data
            if (source === "localStorage") {
              window.sessionStorage.setItem("reelify_segments", raw);
            }
          }
        }
      } catch (e) {
        console.warn("[Editor] Failed to load segments from storage:", e);
      }
    }

    if (segments.length === 0 && transcript) {
      segments = transcript
        .split(/[.!?،؛]+/)
        .filter((s) => s.trim().length > 0)
        .map((text, index, arr) => {
          const clipDuration = endTime - startTime;
          const segmentDuration = clipDuration / Math.max(arr.length, 1);
          return {
            text: text.trim(),
            start: startTime + index * segmentDuration,
            end: startTime + (index + 1) * segmentDuration,
            language: /[\u0600-\u06FF]/.test(text)
              ? ("ar" as const)
              : ("en" as const),
          };
        });
    }

    return {
      clipId: `clip-${Date.now()}`,
      videoSourceUrl: videoUrl,
      sourceVideoDuration: videoDuration || 60,
      startTime,
      endTime,
      transcription: segments.length > 0 ? { segments } : undefined,
      metadata: {
        title: editedTitle,
        description: transcript,
      },
    };
  }, [
    videoUrl,
    startTimeParam,
    endTimeParam,
    transcript,
    videoDuration,
  ]);

  if (!videoUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <Card className="w-full max-w-md shadow-card border-0 bg-gradient-card animate-fade-in">
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <img
                src="/Transparent black.png"
                alt="Reelify logo"
                className="h-10 w-auto"
              />
            </div>
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
              <Warning2 className="w-8 h-8 text-red-500" size={32} />
            </div>
            <p className="text-lg font-medium text-foreground">
              {t("videoUrlMissing")}
            </p>
            <Button
              className="bg-gradient-teal hover:shadow-teal transition-all duration-200"
              onClick={() => {
                if (typeof globalThis.window !== "undefined") {
                  globalThis.sessionStorage.setItem(
                    "reelify_navigation_back",
                    "true",
                  );
                }
                globalThis.history.back();
              }}
            >
              {tCommon("back")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingDuration || !clipData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-lg text-muted-foreground">{t("loadingVideo")}</p>
        </div>
      </div>
    );
  }

  // Track editor opened once clip data is ready
  useEffect(() => {
    if (clipData) {
      posthog.capture("editor_opened", {
        clip_duration: Math.round(clipData.endTime - clipData.startTime),
        has_transcription: !!clipData.transcription,
        transcription_segments_count: clipData.transcription?.segments.length ?? 0,
      });
    }
  }, [!!clipData]);

  const handleExportSuccess = (result: ReelExportResult) => {
    // Download is already handled by ExportPanel, just cleanup
    URL.revokeObjectURL(result.videoUrl);
  };

  const handleExportError = (error: Error) => {
    console.error("Export error:", error);
    alert(`Export failed: ${error.message}`);
  };

  return (
    <div className="min-h-screen bg-gradient-warm">
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between max-w-7xl mx-auto gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <img
              src="/Transparent white1.png"
              alt="Reelify logo"
              className="h-8 w-auto shrink-0"
            />
            <div className="flex flex-col min-w-[12rem] sm:min-w-[18rem] md:min-w-[24rem] flex-1 w-full">
              <label
                title={t("titleEditHint")}
                className="group flex items-center gap-2 sm:gap-3 rounded-lg md:rounded-xl border border-transparent bg-muted/30 px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-4 transition-colors hover:border-border hover:bg-muted/50 focus-within:border-primary/50 focus-within:bg-muted/50 focus-within:ring-2 focus-within:ring-primary/20 cursor-text min-h-[2.75rem] sm:min-h-[3.25rem] md:min-h-[3.5rem]"
              >
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="flex-1 min-w-[8rem] w-full text-base sm:text-lg font-semibold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground py-0.5"
                  placeholder={t("defaultTitle")}
                  aria-label={t("titleLabel")}
                />
                <span
                  className="flex shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-focus-within:text-primary w-4 h-4 sm:w-5 sm:h-5"
                  aria-hidden
                >
                  <Edit className="w-full h-full" size={20} />
                </span>
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {category} • {Math.round(clipData.endTime - clipData.startTime)}{" "}
                {tCommon("seconds")}
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              if (typeof globalThis.window !== "undefined") {
                globalThis.sessionStorage.setItem(
                  "reelify_navigation_back",
                  "true",
                );
              }
              globalThis.history.back();
            }}
            variant="outline"
            className="bg-gradient-coral text-white border-none hover:shadow-teal transition-all duration-200"
          >
            {tCommon("back")}
          </Button>
        </div>
      </div>
      <ReelEditor
        clipData={clipData}
        title={editedTitle}
        theme="dark"
        aspectRatio="9:16"
        exportQuality="medium"
        onExportSuccess={handleExportSuccess}
        onExportError={handleExportError}
      />
    </div>
  );
}

export default function EditorPage() {
  const t = useTranslations("common");

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
          <div className="text-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-lg text-muted-foreground">{t("loading")}</p>
          </div>
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
