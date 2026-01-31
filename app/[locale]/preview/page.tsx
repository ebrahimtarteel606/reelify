"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useMemo, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReelClipInput } from "@/types";
import { getVideoBlobUrl } from "@/lib/videoStorage";

function PreviewContent() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('preview');
  const tCommon = useTranslations('common');
  
  const urlParam = searchParams.get("url");
  const title = searchParams.get("title") || (locale === 'ar' ? "مقطع فيديو" : "Video clip");
  const duration = searchParams.get("duration");
  const thumbnail = searchParams.get("thumbnail");
  const category = searchParams.get("category") || (locale === 'ar' ? "عام" : "General");
  const tagsParam = searchParams.get("tags") || "";
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
  const transcript = searchParams.get("transcript") || "";
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const fullTranscriptParam = searchParams.get("fullTranscript");
  const segmentsParam = searchParams.get("segments");
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(urlParam);
  const [urlLoadDone, setUrlLoadDone] = useState(!!urlParam);
  const [isPortrait, setIsPortrait] = useState<boolean | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const firstReelSegmentRef = useRef<HTMLSpanElement | null>(null);
  const transcriptScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (urlParam) {
      setUrl(urlParam);
      setUrlLoadDone(true);
      return;
    }
    let cancelled = false;
    getVideoBlobUrl()
      .then(blobUrl => {
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
    const endTime =
      endTimeParam != null ? parseFloat(endTimeParam) : durationNum || 60;

    const segments = transcript
      ? transcript
          .split(/[.!?،؛]+/)
          .filter(s => s.trim().length > 0)
          .map((text, index, arr) => {
            const segmentDuration = durationNum / Math.max(arr.length, 1);
            return {
              text: text.trim(),
              start: index * segmentDuration,
              end: (index + 1) * segmentDuration,
              language: /[\u0600-\u06FF]/.test(text)
                ? ("ar" as const)
                : ("en" as const),
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
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      endTime <= startTime
    )
      return null;

    let parsed: Array<{ text: string; start: number; end: number }> | null =
      null;

    if (fullTranscriptParam === "1" && typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem("reelify_segments");
        if (raw) {
          const data = JSON.parse(raw) as unknown;
          if (Array.isArray(data) && data.length > 0) parsed = data;
        }
      } catch {
        // Ignore invalid sessionStorage data
      }
    }

    if (!parsed && segmentsParam) {
      try {
        const decoded = atob(segmentsParam);
        const data = JSON.parse(decoded) as unknown;
        if (Array.isArray(data) && data.length > 0) parsed = data;
      } catch {
        // Ignore invalid base64/JSON
      }
    }

    if (!parsed) return null;
    return {
      segments: parsed,
      reelStart: startTime,
      reelEnd: endTime,
    };
  }, [fullTranscriptParam, segmentsParam, startTimeParam, endTimeParam]);

  const reelExcerptText = useMemo(() => {
    if (!fullTranscriptSegments) return "";
    return fullTranscriptSegments.segments
      .filter(
        seg =>
          seg.start < fullTranscriptSegments.reelEnd &&
          seg.end > fullTranscriptSegments.reelStart,
      )
      .map(seg => seg.text)
      .join(" ");
  }, [fullTranscriptSegments]);

  const firstReelSegmentIndex = useMemo(() => {
    if (!fullTranscriptSegments) return -1;
    return fullTranscriptSegments.segments.findIndex(
      seg =>
        seg.start < fullTranscriptSegments.reelEnd &&
        seg.end > fullTranscriptSegments.reelStart,
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
        const newScrollTop =
          container.scrollTop + offsetFromVisibleTop - padding;
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
          <p className="text-lg text-muted-foreground">{t('loadingVideo')}</p>
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
              <img
                src="/Transparent black.png"
                alt="Reelify logo"
                className="h-10 w-auto"
              />
            </div>
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-foreground">
              {t('videoUrlMissing')}
            </p>
            <Button
              className="bg-gradient-teal hover:shadow-teal transition-all duration-200"
              onClick={() => window.close()}>
              {tCommon('close')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDownloadVideo = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${title}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleDownloadThumbnail = async () => {
    if (!thumbnail) return;
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

  const videoFitClass =
    isPortrait === false ? "object-contain" : "object-cover";
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
  const isReelOnly =
    reelStart != null && reelEnd != null && reelEnd > reelStart;

  const playbackStart = isReelOnly && reelStart != null ? reelStart : 0;
  const playbackEnd =
    isReelOnly && reelEnd != null ? reelEnd : videoDuration || 0;

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* Video Info */}
          <Card
            className="shadow-card border-0 bg-gradient-card animate-fade-in h-full"
            style={{ animationDelay: "0.1s" }}>
            <CardContent className="p-6 lg:p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="inline-flex items-center px-4 py-1.5 text-sm font-semibold bg-primary/10 text-primary rounded-full">
                    {category}
                  </span>
                  {duration && (
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {duration} {tCommon('seconds')}
                    </span>
                  )}
                </div>
                <h1 className="text-3xl font-bold text-foreground leading-snug">
                  {title}
                </h1>
              </div>

              <div className="flex justify-start">
                <Button
                  onClick={() => {
                    const editorParams = new URLSearchParams({
                      ...(url && !url.startsWith("blob:")
                        ? { videoUrl: url }
                        : {}),
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
                  className="bg-gradient-teal text-white hover:shadow-teal transition-all duration-200">
                  <svg
                    className="w-5 h-5 me-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  {t('editVideo')}
                </Button>
              </div>

              {tags.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                    {t('tags')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-4 py-1.5 text-sm bg-muted text-foreground rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(transcript || fullTranscriptSegments) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    {t('transcript')}
                  </h3>
                  {fullTranscriptSegments && reelExcerptText && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-foreground/70">
                        {t('selectedClip')}
                      </p>
                    </div>
                  )}
                  <div
                    ref={transcriptScrollContainerRef}
                    className="p-5 bg-muted/50 rounded-2xl text-base text-foreground/80 leading-relaxed max-h-[300px] overflow-y-auto border border-border/50">
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
                                    i === firstReelSegmentIndex
                                      ? firstReelSegmentRef
                                      : undefined
                                  }
                                  className="bg-amber-200/90 dark:bg-amber-400/40 text-foreground rounded px-1 py-0.5 font-medium"
                                  title={t('selectedClip')}>
                                  {seg.text}
                                </span>
                              ) : (
                                seg.text
                              )}
                              {i < fullTranscriptSegments.segments.length - 1
                                ? " "
                                : ""}
                            </span>
                          );
                        })
                      : transcript}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  {t('downloads')}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Button
                    onClick={handleDownloadVideo}
                    className="w-full text-white h-12 bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
                    <svg
                      className="w-5 h-5 me-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    {t('downloadVideo')}
                  </Button>
                  {thumbnail && (
                    <Button
                      onClick={handleDownloadThumbnail}
                      variant="outline"
                      className="w-full h-12 border-2 hover:bg-primary/5 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
                      <svg
                        className="w-5 h-5 me-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {t('downloadImage')}
                    </Button>
                  )}
                  {transcript && (
                    <Button
                      onClick={handleDownloadTranscript}
                      variant="outline"
                      className="w-full h-12 border-2 hover:bg-primary/5 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
                      <svg
                        className="w-5 h-5 me-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      {t('downloadText')}
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
                  onLoadedMetadata={event => {
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
                  onTimeUpdate={event => {
                    const video = event.currentTarget;
                    setCurrentTime(video.currentTime);
                    if (!isReelOnly || reelEnd == null) return;
                    if (video.currentTime >= reelEnd) {
                      video.pause();
                      video.currentTime = reelEnd;
                    }
                  }}
                  onSeeked={event => {
                    if (!isReelOnly || reelStart == null || reelEnd == null)
                      return;
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
                    {formatTime(currentTime)} /{" "}
                    {formatTime(playbackEnd || videoDuration)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSeekBack}
                      className="p-2 rounded-lg text-primary hover:bg-primary/20 transition-colors"
                      title={t('seekBack')}
                      aria-label={t('seekBack')}>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handlePlayPause}
                      className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                      title={isPlaying ? t('pause') : t('play')}
                      aria-label={isPlaying ? t('pause') : t('play')}>
                      {isPlaying ? (
                        <svg
                          className="w-6 h-6"
                          fill="currentColor"
                          viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg
                          className="w-6 h-6"
                          fill="currentColor"
                          viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleSeekForward}
                      className="p-2 rounded-lg text-primary hover:bg-primary/20 transition-colors"
                      title={t('seekForward')}
                      aria-label={t('seekForward')}>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11.934 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleReplay}
                      className="p-2 rounded-lg text-primary hover:bg-primary/20 transition-colors"
                      title={t('replay')}
                      aria-label={t('replay')}>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
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
  const t = useTranslations('common');
  
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
          <div className="text-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-lg text-muted-foreground">{t('loading')}</p>
          </div>
        </div>
      }>
      <PreviewContent />
    </Suspense>
  );
}
