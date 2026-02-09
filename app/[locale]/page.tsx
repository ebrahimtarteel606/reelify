"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  getFfmpeg,
  writeInputFile,
  extractAudioWav,
  cleanupInputFile,
  extractThumbnail,
} from "@/lib/ffmpegWasm";
import {
  storeVideoFile,
  storeThumbnails,
  getThumbnailBlobUrl,
  storeAudioFile,
  getAudioFile,
  clearAllStorage,
} from "@/lib/videoStorage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import Image from "next/image";
import {
  Book,
  Briefcase,
  Camera,
  CloudAdd,
  Cpu,
  Eye,
  Facebook,
  Flash,
  Flashy,
  Flag,
  Hashtag,
  InfoCircle,
  Instagram,
  LampOn,
  MessageQuestion,
  Music,
  Play,
  Profile2User,
  Snapchat,
  Star,
  TickCircle,
  Timer1,
  TrendUp,
  Warning2,
  Wind,
  Youtube,
  type Icon,
} from "vuesax-icons-react";
import { playSuccessSound } from "@/lib/utils/audioUtils";
import posthog from "posthog-js";

type ClipItem = {
  title: string;
  duration: number;
  url: string;
  start: number;
  end: number;
  thumbnail: string;
  category: string;
  tags: string[];
  transcript: string;
};

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type PlatformKey = "instagram" | "tiktok" | "youtube" | "snapchat" | "facebook" | "linkedin";

type IconType = Icon;

// Max video duration (2 hours) – enforced client and server to protect credits
const MAX_VIDEO_DURATION_SECONDS = 2 * 60 * 60;

