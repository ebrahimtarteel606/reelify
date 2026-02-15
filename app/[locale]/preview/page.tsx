"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useState, useMemo, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReelClipInput, Caption, CaptionStyle } from "@/types";
import { getVideoBlobUrl } from "@/lib/videoStorage";
import { ExportPanel } from "@/components/reel-editor/ExportPanel";
import posthog from "posthog-js";
import {
  Backward10Seconds,
  Clock,
  DocumentDownload,
  DocumentText,
  Edit,
  Forward10Seconds,
  Gallery,
  Pause,
  Play,
  ReceiveSquare,
  Refresh2,
  Tag,
  Warning2,
} from "vuesax-icons-react";

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: 48,
  fontFamily: "Inter, sans-serif",
  fontWeight: "600",
  color: "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  textAlign: "center",
  padding: { top: 8, right: 12, bottom: 8, left: 12 },
  opacity: 1,
};

function PreviewContent() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("preview");
  const tCommon = useTranslations("common");
  const tExport = useTranslations("exportButton");

  const urlParam = searchParams.get("url");
  const title = searchParams.get("title") || (locale === "ar" ? "مقطع فيديو" : "Video clip");
  const rawDuration = searchParams.get("duration");
  const duration =
    rawDuration != null
      ? (() => {
          const n = parseFloat(rawDuration);
          return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : rawDuration;
        })()
      : null;
  const thumbnail = searchParams.get("thumbnail");
  const category = searchParams.get("category") || (locale === "ar" ? "عام" : "General");
  const tagsParam = searchParams.get("tags") || "";
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
  const transcript = searchParams.get("transcript") || "";
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const router = useRouter();

  // Check localStorage on mount to ensure segments are available
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("reelify_segments");
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log("[Preview] Found segments in localStorage:", {
            count: Array.isArray(parsed) ? parsed.length : 0,
          });
        } else {
          console.log("[Preview] No segments in localStorage");
        }
      } catch (e) {
        console.warn("[Preview] Failed to check localStorage:", e);
      }
    }

    posthog.capture("preview_opened", {
      title,
      clip_duration: duration ? parseFloat(duration) : null,
      has_transcript: !!transcript,
      has_thumbnail: !!thumbnail,
      category,
    });
  }, []);
  const [url, setUrl] = useState<string | null>(urlParam);
  const [urlLoadDone, setUrlLoadDone] = useState(!!urlParam);
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const firstReelSegmentRef = useRef<HTMLSpanElement | null>(null);
  const transcriptScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Export panel state
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  // Export options (same UX as editor): caption toggle + aspect selected before opening export
  const [includeCaptions, setIncludeCaptions] = useState(true);
  const [exportFormat, setExportFormat] = useState<"zoom" | "landscape">("zoom");

  useEffect(() => {
    if (urlParam) {
      setUrl(urlParam);
      setUrlLoadDone(true);
      return;
    }
    let cancelled = false;
    getVideoBlobUrl()
      .then((blobUrl) => {
        if (!cancelled) {
          if (blobUrl) setUrl(blobUrl);
          setUrlLoadDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) setUrlLoadDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [urlParam]);

  const clipData: ReelClipInput | null = useMemo(() => {
    if (!url) return null;

    const durationNum = duration ? parseFloat(duration) : 0;
    const startTime = startTimeParam != null ? parseFloat(startTimeParam) : 0;
    const endTime = endTimeParam != null ? parseFloat(endTimeParam) : durationNum || 60;

    const segments = transcript
      ? transcript
          .split(/[.!?،؛]+/)
          .filter((s) => s.trim().length > 0)
          .map((text, index, arr) => {
            const segmentDuration = durationNum / Math.max(arr.length, 1);
            return {
              text: text.trim(),
              start: index * segmentDuration,
              end: (index + 1) * segmentDuration,
              language: /[\u0600-\u06FF]/.test(text) ? ("ar" as const) : ("en" as const),
            };
          })
      : [];

    return {
      clipId: `clip-${Date.now()}`,
      videoSourceUrl: url,
      sourceVideoDuration: durationNum || 60,
      startTime: Number.isFinite(startTime) ? startTime : 0,
      endTime: Number.isFinite(endTime) ? endTime : durationNum || 60,
      transcription: segments.length > 0 ? { segments } : undefined,
      metadata: {
        title,
        description: transcript,
      },
    };
  }, [url, duration, transcript, title, startTimeParam, endTimeParam]);

  const fullTranscriptSegments = useMemo(() => {
    if (startTimeParam == null || endTimeParam == null) return null;
    const startTime = parseFloat(startTimeParam);
    const endTime = parseFloat(endTimeParam);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime)
      return null;

    let parsed: Array<{ text: string; start: number; end: number }> | null = null;

    // Load segments from localStorage/sessionStorage
    if (typeof window !== "undefined") {
      try {
        let raw = window.sessionStorage.getItem("reelify_segments");
        if (!raw) {
          raw = window.localStorage.getItem("reelify_segments");
        }
        if (raw) {
          const data = JSON.parse(raw) as unknown;
          if (Array.isArray(data) && data.length > 0) parsed = data;
        }
      } catch {
        // Ignore invalid storage data
      }
    }

    if (!parsed) return null;
    return {
      segments: parsed,
      reelStart: startTime,
      reelEnd: endTime,
    };
  }, [startTimeParam, endTimeParam]);

  const reelExcerptText = useMemo(() => {
    if (!fullTranscriptSegments) return "";
    return fullTranscriptSegments.segments
      .filter(
        (seg) =>
          seg.start < fullTranscriptSegments.reelEnd && seg.end > fullTranscriptSegments.reelStart
      )
      .map((seg) => seg.text)
      .join(" ");
  }, [fullTranscriptSegments]);

  // Build captions from transcription segments for export
  const captionsForExport: Caption[] = useMemo(() => {
    // First try to use segments from localStorage
    if (fullTranscriptSegments) {
      const { segments, reelStart, reelEnd } = fullTranscriptSegments;

      return segments
        .filter((seg) => seg.start < reelEnd && seg.end > reelStart)
        .map((seg, index) => ({
          id: `caption-${index}`,
          text: seg.text,
          startTime: Math.max(seg.start, reelStart),
          endTime: Math.min(seg.end, reelEnd),
          position: { x: 540, y: 1632 }, // Center bottom (pixel coordinates for 1080x1920)
          style: DEFAULT_CAPTION_STYLE,
          isVisible: true,
          language: /[\u0600-\u06FF]/.test(seg.text) ? ("ar" as const) : ("en" as const),
        }));
    }

    // Fallback: build captions from transcript text if available
    if (transcript) {
      const durationNum = duration ? parseFloat(duration) : 0;
      const startTime = startTimeParam != null ? parseFloat(startTimeParam) : 0;
      const endTime = endTimeParam != null ? parseFloat(endTimeParam) : durationNum || 60;
      const clipDuration = endTime - startTime;

      // Split transcript into segments
      const sentences = transcript.split(/[.!?،؛]+/).filter((s) => s.trim().length > 0);

      if (sentences.length > 0) {
        const segmentDuration = clipDuration / sentences.length;

        return sentences.map((text, index) => ({
          id: `caption-${index}`,
          text: text.trim(),
          startTime: startTime + index * segmentDuration,
          endTime: startTime + (index + 1) * segmentDuration,
          position: { x: 540, y: 1632 }, // Center bottom (pixel coordinates for 1080x1920)
          style: DEFAULT_CAPTION_STYLE,
          isVisible: true,
          language: /[\u0600-\u06FF]/.test(text) ? ("ar" as const) : ("en" as const),
        }));
      }
    }

    return [];
  }, [fullTranscriptSegments, transcript, duration, startTimeParam, endTimeParam]);

  const firstReelSegmentIndex = useMemo(() => {
    if (!fullTranscriptSegments) return -1;
    return fullTranscriptSegments.segments.findIndex(
      (seg) =>
        seg.start < fullTranscriptSegments.reelEnd && seg.end > fullTranscriptSegments.reelStart
    );
  }, [fullTranscriptSegments]);

  useEffect(() => {
    if (!fullTranscriptSegments || firstReelSegmentIndex < 0) return;
    const scrollToReelSegment = () => {
      const el = firstReelSegmentRef.current;
      const container = transcriptScrollContainerRef.current;
      if (el && container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offsetFromVisibleTop = elRect.top - containerRect.top;
        const padding = 8;
        const newScrollTop = container.scrollTop + offsetFromVisibleTop - padding;
        container.scrollTo({
          top: Math.max(0, newScrollTop),
          behavior: "smooth",
        });
      } else if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    const timer = setTimeout(scrollToReelSegment, 150);
    return () => clearTimeout(timer);
  }, [fullTranscriptSegments, firstReelSegmentIndex]);

  if (!urlLoadDone) {
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

  if (!url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <Card className="w-full max-w-md shadow-card border-0 bg-gradient-card animate-fade-in">
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <img src="/Transparent black.png" alt="Reelify logo" className="h-10 w-auto" />
            </div>
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
              <Warning2 className="w-8 h-8 text-red-500" size={32} />
            </div>
            <p className="text-lg font-medium text-foreground">{t("videoUrlMissing")}</p>
            <Button
              className="bg-gradient-teal hover:shadow-teal transition-all duration-200"
              onClick={() => window.close()}
            >
              {tCommon("close")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get trim points for export
  const exportStartTime =
    startTimeParam != null && Number.isFinite(parseFloat(startTimeParam))
      ? parseFloat(startTimeParam)
      : 0;
  const exportEndTime =
    endTimeParam != null && Number.isFinite(parseFloat(endTimeParam))
      ? parseFloat(endTimeParam)
      : videoDuration || parseFloat(duration || "60");

  const handleDownloadThumbnail = async () => {
    if (!thumbnail) return;
    posthog.capture("thumbnail_downloaded", { title });
    try {
      const response = await fetch(thumbnail);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${title}-thumbnail.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      window.open(thumbnail, "_blank");
    }
  };

  const handleDownloadTranscript = () => {
    if (!transcript) return;
    posthog.capture("transcript_downloaded", {
      title,
      transcript_length: transcript.length,
    });
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${title}-transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  const videoFitClass = "object-cover"; // Default to zoom (fill container)
  const videoWrapperClass = `aspect-[9/16] relative ${
    isPortrait === false ? "bg-black" : "bg-neutral-900"
  }`;

  const reelStart =
    startTimeParam != null && Number.isFinite(parseFloat(startTimeParam))
      ? parseFloat(startTimeParam)
      : null;
  const reelEnd =
    endTimeParam != null && Number.isFinite(parseFloat(endTimeParam))
      ? parseFloat(endTimeParam)
      : null;
  const isReelOnly = reelStart != null && reelEnd != null && reelEnd > reelStart;

  const playbackStart = isReelOnly && reelStart != null ? reelStart : 0;
  const playbackEnd = isReelOnly && reelEnd != null ? reelEnd : videoDuration || 0;

  const clampTime = (time: number): number => {
    const min = playbackStart;
    const max = playbackEnd > 0 ? playbackEnd : time;
    return Math.max(min, Math.min(max, time));
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.pause();
    else video.play();
  };

  const handleSeekBack = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clampTime(video.currentTime - 10);
  };

  const handleSeekForward = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clampTime(video.currentTime + 10);
  };

  const handleReplay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = playbackStart;
    video.play();
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const value = parseFloat(e.target.value);
    video.currentTime = clampTime(value);
  };

  return (
    <div className="min-h-screen bg-gradient-warm py-10 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <Link href={`/${locale}/app`}>
            <Image
              src="/logo.png"
              alt="Reelify"
              width={200}
              height={100}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* Video Info */}
          <Card
            className="shadow-card border-0 bg-gradient-card animate-fade-in h-full"
            style={{ animationDelay: "0.1s" }}
          >
            <CardContent className="p-6 lg:p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="inline-flex items-center px-4 py-1.5 text-sm font-semibold bg-primary/10 text-primary rounded-full">
                    {category}
                  </span>
                  {duration && (
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" size={16} />
                      {duration} {tCommon("seconds")}
                    </span>
                  )}
                </div>
                <h1 className="text-3xl font-bold text-foreground leading-snug">{title}</h1>
              </div>

              <div className="flex justify-start">
                <Button
                  onClick={() => {
                    posthog.capture("edit_clicked", {
                      title,
                      clip_duration: duration ? parseFloat(duration) : null,
                    });
                    // Ensure segments are in localStorage for editor to read (don't pass via URL)
                    if (typeof window !== "undefined") {
                      try {
                        // Try to load from sessionStorage/localStorage
                        let stored = window.sessionStorage.getItem("reelify_segments");
                        if (!stored) {
                          stored = window.localStorage.getItem("reelify_segments");
                        }
                        if (stored) {
                          // Ensure it's in both storages
                          window.localStorage.setItem("reelify_segments", stored);
                          window.sessionStorage.setItem("reelify_segments", stored);
                          const parsed = JSON.parse(stored);
                          console.log(
                            "[Preview] Segments ready in localStorage for editor:",
                            Array.isArray(parsed) ? parsed.length : 0
                          );
                        } else {
                          console.warn("[Preview] No segments available for editor");
                        }
                      } catch (e) {
                        console.warn("[Preview] Failed to prepare segments:", e);
                      }
                    }

                    // Navigate to editor WITHOUT segments in URL (rely on localStorage to avoid 431 error)
                    const editorParams = new URLSearchParams({
                      ...(url && !url.startsWith("blob:") ? { videoUrl: url } : {}),
                      startTime: startTimeParam ?? "0",
                      endTime: endTimeParam ?? duration ?? "60",
                      title,
                      thumbnail: thumbnail ?? "",
                      category,
                      tags: tagsParam || "",
                      transcript,
                    });
                    router.push(`/${locale}/editor?${editorParams.toString()}`);
                  }}
                  disabled={!clipData}
                  className="bg-gradient-teal text-white hover:shadow-teal transition-all duration-200"
                >
                  <Edit className="w-5 h-5 me-2" size={20} />
                  {t("editVideo")}
                </Button>
              </div>

              {tags.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary" size={16} />
                    {t("tags")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-4 py-1.5 text-sm bg-muted text-foreground rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(transcript || fullTranscriptSegments) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <DocumentText className="w-4 h-4 text-primary" size={16} />
                    {t("transcript")}
                  </h3>
                  {fullTranscriptSegments && reelExcerptText && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-foreground/70">
                        {t("selectedClip")}
                      </p>
                    </div>
                  )}
                  <div
                    ref={transcriptScrollContainerRef}
                    className="p-5 bg-muted/50 rounded-2xl text-base text-foreground/80 leading-relaxed max-h-[300px] overflow-y-auto border border-border/50"
                  >
                    {fullTranscriptSegments
                      ? fullTranscriptSegments.segments.map((seg, i) => {
                          const isReel =
                            seg.start < fullTranscriptSegments.reelEnd &&
                            seg.end > fullTranscriptSegments.reelStart;
                          return (
                            <span key={i}>
                              {isReel ? (
                                <span
                                  ref={
                                    i === firstReelSegmentIndex ? firstReelSegmentRef : undefined
                                  }
                                  className="bg-amber-200/90 dark:bg-amber-400/40 text-foreground rounded px-1 py-0.5 font-medium"
                                  title={t("selectedClip")}
                                >
                                  {seg.text}
                                </span>
                              ) : (
                                seg.text
                              )}
                              {i < fullTranscriptSegments.segments.length - 1 ? " " : ""}
                            </span>
                          );
                        })
                      : transcript}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ReceiveSquare className="w-4 h-4 text-primary" size={16} />
                  {t("downloads")}
                </h3>

                {/* Caption toggle (with / without) - same as editor */}
                {captionsForExport.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {tExport("captions")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant={includeCaptions ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 ${includeCaptions ? "text-white" : ""}`}
                        onClick={() => setIncludeCaptions(true)}
                      >
                        <DocumentText className="w-4 h-4 me-2" size={16} />
                        {tExport("withCaptions")}
                      </Button>
                      <Button
                        variant={!includeCaptions ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 ${!includeCaptions ? "text-white" : ""}`}
                        onClick={() => setIncludeCaptions(false)}
                      >
                        {tExport("withoutCaptions")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Aspect: Zoom / Landscape - same as editor */}
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {tExport("exportFormat")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant={exportFormat === "zoom" ? "default" : "outline"}
                      size="sm"
                      className={`flex-1 ${exportFormat === "zoom" ? "text-white" : ""}`}
                      onClick={() => setExportFormat("zoom")}
                    >
                      {tExport("zoom")}
                    </Button>
                    <Button
                      variant={exportFormat === "landscape" ? "default" : "outline"}
                      size="sm"
                      className={`flex-1 ${exportFormat === "landscape" ? "text-white" : ""}`}
                      onClick={() => setExportFormat("landscape")}
                    >
                      {tExport("landscape")}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Button
                    onClick={() => setShowExportPanel(true)}
                    disabled={isExporting}
                    className="w-full text-white h-12 bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    {isExporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin me-2" />
                        {exportProgress}%
                      </>
                    ) : (
                      <>
                        <ReceiveSquare className="w-5 h-5 me-2" size={20} />
                        {t("downloadVideo")}
                      </>
                    )}
                  </Button>

                  {/* Export Panel - only "Export to" (Download, Facebook, Youtube); confirmation shown on action */}
                  <ExportPanel
                    isOpen={showExportPanel && !isExporting}
                    onClose={() => setShowExportPanel(false)}
                    videoUrl={url}
                    startTime={exportStartTime}
                    endTime={exportEndTime}
                    captions={captionsForExport}
                    includeCaptions={includeCaptions}
                    title={title}
                    description={transcript}
                    clipId={`preview-${Date.now()}`}
                    exportFormat={exportFormat}
                    onExportStart={() => {
                      setIsExporting(true);
                      setExportProgress(0);
                    }}
                    onExportProgress={(progress) => setExportProgress(progress)}
                    onExportSuccess={() => setIsExporting(false)}
                    onExportError={() => setIsExporting(false)}
                  />

                  {/* Progress Bar */}
                  {isExporting && (
                    <div className="col-span-full h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                  )}
                  {thumbnail && (
                    <Button
                      onClick={handleDownloadThumbnail}
                      variant="outline"
                      className="w-full h-12 border-2 hover:bg-primary/5 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                    >
                      <Gallery className="w-5 h-5 me-2" size={20} />
                      {t("downloadImage")}
                    </Button>
                  )}
                  {transcript && (
                    <Button
                      onClick={handleDownloadTranscript}
                      variant="outline"
                      className="w-full h-12 border-2 hover:bg-primary/5 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                    >
                      <DocumentDownload className="w-5 h-5 me-2" size={20} />
                      {t("downloadText")}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Video Player */}
          <div className="flex justify-center">
            <Card className="shadow-card border-0 bg-gradient-card overflow-hidden animate-fade-in hover:shadow-card-hover transition-all duration-500 w-full max-w-md rounded-2xl">
              <div className={videoWrapperClass}>
                <video
                  ref={videoRef}
                  src={url}
                  poster={thumbnail || undefined}
                  autoPlay
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    const { videoWidth, videoHeight } = video;
                    if (videoWidth && videoHeight) {
                      setIsPortrait(videoHeight >= videoWidth);
                    }
                    setVideoDuration(video.duration);
                    if (isReelOnly && reelStart != null) {
                      video.currentTime = reelStart;
                      setCurrentTime(reelStart);
                    }
                  }}
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    setCurrentTime(video.currentTime);
                    if (!isReelOnly || reelEnd == null) return;
                    if (video.currentTime >= reelEnd) {
                      video.pause();
                      video.currentTime = reelEnd;
                    }
                  }}
                  onSeeked={(event) => {
                    if (!isReelOnly || reelStart == null || reelEnd == null) return;
                    const video = event.currentTarget;
                    if (video.currentTime < reelStart) {
                      video.currentTime = reelStart;
                    } else if (video.currentTime > reelEnd) {
                      video.currentTime = reelEnd;
                    }
                  }}
                  onClick={handlePlayPause}
                  className={`w-full h-full ${videoFitClass} cursor-pointer`}
                  playsInline
                />
              </div>
              <div className="flex flex-col gap-2 p-3 bg-neutral-900 rounded-b-2xl border-t border-border">
                <input
                  type="range"
                  min={playbackStart}
                  max={playbackEnd || 1}
                  step={0.1}
                  value={currentTime}
                  onChange={handleProgressChange}
                  className="w-full h-2 rounded-full appearance-none bg-muted accent-primary cursor-pointer"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {formatTime(currentTime)} / {formatTime(playbackEnd || videoDuration)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSeekBack}
                      className="p-2 rounded-lg text-primary hover:bg-primary/20 transition-colors"
                      title={t("seekBack")}
                      aria-label={t("seekBack")}
                    >
                      <Backward10Seconds className="w-5 h-5" size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={handlePlayPause}
                      className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                      title={isPlaying ? t("pause") : t("play")}
                      aria-label={isPlaying ? t("pause") : t("play")}
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6" size={24} variant="Bold" />
                      ) : (
                        <Play className="w-6 h-6" size={24} variant="Bold" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleSeekForward}
                      className="p-2 rounded-lg text-primary hover:bg-primary/20 transition-colors"
                      title={t("seekForward")}
                      aria-label={t("seekForward")}
                    >
                      <Forward10Seconds className="w-5 h-5" size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={handleReplay}
                      className="p-2 rounded-lg text-primary hover:bg-primary/20 transition-colors"
                      title={t("replay")}
                      aria-label={t("replay")}
                    >
                      <Refresh2 className="w-5 h-5" size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PreviewPage() {
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
      <PreviewContent />
    </Suspense>
  );
}
