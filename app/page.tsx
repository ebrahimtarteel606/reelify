"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getFfmpeg,
  writeInputFile,
  extractAudioWav,
  cleanupInputFile,
  extractThumbnail,
} from "@/lib/ffmpegWasm";
import { storeVideoFile, storeThumbnails, getThumbnailBlobUrl, storeAudioFile, getAudioFile, clearAllStorage } from "@/lib/videoStorage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import Image from "next/image";

type ClipItem = {
  title: string;
  duration: number;
  url: string; // Original video URL (full video)
  start: number;
  end: number;
  thumbnail: string; // Optional - not generated until needed
  category: string;
  tags: string[];
  transcript: string;
};

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export default function HomePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [screen, setScreen] = useState<
    "upload" | "form" | "loading" | "results"
  >("upload");
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [platform, setPlatform] = useState("instagram");
  const [preferredDuration, setPreferredDuration] = useState(45);
  const [audience, setAudience] = useState("شباب 18-30");
  const [audienceSkipped, setAudienceSkipped] = useState(false);
  const [tone, setTone] = useState("ملهم");
  const [toneSkipped, setToneSkipped] = useState(false);
  const [hookStyle, setHookStyle] = useState("سؤال مباشر");
  const [hookStyleSkipped, setHookStyleSkipped] = useState(false);
  const [skipQuestions, setSkipQuestions] = useState(false);
  
  // Platform-specific recommendations (static)
  const platformRecommendations = [
    {
      platform: "instagram",
      sentences: [
        "اجعل النص قصيرًا وجذّابًا مع إيموجي مناسبة 📸✨",
        "القصص اليومية والتفاعل السريع يرفعان الوصول",
        "استخدم وسمين إلى ثلاثة كحد أقصى لنتائج أفضل"
      ]
    },
    {
      platform: "facebook",
      sentences: [
        "المحتوى القصصي يحقق تفاعلًا أعلى على فيسبوك",
        "المنشورات التي تطرح سؤالًا تشجع على التعليقات",
        "الطول المتوسط للنص هو الأفضل هنا"
      ]
    },
    {
      platform: "tiktok",
      sentences: [
        "ابدأ بجملة قوية تجذب الانتباه خلال أول 3 ثوانٍ",
        "النبرة العفوية أفضل من الرسمية",
        "اتبع الترند لكن بأسلوبك الخاص"
      ]
    },
    {
      platform: "youtube",
      sentences: [
        "العنوان والوصف لا يقلان أهمية عن الفيديو نفسه",
        "شجّع المشاهد على التفاعل في نهاية المحتوى",
        "المحتوى التعليمي أو الترفيهي الطويل ينجح أكثر"
      ]
    },
    {
      platform: "snapchat",
      sentences: [
        "المحتوى السريع والجذاب يحقق أفضل النتائج",
        "استخدم المؤثرات البصرية لجذب الانتباه",
        "المحتوى اليومي والعفوي ينجح أكثر"
      ]
    },
    {
      platform: "linkedin",
      sentences: [
        "احرص على أسلوب مهني وواضح",
        "شارك تجربة أو قيمة عملية للقارئ",
        "المنشورات التعليمية تحقق أداءً قويًا"
      ]
    }
  ];
  
  const [currentRecommendationIndex, setCurrentRecommendationIndex] = useState<number>(0);
  
  // Get recommendations for current platform (computed)
  const currentRecommendations = useMemo(() => {
    return platformRecommendations.find(
      (rec) => rec.platform === platform
    )?.sentences || platformRecommendations[0].sentences;
  }, [platform]);
  
  const recommendedDurationMap: Record<string, number> = {
    instagram: 45,
    tiktok: 60,
    youtube: 60,
    snapchat: 30,
    facebook: 45,
    linkedin: 45,
  };
  const platformLabels: Record<string, string> = {
    instagram: "إنستغرام ريلز",
    tiktok: "تيك توك",
    youtube: "يوتيوب شورتس",
    snapchat: "سناب شات سبوتلايت",
    facebook: "فيسبوك ريلز",
    linkedin: "لينكدإن ريلز",
  };

  const [backgroundResult, setBackgroundResult] = useState<{
    ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>;
    inputName: string;
    audioUrl: string;
  } | null>(null);
  const [backgroundError, setBackgroundError] = useState<string>("");
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);

  // Refs to access latest background state in async functions
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

  // Rotate through recommendations every 4 seconds when on loading screen
  useEffect(() => {
    if (screen === "loading") {
      const currentRecs = platformRecommendations.find(
        (rec) => rec.platform === platform
      )?.sentences || platformRecommendations[0].sentences;
      
      if (currentRecs.length > 1) {
        const interval = setInterval(() => {
          setCurrentRecommendationIndex((prev) => (prev + 1) % currentRecs.length);
        }, 4000); // Change recommendation every 4 seconds
        
        return () => clearInterval(interval);
      }
    } else {
      // Reset index when leaving loading screen
      setCurrentRecommendationIndex(0);
    }
  }, [screen, platform]);

  // Clear IndexedDB on page refresh or close
  useEffect(() => {
    if (typeof globalThis.window === "undefined") return;

    // Check if this is a page refresh (not a navigation)
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const isRefresh = navEntry?.type === 'reload';

    // Clear IndexedDB on refresh ONLY if there's no active session
    // (i.e., no clips stored in sessionStorage - meaning user is starting fresh)
    if (isRefresh) {
      const hasActiveSession = globalThis.sessionStorage.getItem("reelify_clips") !== null;
      if (hasActiveSession) {
        console.log('[IndexedDB] Page refreshed but active session exists, preserving storage...');
      } else {
        console.log('[IndexedDB] Page refreshed with no active session, clearing storage...');
        void clearAllStorage();
      }
    }

    // Clear IndexedDB when page/tab is closing
    const handleBeforeUnload = () => {
      console.log('[IndexedDB] Page closing, clearing storage...');
      void clearAllStorage();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Restore state from sessionStorage only when navigating back (not on initial load)
  useEffect(() => {
    if (typeof globalThis.window === "undefined") return;

    // Check if this is a navigation back event (user came from editor)
    const navigationState = globalThis.sessionStorage.getItem(
      "reelify_navigation_back",
    );

    // Only restore if user explicitly navigated back AND we're on upload screen
    if (navigationState === "true" && screen === "upload") {
      const storedClips = globalThis.sessionStorage.getItem("reelify_clips");
      const storedScreen = globalThis.sessionStorage.getItem("reelify_screen");
      const storedVideoUrl =
        globalThis.sessionStorage.getItem("reelify_video_url");

      // If we have stored clips and video URL, restore the results screen
      if (storedClips && storedVideoUrl && storedScreen === "results") {
        try {
          const parsedClips = JSON.parse(storedClips);
          if (Array.isArray(parsedClips) && parsedClips.length > 0) {
            const storedSegments = globalThis.sessionStorage.getItem(
              "reelify_segments",
            );
            if (storedSegments) {
              try {
                const parsedSegments = JSON.parse(storedSegments) as TranscriptSegment[];
                if (Array.isArray(parsedSegments)) setSegments(parsedSegments);
              } catch {
                // Ignore invalid segments
              }
            }
            // Restore thumbnails from IndexedDB
            // Always restore from IndexedDB when navigating back since blob URLs are revoked
            const restoreThumbnails = async () => {
              const clipsWithThumbnails = await Promise.all(
                parsedClips.map(async (clip: ClipItem) => {
                  // Always try to restore thumbnail from IndexedDB when navigating back
                  const clipKey = `thumb-${clip.start}-${clip.end}`;
                  const thumbnailUrl = await getThumbnailBlobUrl(clipKey);
                  if (thumbnailUrl) {
                    return { ...clip, thumbnail: thumbnailUrl };
                  }
                  // If no thumbnail found in IndexedDB, return clip without thumbnail
                  return { ...clip, thumbnail: "" };
                })
              );
              setClips(clipsWithThumbnails);
            };
            
            setVideoBlobUrl(storedVideoUrl); // Restore blob URL
            setScreen("results");
            void restoreThumbnails(); // Restore thumbnails asynchronously
            // Clear the navigation flag
            globalThis.sessionStorage.removeItem("reelify_navigation_back");
          }
        } catch (e) {
          console.error("Failed to restore clips from sessionStorage:", e);
          globalThis.sessionStorage.removeItem("reelify_navigation_back");
        }
      } else {
        // Clear invalid state
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

  // Generate thumbnails in parallel for faster processing
  const generateThumbnailsInParallel = async (
    ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
    inputName: string,
    clips: ClipItem[],
    videoFile: File | null,
  ): Promise<string[]> => {
    const thumbnailData: { blob: Blob; clipKey: string }[] = [];
    
    // Verify input file exists in FFmpeg's virtual filesystem, re-write if needed
    // This is necessary because after the long API call, the file might have been lost
    try {
      await ffmpeg.readFile(inputName);
      console.log('[Thumbnails] Input file verified in FFmpeg filesystem');
    } catch (error) {
      console.warn('[Thumbnails] Input file not found in FFmpeg filesystem, re-writing...', error);
      if (videoFile) {
        try {
          await writeInputFile(ffmpeg, inputName, videoFile);
          console.log('[Thumbnails] Input file re-written successfully');
        } catch (rewriteError) {
          console.error('[Thumbnails] Failed to re-write input file:', rewriteError);
          throw new Error('Failed to prepare video file for thumbnail generation');
        }
      } else {
        throw new Error('Video file not available for thumbnail generation');
      }
    }
    
    const thumbnailPromises = clips.map(async (clip, index) => {
      try {
        const thumbName = `thumb-${crypto.randomUUID()}.jpg`;
        const thumbBlob = await extractThumbnail(
          ffmpeg,
          inputName,
          thumbName,
          clip.start,
        );

        // Create clip key for storage (using start and end time as unique identifier)
        const clipKey = `thumb-${clip.start}-${clip.end}`;
        
        // Create local blob URL instead of uploading to Vercel Blob
        const blobUrl = URL.createObjectURL(thumbBlob);
        
        // Store thumbnail blob for persistence (will be stored in batch after all are generated)
        thumbnailData.push({ blob: thumbBlob, clipKey });
        
        return blobUrl;
      } catch (error) {
        console.error(`Failed to generate thumbnail for clip ${index}:`, error);
        return ""; // Return empty string on error
      }
    });

    const blobUrls = await Promise.all(thumbnailPromises);
    
    // Store thumbnails in IndexedDB for persistence
    if (thumbnailData.length > 0) {
      try {
        console.log('[Thumbnails] Storing', thumbnailData.length, 'thumbnails in IndexedDB');
        await storeThumbnails(thumbnailData);
        console.log('[Thumbnails] Successfully stored thumbnails in IndexedDB');
      } catch (error) {
        console.error('[Thumbnails] Failed to store thumbnails in IndexedDB:', error);
        // Continue even if storage fails
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
    setStatus("جاري تحضير الفيديو...");

    try {
      // Load FFmpeg and write input file
      setProgress(5);
      setStatus("جاري تحميل أدوات المعالجة...");
      const ffmpeg = await getFfmpeg();
      
      setProgress(10);
      setStatus("جاري قراءة ملف الفيديو...");
      const inputName = `input-${Date.now()}.mp4`;
      await writeInputFile(ffmpeg, inputName, videoFile);

      // Extract audio (now MP3 compressed for smaller file size)
      setProgress(15);
      setStatus("جاري استخراج الصوت من الفيديو...");
      const audioName = `audio-${Date.now()}.mp3`;
      const audioBlob = await extractAudioWav(ffmpeg, inputName, audioName);
      
      setProgress(20);

      // Store audio in IndexedDB (client-side only, no server upload)
      const audioFile = new File([audioBlob], "audio.mp3", {
        type: "audio/mpeg",
      });
      await storeAudioFile(audioFile);
      
      // Create blob URL for local access
      const audioBlobUrl = URL.createObjectURL(audioFile);
      
      // Store results needed for later processing
      setBackgroundResult({
        ffmpeg,
        inputName,
        audioUrl: audioBlobUrl, // Blob URL for local access
      });
    } catch (err) {
      console.error("Background processing error:", err);
      const message =
        err instanceof Error ? err.message : "حدث خطأ أثناء المعالجة.";
      setBackgroundError(message);
    } finally {
      setBackgroundProcessing(false);
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
      setError("يرجى اختيار فيديو قبل المتابعة.");
      return;
    }

    // Clear old IndexedDB data when starting a new upload
    await clearAllStorage();

    // Store video file in IndexedDB for persistence across page navigations
    await storeVideoFile(file);

    // Create blob URL from local file (no upload needed)
    const blobUrl = URL.createObjectURL(file);
    setVideoBlobUrl(blobUrl);

    // Clear old sessionStorage when starting new upload
    if (typeof globalThis.window !== "undefined") {
      globalThis.sessionStorage.removeItem("reelify_clips");
      globalThis.sessionStorage.removeItem("reelify_segments");
      globalThis.sessionStorage.removeItem("reelify_screen");
      globalThis.sessionStorage.removeItem("reelify_video_url");
      globalThis.sessionStorage.removeItem("reelify_video_name");
      globalThis.sessionStorage.removeItem("reelify_navigation_back");
      // Store blob URL in sessionStorage as backup
      globalThis.sessionStorage.setItem("reelify_video_blob_url", blobUrl);
    }

    setStep(1);
    setScreen("form");

    // Start background processing (fire and forget)
    void startBackgroundProcessing(file);
  };

  const onStartProcessing = async () => {
    setError("");
    setScreen("loading");
    setIsProcessing(true);

    try {
      // Wait for background processing if still running
      if (backgroundProcessingRef.current) {
        setStatus("ننتظر اكتمال التحليل...");
        // Poll until background processing is done (max 120 seconds)
        let attempts = 0;
        while (backgroundProcessingRef.current && attempts < 1200) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }
      }

      // Check for background error
      if (backgroundErrorRef.current) {
        throw new Error(backgroundErrorRef.current);
      }

      // Check if background result is ready
      if (!backgroundResultRef.current) {
        throw new Error("لم يتم تجهيز الفيديو بعد. يرجى المحاولة مرة أخرى.");
      }

      const { ffmpeg, inputName } = backgroundResultRef.current;

      // Use local blob URL instead of uploading to Vercel (much faster!)
      if (!videoBlobUrl) {
        throw new Error("رابط الفيديو غير موجود.");
      }
      const originalVideoUrl = videoBlobUrl;

      // Store video blob URL in sessionStorage for persistence
      if (typeof globalThis.window !== "undefined") {
        globalThis.sessionStorage.setItem(
          "reelify_video_url",
          originalVideoUrl,
        );
        globalThis.sessionStorage.setItem(
          "reelify_video_name",
          file?.name || "video.mp4",
        );
      }

      // Build session preferences based on answered vs skipped questions
      const sessionPreferences: Record<string, unknown> = {};

      // Always include platform and preferred duration as they are required
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

      // Call /api/process for transcription and Gemini analysis with preferences
      // Send audio file directly as FormData instead of URL
      setProgress(20);
      setStatus("نحلل المحتوى ونختار أفضل المقاطع...");
      
      // Get audio file from IndexedDB
      const audioFile = await getAudioFile();
      if (!audioFile) {
        throw new Error("لم يتم العثور على ملف الصوت. يرجى المحاولة مرة أخرى.");
      }
      
      setProgress(20);
      
      // Send audio as FormData
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("preferences", JSON.stringify(sessionPreferences));
      
      // Simulate progress during API call - continue incrementing smoothly throughout
      // The API call can take 60-80 seconds, so we need to increment slowly
      let progressValue = 20;
      const progressInterval = setInterval(() => {
        // Increment slowly: 0.3% every 300ms = 1% per second
        // This allows up to ~80 seconds of API processing time (20% -> 100%)
        progressValue = Math.min(progressValue + 0.3, 92); // Cap at 92% to leave room for final steps
        setProgress(Math.floor(progressValue));
      }, 300); // Update every 300ms for smoother progress
      
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });
      
      clearInterval(progressInterval);
      // When API responds, we're likely at 85-92% depending on how long it took
      // Set to 85% minimum, or keep current if higher
      setProgress((prev) => Math.max(prev, 85));
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "حدث خطأ أثناء التحليل.");
      }

      const candidates = Array.isArray(payload?.clips) ? payload.clips : [];
      const segments: TranscriptSegment[] = Array.isArray(payload?.segments)
        ? payload.segments
        : [];

      if (candidates.length === 0) {
        throw new Error("لم يتم العثور على مقاطع مناسبة.");
      }

      setProgress(88);
      setStatus("جاري تحضير المقاطع...");
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay

      // Helper to extract transcript for a specific time range
      const getClipTranscript = (start: number, end: number): string => {
        return segments
          .filter((seg) => seg.end > start && seg.start < end)
          .map((seg) => seg.text)
          .join(" ");
      };
      const uploadedClips: ClipItem[] = [];

      // Create clip candidates with metadata first (show results immediately)
      for (const candidate of candidates) {
        const duration = Math.max(0, candidate.end - candidate.start);
        const clipTranscript = getClipTranscript(
          candidate.start,
          candidate.end,
        );

        uploadedClips.push({
          title: candidate.title,
          start: candidate.start,
          end: candidate.end,
          duration,
          url: originalVideoUrl, // Use original video URL instead of clip URL
          thumbnail: "", // Will be generated in parallel after results shown
          category: candidate.category || "عام",
          tags: Array.isArray(candidate.tags) ? candidate.tags : [],
          transcript: clipTranscript,
        });
      }

      // Show results immediately (no waiting for thumbnails)
      setProgress(92);
      await new Promise(resolve => setTimeout(resolve, 150)); // Small delay to show progress
      setClips(uploadedClips);
      setSegments(segments);
      setProgress(96);
      await new Promise(resolve => setTimeout(resolve, 150)); // Small delay to show progress
      setStatus("");
      setProgress(100);
      await new Promise(resolve => setTimeout(resolve, 200)); // Final delay before showing results
      setScreen("results");

      // Generate thumbnails in parallel in the background (non-blocking)
      // Pass the original video file so we can re-write it if needed after the long API call
      void generateThumbnailsInParallel(ffmpeg, inputName, uploadedClips, file)
        .then((thumbnails) => {
          console.log('[Thumbnails] Generated thumbnails:', thumbnails.length, 'URLs');
          // Update clips with thumbnails as they're generated
          setClips((prevClips) => {
            const updatedClips = prevClips.map((clip, index) => {
              const thumbnailUrl = thumbnails[index] || clip.thumbnail;
              if (thumbnailUrl) {
                console.log(`[Thumbnails] Setting thumbnail for clip ${index} (${clip.start}-${clip.end}):`, thumbnailUrl.substring(0, 50) + '...');
              }
              return {
                ...clip,
                thumbnail: thumbnailUrl,
              };
            });
            // Also update sessionStorage with new thumbnails
            if (typeof globalThis.window !== "undefined") {
              globalThis.sessionStorage.setItem(
                "reelify_clips",
                JSON.stringify(updatedClips),
              );
            }
            return updatedClips;
          });
        })
        .catch((error) => {
          console.error('[Thumbnails] Error generating thumbnails:', error);
        })
        .finally(() => {
          // Clean up input file after thumbnails are generated
          void cleanupInputFile(ffmpeg, inputName);
        });

      // Store clips and full-video segments in sessionStorage for persistence
      if (typeof globalThis.window !== "undefined") {
        globalThis.sessionStorage.setItem(
          "reelify_clips",
          JSON.stringify(uploadedClips),
        );
        globalThis.sessionStorage.setItem(
          "reelify_segments",
          JSON.stringify(segments),
        );
        globalThis.sessionStorage.setItem("reelify_screen", "results");
      }
    } catch (err) {
      console.error("Processing error:", err);
      let message = "تعذر إكمال المعالجة.";
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "string") {
        message = err;
      } else if (err && typeof err === "object" && "message" in err) {
        message = String((err as { message: unknown }).message);
      }
      setError(message);
      setStatus("");
      setProgress(0);
      setScreen("form");
    } finally {
      setIsProcessing(false);
    }
  };

  // Removed handleThumbnailLoad - no longer needed since we're using placeholders

  const handleSkipQuestions = async () => {
    setError("");
    setStatus("");
    // Persist a minimal preference set so the model can infer defaults
    await persistPreferences({ platform, preferredDuration });
    void onStartProcessing();
  };

  const totalSteps = 5;

  const questionTitles: Record<number, string> = {
    1: "على أي منصة ستنشر الفيديو؟",
    2: "ما المدة المفضلة للمقطع؟",
    3: "من هو الجمهور المستهدف؟",
    4: "ما النبرة الأنسب للمقطع؟",
    5: "ما أسلوب الافتتاح (الهوك)؟",
  };

  return (
    <main className="min-h-screen bg-gradient-warm" dir="rtl">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 pb-24 pt-10">
        <div className="flex items-center justify-center">
          <Image
            src="/Transparent white1.png"
            alt="Realify"
            width={200}
            height={100}
          />
        </div>
        {/* Brand Bar */}

        {/* Header */}
        <header className="text-center space-y-5 animate-fade-in mt-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight inline-block ">
            اصنع ريلز عربية احترافية
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            ارفع الفيديو وأجب عن أسئلة بسيطة لنصنع لك أفضل المقاطع
          </p>
        </header>

        {/* Upload Screen */}
        {screen === "upload" && (
          <Card className="shadow-card border-0 bg-gradient-card animate-fade-in hover:shadow-card-hover transition-all duration-500">
            <CardContent className="p-10">
              <form
                className="flex flex-col items-center gap-8"
                onSubmit={onUploadSubmit}
              >
                <div className="w-full">
                  <label
                    htmlFor="video"
                    className="group flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-primary/20 rounded-2xl cursor-pointer bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 hover:scale-[1.01]"
                  >
                    <div className="flex flex-col items-center justify-center pt-6 pb-8">
                      <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <svg
                          className="w-8 h-8 text-primary"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                      </div>
                      <p className="mb-2 text-base text-foreground">
                        <span className="font-semibold text-primary">
                          اضغط لرفع الفيديو
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        MP4, MOV, AVI
                      </p>
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
                          return;
                        }
                        const maxSize = 100 * 1024 * 1024;
                        if (selectedFile.size > maxSize) {
                          setFile(null);
                          setError(
                            "حجم الفيديو أكبر من 100 ميجابايت. يرجى اختيار ملف أصغر.",
                          );
                          return;
                        }
                        setError("");
                        setFile(selectedFile);
                      }}
                    />
                  </label>
                  <p className="mt-2 text-xs text-muted-foreground text-center">
                    الحد الأقصى لحجم الفيديو 100MB
                  </p>
                  {file && (
                    <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in-scale">
                      <p className="text-sm text-center text-primary font-medium flex items-center justify-center gap-2">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        تم اختيار: {file.name}
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={!file}
                  size="lg"
                  className="w-full max-w-sm text-white h-14 text-lg font-semibold bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl"
                >
                  متابعة
                </Button>
                {error && (
                  <p className="text-sm text-destructive animate-fade-in">
                    {error}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Form Screen - One Question Per Step */}
        {screen === "form" && (
          <Card className="shadow-card border-0 bg-gradient-card animate-fade-in hover:shadow-card-hover transition-all duration-500">
            <CardContent className="p-10 space-y-10">
              {/* Progress */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    السؤال {step} من {totalSteps}
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
                    نحلل الفيديو في الخلفية...
                  </span>
                </div>
              )}

              {/* Skip Questions Toggle */}
              <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="skip-questions"
                    checked={skipQuestions}
                    onCheckedChange={(checked) =>
                      setSkipQuestions(Boolean(checked))
                    }
                  />
                  <label
                    htmlFor="skip-questions"
                    className="text-sm font-medium text-foreground"
                  >
                    تخطي الأسئلة، دع الذكاء يقرر
                  </label>
                </div>
                {skipQuestions && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSkipQuestions}
                    className="bg-gradient-teal text-white hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    ابدأ بدون أسئلة
                  </Button>
                )}
              </div>

              {backgroundResult && !backgroundProcessing && (
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 animate-fade-in">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-emerald-700">
                    جاهز للتحويل
                  </span>
                </div>
              )}

              {backgroundError && (
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
                  <svg
                    className="w-5 h-5 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-red-600">
                    {backgroundError}
                  </span>
                </div>
              )}

              {!skipQuestions && (
                <>
                  {/* Question Title */}
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-center text-foreground animate-fade-in">
                      {questionTitles[step]}
                    </h2>
                    {/* Question status badge (answered vs skipped) */}
                    <div className="flex justify-center">
                      {step === 3 && (
                        <>
                          {audienceSkipped && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                              تم تخطي هذا السؤال
                            </span>
                          )}
                          {!audienceSkipped && audience.trim() && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              تم اختيار إجابة لهذا السؤال
                            </span>
                          )}
                        </>
                      )}
                      {step === 4 && (
                        <>
                          {toneSkipped && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                              تم تخطي هذا السؤال
                            </span>
                          )}
                          {!toneSkipped && tone.trim() && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              تم اختيار إجابة لهذا السؤال
                            </span>
                          )}
                        </>
                      )}
                      {step === 5 && (
                        <>
                          {hookStyleSkipped && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                              تم تخطي هذا السؤال
                            </span>
                          )}
                          {!hookStyleSkipped && hookStyle.trim() && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              تم اختيار إجابة لهذا السؤال
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive text-center animate-fade-in">
                      {error}
                    </p>
                  )}

                  {/* Step 1: Platform */}
                  {step === 1 && (
                    <div className="grid gap-4 animate-fade-in">
                      {[
                        {
                          value: "instagram",
                          label: "إنستغرام ريلز",
                          icon: (
                            <svg
                              className="w-8 h-8"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <defs>
                                <linearGradient
                                  id="instagram-gradient"
                                  x1="0%"
                                  y1="100%"
                                  x2="100%"
                                  y2="0%"
                                >
                                  <stop offset="0%" stopColor="#FFDC80" />
                                  <stop offset="25%" stopColor="#FCAF45" />
                                  <stop offset="50%" stopColor="#F77737" />
                                  <stop offset="75%" stopColor="#C13584" />
                                  <stop offset="100%" stopColor="#833AB4" />
                                </linearGradient>
                              </defs>
                              <path
                                fill="url(#instagram-gradient)"
                                d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                              />
                            </svg>
                          ),
                          color: "text-pink-500",
                        },
                        {
                          value: "tiktok",
                          label: "تيك توك",
                          icon: (
                            <svg
                              className="w-8 h-8"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                            </svg>
                          ),
                          color: "text-black",
                        },
                        {
                          value: "youtube",
                          label: "يوتيوب شورتس",
                          icon: (
                            <svg
                              className="w-8 h-8 text-red-600"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                          ),
                          color: "text-red-600",
                        },
                        {
                          value: "snapchat",
                          label: "سناب شات سبوتلايت",
                          icon: (
                            <svg
                              className="w-8 h-8 text-yellow-400"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z" />
                            </svg>
                          ),
                          color: "text-yellow-400",
                        },
                        {
                          value: "facebook",
                          label: "فيسبوك ريلز",
                          icon: (
                            <svg
                              className="w-8 h-8 text-blue-600"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                          ),
                          color: "text-blue-600",
                        },
                        {
                          value: "linkedin",
                          label: "لينكدإن ريلز",
                          icon: (
                            <svg
                              className="w-8 h-8 text-[#0A66C2]"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.35V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.369-1.85 3.602 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM6.828 20.452H3.84V9h2.988v11.452zM22.225 0H1.771C.792 0 0 .771 0 1.72v20.512C0 23.23.792 24 1.771 24h20.451C23.2 24 24 23.23 24 22.232V1.72C24 .771 23.2 0 22.222 0h.003z" />
                            </svg>
                          ),
                          color: "text-[#0A66C2]",
                        },
                      ].map((option, index) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setPlatform(option.value);
                            const recommendedDuration =
                              recommendedDurationMap[option.value] ??
                              preferredDuration;
                            setPreferredDuration(recommendedDuration);
                            void persistPreferences({
                              platform: option.value,
                              preferredDuration: recommendedDuration,
                            });
                          }}
                          className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${
                            platform === option.value
                              ? "border-primary bg-primary/10 shadow-teal"
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                          }`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <div className="w-10 h-10 flex items-center justify-center">
                            {option.icon}
                          </div>
                          <span className="font-semibold text-lg">
                            {option.label}
                          </span>
                          {platform === option.value && (
                            <svg
                              className="w-6 h-6 text-primary mr-auto"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Step 2: Duration */}
                  {step === 2 && (
                    <div className="space-y-4 animate-fade-in">
                      <p className="text-sm text-muted-foreground text-center">
                        نوصي بمدة{" "}
                        {recommendedDurationMap[platform] ?? preferredDuration}{" "}
                        ثانية لمنصة {platformLabels[platform] ?? "المنصة"}.
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        {[30, 45, 60, 75, 90].map((duration, index) => (
                          <button
                            key={duration}
                            type="button"
                            onClick={() => {
                              setPreferredDuration(duration);
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
                              ثانية
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 3: Audience */}
                  {step === 3 && (
                    <div className="grid gap-4 animate-fade-in">
                      {[
                        { value: "شباب 18-30", icon: "👥" },
                        { value: "رواد أعمال", icon: "💼" },
                        { value: "مهتمون بالتطوير الذاتي", icon: "🚀" },
                        { value: "طلاب جامعات", icon: "🎓" },
                        { value: "مهنيون في التقنية", icon: "💻" },
                      ].map((option, index) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setAudience(option.value);
                            setAudienceSkipped(false);
                            void persistPreferences({ audience: option.value });
                          }}
                          className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${
                            audience === option.value
                              ? "border-primary bg-primary/10 shadow-teal"
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                          }`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <span className="text-3xl">{option.icon}</span>
                          <span className="font-semibold text-lg">
                            {option.value}
                          </span>
                          {audience === option.value && (
                            <svg
                              className="w-6 h-6 text-primary mr-auto"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                      <div className="mt-4 space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                          أو اكتب جمهورك المستهدف
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
                          placeholder="مثال: أصحاب المشاريع الصغيرة، صناع المحتوى..."
                          className="w-full rounded-xl border border-border bg-background/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {audienceSkipped
                              ? "تم تخطي هذا السؤال في هذه الجلسة."
                              : "يمكنك اختيار خيار جاهز أو كتابة جمهورك الخاص."}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAudience("");
                              setAudienceSkipped(true);
                              setStep((current) =>
                                Math.min(totalSteps, current + 1),
                              );
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            تخطي هذا السؤال
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Tone */}
                  {step === 4 && (
                    <div className="grid gap-4 animate-fade-in">
                      {[
                        { value: "ملهم", icon: "✨" },
                        { value: "تعليمي", icon: "📚" },
                        { value: "حماسي", icon: "🔥" },
                        { value: "هادئ", icon: "🌿" },
                        { value: "عملي", label: "عملي ومباشر", icon: "🎯" },
                      ].map((option, index) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setTone(option.value);
                            setToneSkipped(false);
                            void persistPreferences({ tone: option.value });
                          }}
                          className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${
                            tone === option.value
                              ? "border-primary bg-primary/10 shadow-teal"
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                          }`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <span className="text-3xl">{option.icon}</span>
                          <span className="font-semibold text-lg">
                            {option.label || option.value}
                          </span>
                          {tone === option.value && (
                            <svg
                              className="w-6 h-6 text-primary mr-auto"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                      <div className="mt-4 space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                          أو اكتب النبرة التي تريدها
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
                          placeholder="مثال: ملهم وعفوي، رسمي، قصصي..."
                          className="w-full rounded-xl border border-border bg-background/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {toneSkipped
                              ? "تم تخطي هذا السؤال في هذه الجلسة."
                              : "يمكنك اختيار خيار جاهز أو كتابة النبرة التي تناسبك."}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setTone("");
                              setToneSkipped(true);
                              setStep((current) =>
                                Math.min(totalSteps, current + 1),
                              );
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            تخطي هذا السؤال
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 5: Hook Style */}
                  {step === 5 && (
                    <div className="grid gap-4 animate-fade-in">
                      {[
                        { value: "سؤال مباشر", icon: "❓" },
                        {
                          value: "رقم قوي",
                          label: "رقم قوي أو إحصائية",
                          icon: "📊",
                        },
                        {
                          value: "وعد سريع",
                          label: "وعد بنتيجة سريعة",
                          icon: "⚡",
                        },
                        { value: "قصة قصيرة", icon: "📖" },
                        { value: "تنبيه أو تحذير", icon: "⚠️" },
                      ].map((option, index) => (
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
                          className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${
                            hookStyle === option.value
                              ? "border-primary bg-primary/10 shadow-teal"
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                          }`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <span className="text-3xl">{option.icon}</span>
                          <span className="font-semibold text-lg">
                            {option.label || option.value}
                          </span>
                          {hookStyle === option.value && (
                            <svg
                              className="w-6 h-6 text-primary mr-auto"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                      <div className="mt-4 space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                          أو اكتب أسلوب الافتتاح الذي تفضله
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
                          placeholder="مثال: قصة شخصية سريعة، سؤال صادم، مشكلة شائعة..."
                          className="w-full rounded-xl border border-border bg-background/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {hookStyleSkipped
                              ? "تم تخطي هذا السؤال في هذه الجلسة."
                              : "يمكنك اختيار خيار جاهز أو كتابة أسلوب الافتتاح الذي تريده."}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setHookStyle("");
                              setHookStyleSkipped(true);
                              // If this is the last question, skipping should immediately start processing
                              if (step >= totalSteps) {
                                void onStartProcessing();
                              } else {
                                setStep((current) =>
                                  Math.min(totalSteps, current + 1),
                                );
                              }
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            تخطي هذا السؤال
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
                      onClick={() =>
                        setStep((current) => Math.max(1, current - 1))
                      }
                      disabled={step === 1}
                      className={`text-base px-6 ${step === 1 ? "invisible" : "hover:bg-muted"}`}
                    >
                      السابق
                    </Button>
                    {step < totalSteps ? (
                      <Button
                        type="button"
                        size="lg"
                        onClick={() =>
                          setStep((current) =>
                            Math.min(totalSteps, current + 1),
                          )
                        }
                        className="text-base px-8 text-white bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                      >
                        التالي
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="lg"
                        onClick={onStartProcessing}
                        disabled={isProcessing}
                        className="text-base text-white px-8 bg-gradient-coral hover:shadow-warm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                      >
                        {isProcessing ? "جارٍ التحويل..." : "ابدأ التحويل"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading Screen with Skeleton UI */}
        {screen === "loading" && (
          <div className="space-y-8 animate-fade-in">
            {/* Status Card */}
            <Card className="shadow-card border-0 bg-gradient-card">
              <CardContent className="p-10 text-center space-y-8">
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-teal flex items-center justify-center animate-pulse-glow">
                  <svg
                    className="w-10 h-10 text-white animate-bounce-soft"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-foreground">
                    نحضّر مقاطعك الآن
                  </h2>
                  <p className="text-lg text-muted-foreground">
                    {status || "يرجى الانتظار قليلاً..."}
                  </p>
                  {/* Platform-specific recommendations */}
                  {currentRecommendations.length > 0 && (
                    <div className="mt-6 p-5 bg-primary/5 rounded-xl border border-primary/20 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">💡</div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-primary mb-2">
                            نصائح لـ {platformLabels[platform] || platform}
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
                  <p className="text-sm text-muted-foreground font-medium">
                    {progress}%
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Skeleton Cards Preview */}
            <div className="grid gap-6 grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card
                  key={i}
                  className="overflow-hidden shadow-card border-0 bg-gradient-card animate-fade-in"
                  style={{ animationDelay: `${i * 0.2}s` }}
                >
                  {/* Thumbnail Skeleton - 9:16 vertical aspect ratio */}
                  <div className="aspect-[9/16] skeleton" />
                  {/* Content Skeleton */}
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
          <section className="space-y-10 animate-fade-in ">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-teal flex items-center justify-center animate-bounce-soft">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-foreground">
                المقاطع جاهزة!
              </h2>
              <p className="text-lg text-muted-foreground">
                اختر المقطع الذي يعجبك للمعاينة والتحميل
              </p>
            </div>
            {clips.length === 0 ? (
              <p className="text-base text-muted-foreground text-center">
                لم يتم إنشاء أي مقاطع بعد.
              </p>
            ) : (
              <div className="grid gap-8 grid-cols-2 lg:grid-cols-3">
                {clips.map((clip, index) => {
                  // Navigate to preview first; user can then click Edit to open editor
                  // Don't pass blob URLs in params - preview will get video from IndexedDB
                  const previewParams: Record<string, string> = {
                    ...(clip.url && !clip.url.startsWith('blob:') ? { url: clip.url } : {}),
                    startTime: String(clip.start),
                    endTime: String(clip.end),
                    title: clip.title,
                    duration: String(clip.duration),
                    thumbnail: clip.thumbnail ?? "",
                    category: clip.category,
                    tags: clip.tags.join(","),
                    transcript: clip.transcript,
                    ...(segments.length > 0 ? { fullTranscript: "1" } : {}),
                  };
                  const previewUrl = `/preview?${new URLSearchParams(previewParams).toString()}`;
                  const wrapperClass = `aspect-[9/16] relative overflow-hidden cursor-pointer bg-gradient-to-br from-primary/10 to-primary/5`;
                  return (
                    <Card
                      key={`${clip.start}-${clip.end}-${index}`}
                      className="overflow-hidden shadow-card border-0 bg-gradient-card group hover:shadow-card-hover hover:scale-[1.03] transition-all duration-500 animate-fade-in"
                      style={{ animationDelay: `${index * 0.15}s` }}
                    >
                      <button
                        type="button"
                        className={wrapperClass}
                        onClick={() => {
                          router.push(previewUrl);
                        }}
                        aria-label={`معاينة المقطع: ${clip.title}`}
                      >
                        {/* Show thumbnail if available, otherwise show loading placeholder */}
                        {clip.thumbnail ? (
                          <img
                            src={clip.thumbnail}
                            alt={clip.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // If thumbnail fails to load, try to get from IndexedDB
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
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 animate-pulse">
                            {/* Skeleton loader */}
                            <div className="w-full h-full bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800"></div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100 shadow-xl">
                            <svg
                              className="w-7 h-7 text-primary mr-[-3px]"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                        {/* Duration Badge */}
                        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-white text-xs font-medium backdrop-blur-sm">
                          {Math.round(clip.duration)} ثانية
                        </div>
                        {/* Rank Badge */}
                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-primary/90 text-white text-xs font-bold backdrop-blur-sm">
                          #{index + 1}
                        </div>
                      </button>
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
                          onClick={() => {
                            router.push(previewUrl);
                          }}
                          className="w-full h-12 text-white text-base font-semibold bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl"
                        >
                          <svg
                            className="w-5 h-5 ml-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          معاينة ثم تحرير وتصدير
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