export default function HomePage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("home");
  const tLoading = useTranslations("loading");
  const tResults = useTranslations("results");
  const tCommon = useTranslations("common");

  const [file, setFile] = useState<File | null>(null);
  const [isValidatingVideo, setIsValidatingVideo] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [screen, setScreen] = useState<"upload" | "form" | "loading" | "results">("upload");
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [platform, setPlatform] = useState<PlatformKey>("instagram");
  const [preferredDuration, setPreferredDuration] = useState(45);
  const [audience, setAudience] = useState("");
  const [audienceSkipped, setAudienceSkipped] = useState(false);
  const [tone, setTone] = useState("");
  const [toneSkipped, setToneSkipped] = useState(false);
  const [hookStyle, setHookStyle] = useState("");
  const [hookStyleSkipped, setHookStyleSkipped] = useState(false);
  const [skipQuestions, setSkipQuestions] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Fetch current user credits on mount and identify PostHog user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data?.credits_remaining === "number") {
          setCreditsRemaining(data.credits_remaining);
        }
        // Identify user in PostHog if we have an ID
        if (data?.id) {
          posthog.identify(data.id, {
            credits_remaining: data.credits_remaining,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    posthog.capture("user_logged_out");
    posthog.reset();
    document.cookie = "reelify_user_id=; path=/; max-age=0; SameSite=Lax";
    if (typeof globalThis.window !== "undefined") {
      globalThis.localStorage.removeItem("reelify_user_id");
    }
    router.push("/login");
  };

  // Set default values based on locale
  useEffect(() => {
    if (locale === "ar") {
      if (!audience) setAudience("شباب 18-30");
      if (!tone) setTone("ملهم");
      if (!hookStyle) setHookStyle("سؤال مباشر");
    } else {
      if (!audience) setAudience("Youth 18-30");
      if (!tone) setTone("Inspiring");
      if (!hookStyle) setHookStyle("Direct question");
    }
  }, [locale]);

  const recommendedDurationMap: Record<PlatformKey, number> = {
    instagram: 45,
    tiktok: 60,
    youtube: 60,
    snapchat: 30,
    facebook: 45,
    linkedin: 45,
  };

  const [currentRecommendationIndex, setCurrentRecommendationIndex] = useState<number>(0);

  // Get recommendations - show all platforms when skipQuestions is true
  const currentRecommendations = useMemo(() => {
    if (skipQuestions) {
      // Show all platform recommendations when skipping questions
      const allPlatforms: PlatformKey[] = [
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "snapchat",
        "linkedin",
      ];
      const allRecs: string[] = [];
      allPlatforms.forEach((plat) => {
        const recs = t.raw(`platformRecommendations.${plat}`) as string[];
        if (Array.isArray(recs)) {
          allRecs.push(...recs);
        }
      });
      return allRecs;
    } else {
      const recs = t.raw(`platformRecommendations.${platform}`) as string[];
      return Array.isArray(recs) ? recs : [];
    }
  }, [platform, t, skipQuestions]);

  const [backgroundResult, setBackgroundResult] = useState<{
    ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>;
    inputName: string;
    audioUrl: string;
  } | null>(null);
  const [backgroundError, setBackgroundError] = useState<string>("");
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  const [thumbnailGenerating, setThumbnailGenerating] = useState<Set<number>>(new Set());

  const backgroundResultRef = useRef(backgroundResult);
  const backgroundErrorRef = useRef(backgroundError);
  const backgroundProcessingRef = useRef(backgroundProcessing);

  useEffect(() => {
    backgroundResultRef.current = backgroundResult;
  }, [backgroundResult]);

  useEffect(() => {
    backgroundErrorRef.current = backgroundError;
  }, [backgroundError]);

  useEffect(() => {
    backgroundProcessingRef.current = backgroundProcessing;
  }, [backgroundProcessing]);

  const clearTranscriptStorage = () => {
    if (typeof globalThis.window === "undefined") return;
    globalThis.sessionStorage.removeItem("reelify_segments");
    globalThis.localStorage.removeItem("reelify_segments");
  };

  // Rotate through recommendations every 4 seconds when on loading screen
  useEffect(() => {
    if (screen === "loading") {
      if (currentRecommendations.length > 1) {
        const interval = setInterval(() => {
          setCurrentRecommendationIndex((prev) => (prev + 1) % currentRecommendations.length);
        }, 4000);

        return () => clearInterval(interval);
      }
    } else {
      setCurrentRecommendationIndex(0);
    }
  }, [screen, currentRecommendations.length]);

  // Clear IndexedDB on page refresh or close
  useEffect(() => {
    if (typeof globalThis.window === "undefined") return;

    const navEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const isRefresh = navEntry?.type === "reload";

    if (isRefresh) {
      const hasActiveSession = globalThis.sessionStorage.getItem("reelify_clips") !== null;
      if (hasActiveSession) {
        console.log("[IndexedDB] Page refreshed but active session exists, preserving storage...");
      } else {
        console.log("[IndexedDB] Page refreshed with no active session, clearing storage...");
        void clearAllStorage();
      }
    }

    const handleBeforeUnload = () => {
      console.log("[IndexedDB] Page closing, clearing storage...");
      void clearAllStorage();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Restore state from sessionStorage only when navigating back
  useEffect(() => {
    if (typeof globalThis.window === "undefined") return;

    const navigationState = globalThis.sessionStorage.getItem("reelify_navigation_back");

    if (navigationState === "true" && screen === "upload") {
      const storedClips = globalThis.sessionStorage.getItem("reelify_clips");
      const storedScreen = globalThis.sessionStorage.getItem("reelify_screen");
      const storedVideoUrl = globalThis.sessionStorage.getItem("reelify_video_url");

      if (storedClips && storedVideoUrl && storedScreen === "results") {
        try {
          const parsedClips = JSON.parse(storedClips);
          if (Array.isArray(parsedClips) && parsedClips.length > 0) {
            const storedSegments = globalThis.sessionStorage.getItem("reelify_segments");
            if (storedSegments) {
              try {
                const parsedSegments = JSON.parse(storedSegments) as TranscriptSegment[];
                if (Array.isArray(parsedSegments)) setSegments(parsedSegments);
              } catch {
                // Ignore invalid segments
              }
            }
            const restoreThumbnails = async () => {
              const clipsWithThumbnails = await Promise.all(
                parsedClips.map(async (clip: ClipItem, index: number) => {
                  const clipKey = `thumb-${clip.start}-${clip.end}`;
                  const thumbnailUrl = await getThumbnailBlobUrl(clipKey);
                  if (thumbnailUrl) {
                    return { ...clip, thumbnail: thumbnailUrl };
                  }
                  // Mark as generating if thumbnail is missing
                  setThumbnailGenerating((prev) => new Set(prev).add(index));
                  return { ...clip, thumbnail: "" };
                })
              );
              setClips(clipsWithThumbnails);
            };

            setVideoBlobUrl(storedVideoUrl);
            setScreen("results");
            void restoreThumbnails();
            globalThis.sessionStorage.removeItem("reelify_navigation_back");
          }
        } catch (e) {
          console.error("Failed to restore clips from sessionStorage:", e);
          globalThis.sessionStorage.removeItem("reelify_navigation_back");
        }
      } else {
        globalThis.sessionStorage.removeItem("reelify_navigation_back");
      }
    }
  }, [screen]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
      }
    };
  }, [videoBlobUrl]);

  const generateThumbnailsInParallel = async (
    ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
    inputName: string,
    clips: ClipItem[],
    videoFile: File | null,
    onThumbnailGenerated?: (index: number, thumbnailUrl: string) => void
  ): Promise<string[]> => {
    const thumbnailData: { blob: Blob; clipKey: string }[] = [];

    try {
      await ffmpeg.readFile(inputName);
      console.log("[Thumbnails] Input file verified in FFmpeg filesystem");
    } catch (error) {
      console.warn("[Thumbnails] Input file not found in FFmpeg filesystem, re-writing...", error);
      if (videoFile) {
        try {
          await writeInputFile(ffmpeg, inputName, videoFile);
          console.log("[Thumbnails] Input file re-written successfully");
        } catch (rewriteError) {
          console.error("[Thumbnails] Failed to re-write input file:", rewriteError);
          throw new Error("Failed to prepare video file for thumbnail generation");
        }
      } else {
        throw new Error("Video file not available for thumbnail generation");
      }
    }

    // Process thumbnails sequentially to avoid memory issues with large files
    // FFmpeg WASM can run out of memory when processing multiple thumbnails in parallel
    const blobUrls: string[] = [];

    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      let retries = 0;
      const maxRetries = 3; // Increased retries
      let success = false;

      // Mark thumbnail as generating
      if (onThumbnailGenerated) {
        setThumbnailGenerating((prev) => new Set(prev).add(index));
      }

      while (retries <= maxRetries && !success) {
        try {
          if (retries > 0) {
            console.log(
              `[Thumbnails] Retry ${retries}/${maxRetries} for thumbnail ${
                index + 1
              } at ${clip.start}s`
            );
            // Wait longer before retrying to allow memory to be freed
            await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
          } else {
            console.log(
              `[Thumbnails] Generating thumbnail ${index + 1}/${clips.length} at ${clip.start}s`
            );
          }

          const thumbName = `thumb-${crypto.randomUUID()}.jpg`;
          const thumbBlob = await extractThumbnail(ffmpeg, inputName, thumbName, clip.start);

          const clipKey = `thumb-${clip.start}-${clip.end}`;
          const blobUrl = URL.createObjectURL(thumbBlob);
          thumbnailData.push({ blob: thumbBlob, clipKey });
          blobUrls.push(blobUrl);
          success = true;

          // Update UI immediately when thumbnail is ready
          if (onThumbnailGenerated) {
            onThumbnailGenerated(index, blobUrl);
            setThumbnailGenerating((prev) => {
              const next = new Set(prev);
              next.delete(index);
              return next;
            });
          }

          // Longer delay between extractions to allow memory cleanup
          // Increased delay helps prevent "memory access out of bounds" errors with large files
          if (index < clips.length - 1) {
            // Force garbage collection hint and wait longer for large files
            if (typeof globalThis.gc === "function") {
              globalThis.gc();
            }
            await new Promise((resolve) => setTimeout(resolve, 500)); // Increased from 200ms to 500ms
          }
        } catch (error) {
          const isMemoryError =
            error instanceof Error &&
            (error.message.includes("memory") ||
              error.message.includes("out of bounds") ||
              error.name === "RuntimeError" ||
              (error as any).name === "RuntimeError");

          if (isMemoryError && retries < maxRetries) {
            retries++;
            console.warn(
              `[Thumbnails] Memory error for thumbnail ${index + 1}, will retry...`,
              error
            );
            // Wait progressively longer before retrying
            await new Promise((resolve) => setTimeout(resolve, 2000 * retries));

            // Force garbage collection if available
            if (typeof globalThis.gc === "function") {
              globalThis.gc();
            }
          } else {
            console.error(
              `[Thumbnails] Failed to generate thumbnail for clip ${index} after ${retries} retries:`,
              error
            );
            blobUrls.push("");
            success = true; // Stop retrying and move to next thumbnail

            // Remove from generating set
            if (onThumbnailGenerated) {
              setThumbnailGenerating((prev) => {
                const next = new Set(prev);
                next.delete(index);
                return next;
              });
            }

            // If we got a memory error, wait longer before trying the next one
            if (isMemoryError && index < clips.length - 1) {
              console.warn(
                "[Thumbnails] Memory error detected, waiting longer before next extraction..."
              );
              await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased from 1000ms to 2000ms
            }
          }
        }
      }
    }

    if (thumbnailData.length > 0) {
      try {
        console.log("[Thumbnails] Storing", thumbnailData.length, "thumbnails in IndexedDB");
        await storeThumbnails(thumbnailData);
        console.log("[Thumbnails] Successfully stored thumbnails in IndexedDB");
      } catch (error) {
        console.error("[Thumbnails] Failed to store thumbnails in IndexedDB:", error);
      }
    }

    return blobUrls;
  };

  const persistPreferences = async (partial: Record<string, unknown>) => {
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(partial),
      });
    } catch {
      // Best-effort persistence during processing.
    }
  };

  const startBackgroundProcessing = async (videoFile: File) => {
    setBackgroundProcessing(true);
    setBackgroundError("");
    setBackgroundResult(null);
    setProgress(0);
    setStatus(tLoading("preparingVideo"));

    const fileSizeMB = videoFile.size / (1024 * 1024);
    console.log(
      `[Background Processing] Starting audio extraction for ${fileSizeMB.toFixed(2)}MB file`
    );

    try {
      setProgress(5);
      setStatus(tLoading("loadingTools"));
      const loadStart = Date.now();
      const ffmpeg = await getFfmpeg();
      console.log(`[Background Processing] FFmpeg loaded in ${Date.now() - loadStart}ms`);

      setProgress(10);
      setStatus(tLoading("readingFile"));
      const writeStart = Date.now();
      const inputName = `input-${Date.now()}.mp4`;
      await writeInputFile(ffmpeg, inputName, videoFile);
      console.log(
        `[Background Processing] Video file written to FFmpeg filesystem in ${
          Date.now() - writeStart
        }ms`
      );

      setProgress(15);
      setStatus(tLoading("extractingAudio"));
      const extractStart = Date.now();
      const audioName = `audio-${Date.now()}.opus`;
      console.log(`[Background Processing] Starting audio extraction...`);
      const audioBlob = await extractAudioWav(ffmpeg, inputName, audioName);
      const extractTime = Date.now() - extractStart;
      console.log(
        `[Background Processing] Audio extraction completed in ${(extractTime / 1000).toFixed(
          1
        )}s (${(audioBlob.size / 1024 / 1024).toFixed(2)}MB)`
      );

      setProgress(20);

      const audioFile = new File([audioBlob], "audio.opus", {
        type: "audio/ogg",
      });
      await storeAudioFile(audioFile);

      const audioBlobUrl = URL.createObjectURL(audioFile);

      setBackgroundResult({
        ffmpeg,
        inputName,
        audioUrl: audioBlobUrl,
      });

      console.log(`[Background Processing] Background processing completed successfully`);
    } catch (err) {
      console.error("[Background Processing] Error during background processing:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Background Processing] Error details:", {
        message: errorMessage,
        fileSizeMB: fileSizeMB.toFixed(2),
        errorType: err instanceof Error ? err.constructor.name : typeof err,
      });
      const message = errorMessage || tLoading("processingError");
      setBackgroundError(message);
    } finally {
      setBackgroundProcessing(false);
      console.log(`[Background Processing] Background processing finished`);
    }
  };

  const onUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setProgress(0);
    setCurrentRecommendationIndex(0);
    setClips([]);
    setBackgroundError("");
    setBackgroundResult(null);

    if (!file) {
      setError(t("selectVideoError"));
      return;
    }

    clearTranscriptStorage();
    await clearAllStorage();
    await storeVideoFile(file);

    const blobUrl = URL.createObjectURL(file);
    setVideoBlobUrl(blobUrl);

    if (typeof globalThis.window !== "undefined") {
      globalThis.sessionStorage.removeItem("reelify_clips");
      globalThis.sessionStorage.removeItem("reelify_segments");
      globalThis.sessionStorage.removeItem("reelify_screen");
      globalThis.sessionStorage.removeItem("reelify_video_url");
      globalThis.sessionStorage.removeItem("reelify_video_name");
      globalThis.sessionStorage.removeItem("reelify_navigation_back");
      globalThis.sessionStorage.removeItem("reelify_platform");
      globalThis.sessionStorage.setItem("reelify_video_blob_url", blobUrl);
    }

    posthog.capture("video_uploaded", {
      file_size_mb: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
      duration_seconds: Math.round(videoDuration),
      file_type: file.type,
    });

    setStep(1);
    setScreen("form");

    void startBackgroundProcessing(file);
  };

  const onStartProcessing = async () => {
    setError("");
    setScreen("loading");
    setIsProcessing(true);

    posthog.capture("processing_started", {
      platform,
      preferred_duration: preferredDuration,
      audience: audienceSkipped ? null : audience,
      tone: toneSkipped ? null : tone,
      hook_style: hookStyleSkipped ? null : hookStyle,
      source_duration_seconds: Math.round(videoDuration),
      locale,
    });

    try {
      // Calculate timeout based on file size (allow more time for larger files)
      // For a 600MB file, audio extraction can take 5-10+ minutes
      // Estimate: ~1 minute per 100MB, minimum 2 minutes, maximum 30 minutes
      const fileSizeMB = file ? file.size / (1024 * 1024) : 0;
      const estimatedMinutes = Math.max(2, Math.ceil(fileSizeMB / 100));
      const maxWaitMinutes = Math.min(30, estimatedMinutes * 2); // Allow 2x estimated time
      const maxAttempts = maxWaitMinutes * 60 * 10; // 10 checks per second = 100ms intervals

      console.log(
        `[Background Processing] Waiting for audio extraction (file: ${fileSizeMB.toFixed(
          2
        )}MB, max wait: ${maxWaitMinutes} minutes)`
      );

      if (backgroundProcessingRef.current) {
        setStatus(tLoading("waitingAnalysis"));
        let attempts = 0;
        while (backgroundProcessingRef.current && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;

          // Log progress every 30 seconds
          if (attempts % 300 === 0) {
            const waitedSeconds = attempts / 10;
            console.log(
              `[Background Processing] Still waiting... (${waitedSeconds.toFixed(0)}s elapsed)`
            );
          }
        }

        // If we exited the loop but processing is still running, log a warning
        if (backgroundProcessingRef.current) {
          console.warn(
            `[Background Processing] Timeout reached (${maxWaitMinutes} minutes) but processing still running`
          );
        }
      }

      if (backgroundErrorRef.current) {
        throw new Error(backgroundErrorRef.current);
      }

      if (!backgroundResultRef.current) {
        // Check if processing is still running - if so, provide a more helpful error
        if (backgroundProcessingRef.current) {
          throw new Error(
            `Audio extraction is taking longer than expected (${maxWaitMinutes} minutes). Please wait a bit longer and try again, or try with a smaller file.`
          );
        }
        throw new Error(tLoading("videoNotReady"));
      }

      const { ffmpeg, inputName } = backgroundResultRef.current;

      if (!videoBlobUrl) {
        throw new Error(tLoading("videoUrlMissing"));
      }
      const originalVideoUrl = videoBlobUrl;

      if (typeof globalThis.window !== "undefined") {
        globalThis.sessionStorage.setItem("reelify_video_url", originalVideoUrl);
        globalThis.sessionStorage.setItem("reelify_video_name", file?.name || "video.mp4");
        globalThis.sessionStorage.setItem("reelify_platform", platform);
      }

      const sessionPreferences: Record<string, unknown> = {};
      sessionPreferences.platform = platform;
      sessionPreferences.preferredDuration = preferredDuration;

      if (!audienceSkipped && audience.trim()) {
        sessionPreferences.audience = audience.trim();
      }

      if (!toneSkipped && tone.trim()) {
        sessionPreferences.tone = tone.trim();
      }

      if (!hookStyleSkipped && hookStyle.trim()) {
        sessionPreferences.hookStyle = hookStyle.trim();
      }

      setProgress(20);
      setStatus(tLoading("analyzingContent"));

      const audioFile = await getAudioFile();
      if (!audioFile) {
        throw new Error(tLoading("audioNotFound"));
      }

      setProgress(20);

      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("preferences", JSON.stringify(sessionPreferences));

      // Credit system: attach user ID and video duration
      const storedUserId =
        typeof globalThis.window !== "undefined"
          ? (globalThis.localStorage.getItem("reelify_user_id") ??
            document.cookie.match(/reelify_user_id=([^;]+)/)?.[1] ??
            "")
          : "";
      if (storedUserId) {
        formData.append("user_id", storedUserId);
      }
      if (videoDuration > 0) {
        if (videoDuration > MAX_VIDEO_DURATION_SECONDS) {
          throw new Error(t("videoTooLong"));
        }
        formData.append("source_duration_seconds", String(Math.ceil(videoDuration)));
      }

      let progressValue = 20;
      const progressInterval = setInterval(() => {
        progressValue = Math.min(progressValue + 0.3, 92);
        setProgress(Math.floor(progressValue));
      }, 300);

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress((prev) => Math.max(prev, 85));
      await new Promise((resolve) => setTimeout(resolve, 100));

      const payload = await response.json();
      if (!response.ok) {
        const serverError = payload?.error ?? "";
        const isTooLong =
          typeof serverError === "string" && serverError.toLowerCase().includes("video too long");
        throw new Error(isTooLong ? t("videoTooLong") : serverError || tLoading("analysisError"));
      }

      const candidates = Array.isArray(payload?.clips) ? payload.clips : [];
      const segments: TranscriptSegment[] = Array.isArray(payload?.segments)
        ? payload.segments
        : [];

      if (candidates.length === 0) {
        throw new Error(tLoading("noClipsFound"));
      }

      setProgress(88);
      setStatus(tLoading("preparingClipsShort"));
      await new Promise((resolve) => setTimeout(resolve, 100));

      const getClipTranscript = (start: number, end: number): string => {
        return segments
          .filter((seg) => seg.end > start && seg.start < end)
          .map((seg) => seg.text)
          .join(" ");
      };
      const uploadedClips: ClipItem[] = [];

      for (const candidate of candidates) {
        const duration = Math.max(0, candidate.end - candidate.start);
        const clipTranscript = getClipTranscript(candidate.start, candidate.end);

        uploadedClips.push({
          title: candidate.title,
          start: candidate.start,
          end: candidate.end,
          duration,
          url: originalVideoUrl,
          thumbnail: "",
          category: candidate.category || (locale === "ar" ? "عام" : "General"),
          tags: Array.isArray(candidate.tags) ? candidate.tags : [],
          transcript: clipTranscript,
        });
      }

      setProgress(92);
      await new Promise((resolve) => setTimeout(resolve, 150));
      setClips(uploadedClips);
      setSegments(segments);

      // Mark all thumbnails as generating immediately so loading state shows right away
      setThumbnailGenerating(new Set(uploadedClips.map((_, index) => index)));

      setProgress(96);
      await new Promise((resolve) => setTimeout(resolve, 150));
      setStatus("");
      setProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 200));
      setScreen("results");

      // Refresh credits display after successful processing
      fetch("/api/me", { credentials: "include" })
        .then((r) => r.ok && r.json())
        .then((data) => {
          if (typeof data?.credits_remaining === "number") {
            setCreditsRemaining(data.credits_remaining);
          }
        })
        .catch(() => {});

      posthog.capture("processing_completed", {
        platform,
        clips_generated: uploadedClips.length,
        source_duration_seconds: Math.round(videoDuration),
      });

      // Play congratulation sound when processing is complete
      playSuccessSound();

      void generateThumbnailsInParallel(
        ffmpeg,
        inputName,
        uploadedClips,
        file,
        (index, thumbnailUrl) => {
          // Update thumbnail immediately as it's generated
          setClips((prevClips) => {
            const updatedClips = prevClips.map((clip, i) => {
              if (i === index) {
                console.log(
                  `[Thumbnails] Setting thumbnail for clip ${index} (${clip.start}-${clip.end})`
                );
                return {
                  ...clip,
                  thumbnail: thumbnailUrl,
                };
              }
              return clip;
            });
            if (typeof globalThis.window !== "undefined") {
              globalThis.sessionStorage.setItem("reelify_clips", JSON.stringify(updatedClips));
            }
            return updatedClips;
          });
        }
      )
        .then((thumbnails) => {
          console.log("[Thumbnails] Generated thumbnails:", thumbnails.length, "URLs");
          // Final update to ensure all thumbnails are set
          setClips((prevClips) => {
            const updatedClips = prevClips.map((clip, index) => {
              const thumbnailUrl = thumbnails[index] || clip.thumbnail;
              if (thumbnailUrl && !clip.thumbnail) {
                console.log(
                  `[Thumbnails] Final update: Setting thumbnail for clip ${index} (${clip.start}-${clip.end})`
                );
              }
              return {
                ...clip,
                thumbnail: thumbnailUrl || clip.thumbnail,
              };
            });
            if (typeof globalThis.window !== "undefined") {
              globalThis.sessionStorage.setItem("reelify_clips", JSON.stringify(updatedClips));
            }
            return updatedClips;
          });
          setThumbnailGenerating(new Set()); // Clear all generating flags
        })
        .catch((error) => {
          console.error("[Thumbnails] Error generating thumbnails:", error);
        })
        .finally(() => {
          void cleanupInputFile(ffmpeg, inputName);
        });

      if (typeof globalThis.window !== "undefined") {
        globalThis.sessionStorage.setItem("reelify_clips", JSON.stringify(uploadedClips));
        globalThis.sessionStorage.setItem("reelify_segments", JSON.stringify(segments));
        globalThis.localStorage.setItem("reelify_segments", JSON.stringify(segments));
        globalThis.sessionStorage.setItem("reelify_screen", "results");
      }
    } catch (err) {
      console.error("Processing error:", err);
      let message = tLoading("processingFailed");
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "string") {
        message = err;
      } else if (err && typeof err === "object" && "message" in err) {
        message = String((err as { message: unknown }).message);
      }
      posthog.capture("processing_failed", {
        error_message: message,
        platform,
        source_duration_seconds: Math.round(videoDuration),
      });
      setError(message);
      setStatus("");
      setProgress(0);
      setScreen("form");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkipQuestions = async () => {
    posthog.capture("questions_skipped", {
      platform,
      preferred_duration: preferredDuration,
    });
    setError("");
    setStatus("");
    // Don't persist preferences when skipping questions - let AI decide
    void onStartProcessing();
  };

  const totalSteps = 5;

  const questionTitles: Record<number, string> = {
    1: t("questions.platform"),
    2: t("questions.duration"),
    3: t("questions.audience"),
    4: t("questions.tone"),
    5: t("questions.hookStyle"),
  };

  const platformIcons: Record<PlatformKey, IconType> = {
    instagram: Instagram,
    youtube: Youtube,
    facebook: Facebook,
    linkedin: Briefcase,
    tiktok: Music,
    snapchat: Snapchat,
  };

  const platformIconColors: Record<PlatformKey, string> = {
    instagram: "text-pink-500",
    youtube: "text-red-600",
    facebook: "text-blue-600",
    linkedin: "text-[#0A66C2]",
    tiktok: "text-black",
    snapchat: "text-yellow-500",
  };

  const stepIcons: Record<number, IconType> = {
    1: platformIcons[platform],
    2: Timer1,
    3: Profile2User,
    4: Star,
    5: InfoCircle,
  };

  const stepIconColors: Record<number, string> = {
    1: platformIconColors[platform],
    2: "text-foreground",
    3: "text-foreground",
    4: "text-foreground",
    5: "text-foreground",
  };

  const QuestionIcon = stepIcons[step];
  const questionIconColor = stepIconColors[step];

  const platformOptions = [
    {
      value: "instagram" as PlatformKey,
      label: t("platforms.instagram"),
      color: "text-pink-500",
    },
    {
      value: "tiktok" as PlatformKey,
      label: t("platforms.tiktok"),
      color: "text-black",
    },
    {
      value: "youtube" as PlatformKey,
      label: t("platforms.youtube"),
      color: "text-red-600",
    },
    {
      value: "snapchat" as PlatformKey,
      label: t("platforms.snapchat"),
      color: "text-yellow-400",
    },
    {
      value: "facebook" as PlatformKey,
      label: t("platforms.facebook"),
      color: "text-blue-600",
    },
    {
      value: "linkedin" as PlatformKey,
      label: t("platforms.linkedin"),
      color: "text-[#0A66C2]",
    },
  ];

  const audienceOptions = [
    {
      value: t("audiences.youth"),
      icon: <Profile2User size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("audiences.entrepreneurs"),
      icon: <Briefcase size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("audiences.selfDevelopment"),
      icon: <TrendUp size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("audiences.students"),
      icon: <Book size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("audiences.techProfessionals"),
      icon: <Cpu size={28} variant="Bold" className="text-primary" />,
    },
  ];

  const toneOptions = [
    {
      value: t("tones.inspiring"),
      icon: <Star size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("tones.educational"),
      icon: <Book size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("tones.energetic"),
      icon: <Flashy size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("tones.calm"),
      icon: <Wind size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("tones.practical"),
      icon: <Flag size={28} variant="Bold" className="text-primary" />,
    },
  ];

  const hookStyleOptions = [
    {
      value: t("hookStyles.directQuestion"),
      icon: <MessageQuestion size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("hookStyles.strongNumber"),
      icon: <Hashtag size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("hookStyles.quickPromise"),
      icon: <Flash size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("hookStyles.shortStory"),
      icon: <Book size={28} variant="Bold" className="text-primary" />,
    },
    {
      value: t("hookStyles.warning"),
      icon: <Warning2 size={28} variant="Bold" className="text-primary" />,
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-warm">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 pb-24 pt-10">
        <div className="flex items-center justify-between">
          <div className="flex-1 flex items-center justify-start">
            <span className="badge-closed-beta inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold tracking-widest uppercase">
              <span className="badge-closed-beta-dot h-1.5 w-1.5 rounded-full bg-white/90" />
              {tCommon("closedBeta")}
            </span>
          </div>
          <Link href={`/${locale}`}>
            <Image
              src="/Transparent white1.png"
              alt="Reelify"
              width={200}
              height={100}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
          <div className="flex-1 flex items-center justify-end gap-3">
            {creditsRemaining !== null && (
              <span
                className="badge-credits inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white"
                title={tCommon("creditsRemaining", { count: creditsRemaining })}
              >
                <Flash className="w-4 h-4 opacity-90" size={16} />
                {tCommon("creditsRemaining", { count: creditsRemaining })}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowLogoutConfirm(true)}
              className="shrink-0"
            >
              {tCommon("logout")}
            </Button>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Logout confirmation dialog */}
        <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <DialogContent className="gap-5 sm:max-w-md">
            <DialogTitle className="text-xl">{tCommon("logoutConfirmTitle")}</DialogTitle>
            <DialogDescription>{tCommon("logoutConfirmMessage")}</DialogDescription>
            <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setShowLogoutConfirm(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" variant="destructive" onClick={handleLogout}>
                {tCommon("logout")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <header className="text-center space-y-4 animate-fade-in mt-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            {t("title")}
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            {t("subtitle")}
          </p>
        </header>

        {/* Upload Screen */}
        {screen === "upload" && (
          <Card className="shadow-card border-0 bg-gradient-card animate-fade-in hover:shadow-card-hover transition-all duration-500">
            <CardContent className="p-10">
              <form className="flex flex-col items-center gap-8" onSubmit={onUploadSubmit}>
                <div className="w-full">
                  <label
                    htmlFor="video"
                    className="group flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-primary/20 rounded-2xl cursor-pointer bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 hover:scale-[1.01]"
                  >
                    <div className="flex flex-col items-center justify-center pt-6 pb-8">
                      <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <CloudAdd className="w-8 h-8 text-primary" size={32} />
                      </div>
                      <p className="mb-2 text-base text-foreground">
                        <span className="font-semibold text-primary">{t("uploadLabel")}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">{t("uploadFormats")}</p>
                    </div>
                    <input
                      id="video"
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(event) => {
                        const selectedFile = event.target.files?.[0] ?? null;
                        if (!selectedFile) {
                          setFile(null);
                          setVideoDuration(0);
                          return;
                        }
                        const maxSize = 1024 * 1024 * 1024;
                        if (selectedFile.size > maxSize) {
                          setFile(null);
                          setVideoDuration(0);
                          setError(t("fileTooLarge"));
                          return;
                        }
                        setError("");
                        setFile(selectedFile);
                        setIsValidatingVideo(true);

                        // Extract video duration via a temporary video element
                        const tempUrl = URL.createObjectURL(selectedFile);
                        const tempVideo = document.createElement("video");
                        tempVideo.preload = "metadata";
                        tempVideo.onloadedmetadata = async () => {
                          if (tempVideo.duration && Number.isFinite(tempVideo.duration)) {
                            const durationSec = tempVideo.duration;
                            if (durationSec > MAX_VIDEO_DURATION_SECONDS) {
                              setFile(null);
                              setVideoDuration(0);
                              setIsValidatingVideo(false);
                              setError(t("videoTooLong"));
                              URL.revokeObjectURL(tempUrl);
                              return;
                            }
                            const storedUserId =
                              typeof globalThis.window !== "undefined"
                                ? (globalThis.localStorage.getItem("reelify_user_id") ??
                                  document.cookie.match(/reelify_user_id=([^;]+)/)?.[1] ??
                                  "")
                                : "";
                            if (storedUserId) {
                              try {
                                const checkRes = await fetch("/api/credits/check", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    user_id: storedUserId,
                                    duration_seconds: durationSec,
                                  }),
                                });
                                const checkPayload = await checkRes.json();
                                if (!checkRes.ok || checkPayload?.ok === false) {
                                  setFile(null);
                                  setVideoDuration(0);
                                  setIsValidatingVideo(false);
                                  setError(
                                    checkPayload?.error?.toLowerCase?.().includes("insufficient")
                                      ? t("insufficientCredits")
                                      : (checkPayload?.error ?? t("insufficientCredits"))
                                  );
                                  URL.revokeObjectURL(tempUrl);
                                  return;
                                }
                              } catch {
                                setFile(null);
                                setVideoDuration(0);
                                setIsValidatingVideo(false);
                                setError(t("insufficientCredits"));
                                URL.revokeObjectURL(tempUrl);
                                return;
                              }
                            }
                            setVideoDuration(durationSec);
                            setIsValidatingVideo(false);
                          } else {
                            setIsValidatingVideo(false);
                          }
                          URL.revokeObjectURL(tempUrl);
                        };
                        tempVideo.onerror = () => {
                          setIsValidatingVideo(false);
                          setFile(null);
                          setVideoDuration(0);
                          URL.revokeObjectURL(tempUrl);
                        };
                        tempVideo.src = tempUrl;
                      }}
                    />
                  </label>
                  <div className="mt-3 space-y-1 text-center">
                    <p className="text-sm font-medium text-muted-foreground">{t("maxFileSize")}</p>
                    <p className="text-sm font-medium text-muted-foreground">{t("maxDuration")}</p>
                  </div>
                  {file && (
                    <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in-scale">
                      {isValidatingVideo ? (
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                          <p className="text-sm text-center text-primary font-medium">
                            {t("checkingVideo")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-center text-primary font-medium flex items-center justify-center gap-2">
                          <TickCircle className="w-5 h-5" size={20} />
                          {t("fileSelected", { filename: file.name })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={!file}
                  size="lg"
                  className="w-full max-w-sm text-white h-14 text-lg font-semibold bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl"
                >
                  {tCommon("continue")}
                </Button>
                {error && <p className="text-sm text-destructive animate-fade-in">{error}</p>}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Form Screen */}
        {screen === "form" && (
          <Card className="shadow-card border-0 bg-gradient-card animate-fade-in hover:shadow-card-hover transition-all duration-500">
            <CardContent className="p-10 space-y-10">
              {/* Progress */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    {t("questionOf", { current: step, total: totalSteps })}
                  </span>
                  <span className="font-semibold text-primary text-lg">
                    {Math.round((step / totalSteps) * 100)}%
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full progress-gradient rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(step / totalSteps) * 100}%` }}
                  />
                </div>
              </div>

              {/* Background Processing Indicator */}
              {backgroundProcessing && (
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium text-primary">
                    {t("analyzingInBackground")}
                  </span>
                </div>
              )}

              {/* Skip Questions Toggle */}
              <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={skipQuestions}
                    onClick={() => setSkipQuestions((prev) => !prev)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
                      skipQuestions ? "bg-primary border-primary" : "bg-background border-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        skipQuestions ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {t("skipQuestionsLabel")}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      AI
                    </span>
                  </div>
                </div>
                {skipQuestions && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSkipQuestions}
                    className="bg-gradient-teal text-white hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    {t("startWithoutQuestions")}
                  </Button>
                )}
              </div>

              {backgroundResult && !backgroundProcessing && (
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 animate-fade-in">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <TickCircle className="w-4 h-4 text-white" size={16} />
                  </div>
                  <span className="text-sm font-medium text-emerald-700">
                    {t("readyToConvert")}
                  </span>
                </div>
              )}

              {backgroundError && (
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
                  <Warning2 className="w-5 h-5 text-red-500" size={20} />
                  <span className="text-sm font-medium text-red-600">{backgroundError}</span>
                </div>
              )}

              {!skipQuestions && (
                <>
                  {/* Question Title */}
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-center text-foreground animate-fade-in">
                      {questionTitles[step]}
                    </h2>
                    {/* Question status badge */}
                    <div className="flex justify-center">
                      {step === 3 && (
                        <>
                          {audienceSkipped && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                              {t("questionSkipped")}
                            </span>
                          )}
                          {!audienceSkipped && audience.trim() && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {t("questionAnswered")}
                            </span>
                          )}
                        </>
                      )}
                      {step === 4 && (
                        <>
                          {toneSkipped && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                              {t("questionSkipped")}
                            </span>
                          )}
                          {!toneSkipped && tone.trim() && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {t("questionAnswered")}
                            </span>
                          )}
                        </>
                      )}
                      {step === 5 && (
                        <>
                          {hookStyleSkipped && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                              {t("questionSkipped")}
                            </span>
                          )}
                          {!hookStyleSkipped && hookStyle.trim() && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {t("questionAnswered")}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive text-center animate-fade-in">{error}</p>
                  )}

                  {/* Step 1: Platform */}
                  {step === 1 && (
                    <div className="grid gap-4 animate-fade-in">
                      {platformOptions.map((option, index) => {
                        const PlatformOptionIcon = platformIcons[option.value];
                        const iconColor = platformIconColors[option.value];
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setPlatform(option.value);
                              const recommendedDuration =
                                recommendedDurationMap[option.value] ?? preferredDuration;
                              setPreferredDuration(recommendedDuration);
                              posthog.capture("platform_selected", {
                                platform: option.value,
                                recommended_duration: recommendedDuration,
                              });
                              void persistPreferences({
                                platform: option.value,
                                preferredDuration: recommendedDuration,
                              });
                            }}
                            className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                              platform === option.value
                                ? "border-primary bg-primary/10 shadow-teal"
                                : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                            }`}
                            style={{ animationDelay: `${index * 0.1}s` }}
                          >
                            <PlatformOptionIcon
                              className={`h-6 w-6 shrink-0 ${iconColor}`}
                              size={24}
                              variant="Bold"
                              aria-hidden
                            />
                            <span className="font-semibold text-lg">{option.label}</span>
                            {platform === option.value && (
                              <TickCircle className="w-6 h-6 text-primary ms-auto" size={24} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Step 2: Duration */}
                  {step === 2 && (
                    <div className="space-y-4 animate-fade-in">
                      <p className="text-sm text-muted-foreground text-center">
                        {t("durationRecommendation", {
                          duration: recommendedDurationMap[platform] ?? preferredDuration,
                          platform: t(`platforms.${platform}`),
                        })}
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        {[30, 45, 60, 75, 90].map((duration, index) => (
                          <button
                            key={duration}
                            type="button"
                            onClick={() => {
                              setPreferredDuration(duration);
                              posthog.capture("duration_selected", {
                                duration_seconds: duration,
                                platform,
                              });
                              void persistPreferences({
                                preferredDuration: duration,
                              });
                            }}
                            className={`p-6 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.05] active:scale-[0.98] ${
                              preferredDuration === duration
                                ? "border-primary bg-primary/10 shadow-teal"
                                : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                            }`}
                            style={{ animationDelay: `${index * 0.1}s` }}
                          >
                            <span className="text-3xl font-bold text-foreground block">
                              {duration}
                            </span>
                            <span className="block text-sm text-muted-foreground mt-1">
                              {tCommon("seconds")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 3: Audience */}
                  {step === 3 && (
                    <div className="grid gap-4 animate-fade-in">
                      {audienceOptions.map((option, index) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setAudience(option.value);
                            setAudienceSkipped(false);
                            void persistPreferences({ audience: option.value });
                          }}
                          className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                            audience === option.value
                              ? "border-primary bg-primary/10 shadow-teal"
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                          }`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <span className="text-3xl">{option.icon}</span>
                          <span className="font-semibold text-lg">{option.value}</span>
                          {audience === option.value && (
                            <TickCircle className="w-6 h-6 text-primary ms-auto" size={24} />
                          )}
                        </button>
                      ))}
                      <div className="mt-4 space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                          {t("audienceCustomLabel")}
                        </label>
                        <input
                          type="text"
                          value={audience}
                          onChange={(event) => {
                            setAudience(event.target.value);
                            setAudienceSkipped(false);
                          }}
                          onBlur={() => {
                            const trimmed = audience.trim();
                            if (trimmed) {
                              void persistPreferences({ audience: trimmed });
                            }
                          }}
                          placeholder={t("audienceCustomPlaceholder")}
                          className="w-full rounded-xl border border-border bg-background/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {audienceSkipped ? t("questionSkipped") : t("audienceCustomHint")}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAudience("");
                              setAudienceSkipped(true);
                              setStep((current) => Math.min(totalSteps, current + 1));
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            {t("skipQuestion")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Tone */}
                  {step === 4 && (
                    <div className="grid gap-4 animate-fade-in">
                      {toneOptions.map((option, index) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setTone(option.value);
                            setToneSkipped(false);
                            void persistPreferences({ tone: option.value });
                          }}
                          className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                            tone === option.value
                              ? "border-primary bg-primary/10 shadow-teal"
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                          }`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <span className="text-3xl">{option.icon}</span>
                          <span className="font-semibold text-lg">{option.value}</span>
                          {tone === option.value && (
                            <TickCircle className="w-6 h-6 text-primary ms-auto" size={24} />
                          )}
                        </button>
                      ))}
                      <div className="mt-4 space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                          {t("toneCustomLabel")}
                        </label>
                        <input
                          type="text"
                          value={tone}
                          onChange={(event) => {
                            setTone(event.target.value);
                            setToneSkipped(false);
                          }}
                          onBlur={() => {
                            const trimmed = tone.trim();
                            if (trimmed) {
                              void persistPreferences({ tone: trimmed });
                            }
                          }}
                          placeholder={t("toneCustomPlaceholder")}
                          className="w-full rounded-xl border border-border bg-background/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{toneSkipped ? t("questionSkipped") : t("toneCustomHint")}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setTone("");
                              setToneSkipped(true);
                              setStep((current) => Math.min(totalSteps, current + 1));
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            {t("skipQuestion")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 5: Hook Style */}
                  {step === 5 && (
                    <div className="grid gap-4 animate-fade-in">
                      {hookStyleOptions.map((option, index) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setHookStyle(option.value);
                            setHookStyleSkipped(false);
                            void persistPreferences({
                              hookStyle: option.value,
                            });
                          }}
                          className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                            hookStyle === option.value
                              ? "border-primary bg-primary/10 shadow-teal"
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                          }`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <span className="text-3xl">{option.icon}</span>
                          <span className="font-semibold text-lg">{option.value}</span>
                          {hookStyle === option.value && (
                            <TickCircle className="w-6 h-6 text-primary ms-auto" size={24} />
                          )}
                        </button>
                      ))}
                      <div className="mt-4 space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                          {t("hookStyleCustomLabel")}
                        </label>
                        <input
                          type="text"
                          value={hookStyle}
                          onChange={(event) => {
                            setHookStyle(event.target.value);
                            setHookStyleSkipped(false);
                          }}
                          onBlur={() => {
                            const trimmed = hookStyle.trim();
                            if (trimmed) {
                              void persistPreferences({ hookStyle: trimmed });
                            }
                          }}
                          placeholder={t("hookStyleCustomPlaceholder")}
                          className="w-full rounded-xl border border-border bg-background/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {hookStyleSkipped ? t("questionSkipped") : t("hookStyleCustomHint")}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setHookStyle("");
                              setHookStyleSkipped(true);
                              if (step >= totalSteps) {
                                void onStartProcessing();
                              } else {
                                setStep((current) => Math.min(totalSteps, current + 1));
                              }
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            {t("skipQuestion")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between pt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      onClick={() => setStep((current) => Math.max(1, current - 1))}
                      disabled={step === 1}
                      className={`text-base px-6 ${step === 1 ? "invisible" : "hover:bg-muted"}`}
                    >
                      {t("previous")}
                    </Button>
                    {step < totalSteps ? (
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => setStep((current) => Math.min(totalSteps, current + 1))}
                        className="text-base px-8 text-white bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                      >
                        {t("next")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="lg"
                        onClick={onStartProcessing}
                        disabled={isProcessing}
                        className="text-base text-white px-8 bg-gradient-coral hover:shadow-warm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                      >
                        {isProcessing ? t("converting") : t("startConversion")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading Screen */}
        {screen === "loading" && (
          <div className="space-y-8 animate-fade-in">
            <Card className="shadow-card border-0 bg-gradient-card">
              <CardContent className="p-10 text-center space-y-8">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-teal flex items-center justify-center animate-pulse-glow">
                  <Play
                    className="w-10 h-10 text-white animate-bounce-soft"
                    size={40}
                    variant="Bold"
                  />
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-foreground">
                    {tLoading("preparingClips")}
                  </h2>
                  <p className="text-lg text-muted-foreground">
                    {status || tLoading("pleaseWait")}
                  </p>
                  {currentRecommendations.length > 0 && (
                    <div className="mt-6 p-5 bg-primary/5 rounded-xl border border-primary/20 shadow-sm">
                      <div className="flex items-start gap-3">
                        <LampOn className="w-6 h-6 text-primary" size={24} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-primary mb-2">
                            {skipQuestions
                              ? tLoading("tipsForAllPlatforms") || "Tips for all platforms"
                              : tLoading("tipsFor", {
                                  platform: t(`platforms.${platform}`),
                                })}
                          </p>
                          <p
                            key={currentRecommendationIndex}
                            className="text-sm text-muted-foreground leading-relaxed animate-fade-in"
                          >
                            {currentRecommendations[currentRecommendationIndex]}
                          </p>
                          {currentRecommendations.length > 1 && (
                            <div className="flex gap-1.5 mt-3 justify-center">
                              {currentRecommendations.map((rec: string, index: number) => (
                                <div
                                  key={`rec-${platform}-${index}-${rec.substring(0, 10)}`}
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    index === currentRecommendationIndex
                                      ? "w-6 bg-primary"
                                      : "w-1.5 bg-primary/30"
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="max-w-md mx-auto space-y-3">
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full progress-gradient rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">{progress}%</p>
                </div>
              </CardContent>
            </Card>

            {/* Skeleton Cards */}
            <div className="grid gap-6 grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card
                  key={i}
                  className="overflow-hidden shadow-card border-0 bg-gradient-card animate-fade-in"
                  style={{ animationDelay: `${i * 0.2}s` }}
                >
                  <div className="aspect-[9/16] skeleton" />
                  <CardContent className="p-5 space-y-4">
                    <div className="skeleton h-4 w-16 rounded-full" />
                    <div className="space-y-2">
                      <div className="skeleton h-5 w-full rounded" />
                      <div className="skeleton h-5 w-3/4 rounded" />
                    </div>
                    <div className="skeleton h-4 w-20 rounded" />
                    <div className="skeleton h-12 w-full rounded-xl" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Results Screen */}
        {screen === "results" && (
          <section className="space-y-10 animate-fade-in">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-teal flex items-center justify-center animate-bounce-soft">
                <TickCircle className="w-8 h-8 text-white" size={32} />
              </div>
              <h2 className="text-3xl font-bold text-foreground">{tResults("clipsReady")}</h2>
              <p className="text-lg text-muted-foreground">{tResults("selectClip")}</p>
            </div>
            {clips.length === 0 ? (
              <p className="text-base text-muted-foreground text-center">
                {tResults("noClipsYet")}
              </p>
            ) : (
              <div className="grid gap-8 grid-cols-2 lg:grid-cols-3">
                {clips.map((clip, index) => {
                  const previewParams: Record<string, string> = {
                    ...(clip.url && !clip.url.startsWith("blob:") ? { url: clip.url } : {}),
                    startTime: String(clip.start),
                    endTime: String(clip.end),
                    title: clip.title,
                    duration: String(clip.duration),
                    thumbnail: clip.thumbnail ?? "",
                    category: clip.category,
                    tags: clip.tags.join(","),
                    transcript: clip.transcript,
                  };
                  const previewUrl = `/${locale}/preview?${new URLSearchParams(
                    previewParams
                  ).toString()}`;
                  const wrapperClass = `aspect-[9/16] relative overflow-hidden cursor-pointer bg-gradient-to-br from-primary/10 to-primary/5`;

                  const handlePreviewClick = (e: React.MouseEvent) => {
                    e.preventDefault();
                    posthog.capture("clip_previewed", {
                      clip_index: index,
                      clip_title: clip.title,
                      clip_duration: Math.round(clip.duration),
                      category: clip.category,
                    });
                    // Store segments in BOTH sessionStorage (current tab) and localStorage (cross-tab)
                    if (segments.length > 0) {
                      try {
                        const segmentsJson = JSON.stringify(segments);
                        globalThis.sessionStorage.setItem("reelify_segments", segmentsJson);
                        globalThis.localStorage.setItem("reelify_segments", segmentsJson);
                        console.log(
                          "[Results] Saved segments to storage before navigation:",
                          segments.length
                        );
                      } catch (err) {
                        console.warn("[Results] Failed to save segments:", err);
                      }
                    }
                    // Open in new tab
                    window.open(previewUrl, "_blank", "noopener,noreferrer");
                  };

                  return (
                    <Card
                      key={`${clip.start}-${clip.end}-${index}`}
                      className="overflow-hidden shadow-card border-0 bg-gradient-card group hover:shadow-card-hover hover:scale-[1.03] transition-all duration-500 animate-fade-in"
                      style={{ animationDelay: `${index * 0.15}s` }}
                    >
                      <a
                        href={previewUrl}
                        onClick={handlePreviewClick}
                        className={`${wrapperClass} block`}
                        aria-label={`${tResults("previewAndEdit")}: ${clip.title}`}
                      >
                        {clip.thumbnail ? (
                          <img
                            src={clip.thumbnail}
                            alt={clip.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const loadThumbnail = async () => {
                                const clipKey = `thumb-${clip.start}-${clip.end}`;
                                const thumbnailUrl = await getThumbnailBlobUrl(clipKey);
                                if (thumbnailUrl) {
                                  (e.target as HTMLImageElement).src = thumbnailUrl;
                                }
                              };
                              void loadThumbnail();
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 relative overflow-hidden">
                            <div className="w-full h-full bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 animate-pulse"></div>
                            {/* Always show loading indicator when thumbnail is empty */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs text-muted-foreground">
                                  {thumbnailGenerating.has(index) ? "Generating..." : "Loading..."}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100 shadow-xl">
                            <Play className="w-7 h-7 text-primary" size={28} variant="Bold" />
                          </div>
                        </div>
                        <div className="absolute bottom-3 start-3 px-2.5 py-1 rounded-lg bg-black/70 text-white text-xs font-medium backdrop-blur-sm">
                          {Math.round(clip.duration)} {tCommon("seconds")}
                        </div>
                        <div className="absolute top-3 end-3 px-2.5 py-1 rounded-lg bg-primary/90 text-white text-xs font-bold backdrop-blur-sm">
                          {tResults("rank", { rank: index + 1 })}
                        </div>
                      </a>
                      <CardContent className="p-5 space-y-4">
                        <div className="space-y-2">
                          <span className="inline-block px-3 py-1 text-xs font-semibold bg-primary/10 text-primary rounded-full">
                            {clip.category}
                          </span>
                          <h3 className="font-bold text-foreground text-lg line-clamp-2 leading-snug">
                            {clip.title}
                          </h3>
                        </div>
                        <Button
                          asChild
                          className="w-full h-12 text-white text-base font-semibold bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl"
                        >
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                            <Eye className="w-5 h-5 me-2" size={20} />
                            {tResults("previewAndEdit")}
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-border/30 animate-fade-in">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link href={`/${locale}/privacy`} className="hover:text-primary transition-colors">
              {tCommon("privacyPolicy")}
            </Link>
            <span>•</span>
            <Link href={`/${locale}/terms`} className="hover:text-primary transition-colors">
              {tCommon("termsAndConditions")}
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
