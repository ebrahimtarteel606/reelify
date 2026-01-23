"use client";

import { useState, useRef, useEffect } from "react";
import { upload } from "@vercel/blob/client";
import { getFfmpeg, writeInputFile, extractAudioWav, clipVideoSegment, extractThumbnail, cleanupInputFile } from "@/lib/ffmpegWasm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

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

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [screen, setScreen] = useState<"upload" | "form" | "loading" | "results">(
    "upload"
  );
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [platform, setPlatform] = useState("instagram");
  const [preferredDuration, setPreferredDuration] = useState(45);
  const [audience, setAudience] = useState("شباب 18-30");
  const [tone, setTone] = useState("ملهم");
  const [hookStyle, setHookStyle] = useState("سؤال مباشر");
  const [keyTopics, setKeyTopics] = useState<string[]>([]);
  const [callToAction, setCallToAction] = useState("شارك مع صديق");
  const [skipQuestions, setSkipQuestions] = useState(false);
  const [thumbnailPortraitMap, setThumbnailPortraitMap] = useState<Record<string, boolean>>({});

  // Background processing state
  const [backgroundResult, setBackgroundResult] = useState<{
    ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>;
    inputName: string;
    candidates: Array<{ title: string; start: number; end: number; category: string; tags: string[] }>;
    segments: TranscriptSegment[];
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

  const persistPreferences = async (partial: Record<string, unknown>) => {
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(partial)
      });
    } catch {
      // Best-effort persistence during processing.
    }
  };

  const startBackgroundProcessing = async (videoFile: File) => {
    setBackgroundProcessing(true);
    setBackgroundError("");
    setBackgroundResult(null);

    try {
      // Load FFmpeg and write input file
      const ffmpeg = await getFfmpeg();
      const inputName = `input-${Date.now()}.mp4`;
      await writeInputFile(ffmpeg, inputName, videoFile);

      // Extract audio
      const audioName = `audio-${Date.now()}.wav`;
      const audioBlob = await extractAudioWav(ffmpeg, inputName, audioName);

      // Upload audio to Vercel Blob
      const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });
      const audioUpload = await upload(audioFile.name, audioFile, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });

      // Call /api/process for transcription and Gemini analysis
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: audioUpload.url }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "حدث خطأ أثناء التحليل.");
      }

      const candidates = Array.isArray(payload?.clips) ? payload.clips : [];
      const segments: TranscriptSegment[] = Array.isArray(payload?.segments) ? payload.segments : [];

      if (candidates.length === 0) {
        throw new Error("لم يتم العثور على مقاطع مناسبة.");
      }

      // Store results
      setBackgroundResult({
        ffmpeg,
        inputName,
        candidates,
        segments,
      });
    } catch (err) {
      console.error("Background processing error:", err);
      const message = err instanceof Error ? err.message : "حدث خطأ أثناء المعالجة.";
      setBackgroundError(message);
    } finally {
      setBackgroundProcessing(false);
    }
  };

  const onUploadSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setClips([]);
    setBackgroundError("");
    setBackgroundResult(null);

    if (!file) {
      setError("يرجى اختيار فيديو قبل المتابعة.");
      return;
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
        throw new Error("لم يتم تحليل الفيديو بعد. يرجى المحاولة مرة أخرى.");
      }

      const { ffmpeg, inputName, candidates, segments } = backgroundResultRef.current;

      // Helper to extract transcript for a specific time range
      const getClipTranscript = (start: number, end: number): string => {
        return segments
          .filter((seg) => seg.end > start && seg.start < end)
          .map((seg) => seg.text)
          .join(" ");
      };

      setStatus("نقوم بتجهيز المقاطع الآن...");
      const uploadedClips: ClipItem[] = [];

      for (const candidate of candidates) {
        const clipId = crypto.randomUUID();
        const clipName = `clip-${clipId}.mp4`;
        const thumbName = `thumb-${clipId}.jpg`;

        // Extract video clip
        const clipBlob = await clipVideoSegment(
          ffmpeg,
          inputName,
          clipName,
          candidate.start,
          candidate.end
        );

        // Extract thumbnail from first frame
        const thumbBlob = await extractThumbnail(
          ffmpeg,
          inputName,
          thumbName,
          candidate.start
        );

        // Upload clip to Vercel Blob
        const clipFile = new File([clipBlob], clipName, { type: "video/mp4" });
        const clipUpload = await upload(clipFile.name, clipFile, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });

        // Upload thumbnail to Vercel Blob
        const thumbFile = new File([thumbBlob], thumbName, { type: "image/jpeg" });
        const thumbUpload = await upload(thumbFile.name, thumbFile, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });

        const duration = Math.max(0, candidate.end - candidate.start);
        const clipTranscript = getClipTranscript(candidate.start, candidate.end);

        uploadedClips.push({
          title: candidate.title,
          start: candidate.start,
          end: candidate.end,
          duration,
          url: clipUpload.url,
          thumbnail: thumbUpload.url,
          category: candidate.category || "عام",
          tags: Array.isArray(candidate.tags) ? candidate.tags : [],
          transcript: clipTranscript,
        });
      }

      // Clean up input file to free memory
      await cleanupInputFile(ffmpeg, inputName);

      setClips(uploadedClips);
      setStatus("");
      setScreen("results");
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
      setScreen("form");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleThumbnailLoad =
    (clipUrl: string) => (event: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      if (!naturalWidth || !naturalHeight) return;
      const isPortrait = naturalHeight >= naturalWidth;
      setThumbnailPortraitMap((prev) =>
        prev[clipUrl] === isPortrait ? prev : { ...prev, [clipUrl]: isPortrait }
      );
    };

  const handleSkipQuestions = async () => {
    setError("");
    setStatus("");
    // Persist a minimal preference set so the model can infer defaults
    await persistPreferences({ platform });
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
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pb-24 pt-20">
        {/* Header */}
        <header className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-5 py-2 text-sm font-semibold text-primary shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse-glow" />
            Realify
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
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
              <form className="flex flex-col items-center gap-8" onSubmit={onUploadSubmit}>
                <div className="w-full">
                  <label
                    htmlFor="video"
                    className="group flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-primary/20 rounded-2xl cursor-pointer bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 hover:scale-[1.01]"
                  >
                    <div className="flex flex-col items-center justify-center pt-6 pb-8">
                      <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="mb-2 text-base text-foreground">
                        <span className="font-semibold text-primary">اضغط لرفع الفيديو</span>
                      </p>
                      <p className="text-sm text-muted-foreground">MP4, MOV, AVI</p>
                    </div>
                    <input
                      id="video"
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {file && (
                    <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in-scale">
                      <p className="text-sm text-center text-primary font-medium flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
                {error && <p className="text-sm text-destructive animate-fade-in">{error}</p>}
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
                  <span className="text-muted-foreground font-medium">السؤال {step} من {totalSteps}</span>
                  <span className="font-semibold text-primary text-lg">{Math.round((step / totalSteps) * 100)}%</span>
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
                  <span className="text-sm font-medium text-primary">نحلل الفيديو في الخلفية...</span>
                </div>
              )}

              {/* Skip Questions Toggle */}
              <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="skip-questions"
                    checked={skipQuestions}
                    onCheckedChange={(checked) => setSkipQuestions(Boolean(checked))}
                  />
                  <label htmlFor="skip-questions" className="text-sm font-medium text-foreground">
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
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-emerald-700">جاهز للتحويل</span>
                </div>
              )}

              {backgroundError && (
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-red-600">{backgroundError}</span>
                </div>
              )}

              {!skipQuestions && (
                <>
                  {/* Question Title */}
                  <h2 className="text-2xl font-bold text-center text-foreground animate-fade-in">
                    {questionTitles[step]}
                  </h2>

                  {error && <p className="text-sm text-destructive text-center animate-fade-in">{error}</p>}

                  {/* Step 1: Platform */}
                  {step === 1 && (
                <div className="grid gap-4 animate-fade-in">
                  {[
                    { 
                      value: "instagram", 
                      label: "إنستغرام ريلز", 
                      icon: (
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                          <defs>
                            <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#FFDC80" />
                              <stop offset="25%" stopColor="#FCAF45" />
                              <stop offset="50%" stopColor="#F77737" />
                              <stop offset="75%" stopColor="#C13584" />
                              <stop offset="100%" stopColor="#833AB4" />
                            </linearGradient>
                          </defs>
                          <path fill="url(#instagram-gradient)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                      ),
                      color: "text-pink-500"
                    },
                    { 
                      value: "tiktok", 
                      label: "تيك توك", 
                      icon: (
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                        </svg>
                      ),
                      color: "text-black"
                    },
                    { 
                      value: "youtube", 
                      label: "يوتيوب شورتس", 
                      icon: (
                        <svg className="w-8 h-8 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                      ),
                      color: "text-red-600"
                    },
                    { 
                      value: "snapchat", 
                      label: "سناب شات سبوتلايت", 
                      icon: (
                        <svg className="w-8 h-8 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z"/>
                        </svg>
                      ),
                      color: "text-yellow-400"
                    },
                    { 
                      value: "facebook", 
                      label: "فيسبوك ريلز", 
                      icon: (
                        <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      ),
                      color: "text-blue-600"
                    },
                  ].map((option, index) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setPlatform(option.value);
                        void persistPreferences({ platform: option.value });
                      }}
                      className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${platform === option.value
                          ? "border-primary bg-primary/10 shadow-teal"
                          : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                        }`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="w-10 h-10 flex items-center justify-center">{option.icon}</div>
                      <span className="font-semibold text-lg">{option.label}</span>
                      {platform === option.value && (
                        <svg className="w-6 h-6 text-primary mr-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                  )}

                  {/* Step 2: Duration */}
                  {step === 2 && (
                <div className="grid grid-cols-3 gap-4 animate-fade-in">
                  {[30, 45, 60, 75, 90].map((duration, index) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => {
                        setPreferredDuration(duration);
                        void persistPreferences({ preferredDuration: duration });
                      }}
                      className={`p-6 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.05] active:scale-[0.98] ${preferredDuration === duration
                          ? "border-primary bg-primary/10 shadow-teal"
                          : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                        }`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <span className="text-3xl font-bold text-foreground block">{duration}</span>
                      <span className="block text-sm text-muted-foreground mt-1">ثانية</span>
                    </button>
                  ))}
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
                        void persistPreferences({ audience: option.value });
                      }}
                      className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${audience === option.value
                          ? "border-primary bg-primary/10 shadow-teal"
                          : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                        }`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <span className="text-3xl">{option.icon}</span>
                      <span className="font-semibold text-lg">{option.value}</span>
                      {audience === option.value && (
                        <svg className="w-6 h-6 text-primary mr-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
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
                        void persistPreferences({ tone: option.value });
                      }}
                      className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${tone === option.value
                          ? "border-primary bg-primary/10 shadow-teal"
                          : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                        }`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <span className="text-3xl">{option.icon}</span>
                      <span className="font-semibold text-lg">{option.label || option.value}</span>
                      {tone === option.value && (
                        <svg className="w-6 h-6 text-primary mr-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                  )}

                  {/* Step 5: Hook Style */}
                  {step === 5 && (
                <div className="grid gap-4 animate-fade-in">
                  {[
                    { value: "سؤال مباشر", icon: "❓" },
                    { value: "رقم قوي", label: "رقم قوي أو إحصائية", icon: "📊" },
                    { value: "وعد سريع", label: "وعد بنتيجة سريعة", icon: "⚡" },
                    { value: "قصة قصيرة", icon: "📖" },
                    { value: "تنبيه أو تحذير", icon: "⚠️" },
                  ].map((option, index) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setHookStyle(option.value);
                        void persistPreferences({ hookStyle: option.value });
                      }}
                      className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all duration-300 text-right hover:scale-[1.02] active:scale-[0.98] ${hookStyle === option.value
                          ? "border-primary bg-primary/10 shadow-teal"
                          : "border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20"
                        }`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <span className="text-3xl">{option.icon}</span>
                      <span className="font-semibold text-lg">{option.label || option.value}</span>
                      {hookStyle === option.value && (
                        <svg className="w-6 h-6 text-primary mr-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
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
                      السابق
                    </Button>
                    {step < totalSteps ? (
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => setStep((current) => Math.min(totalSteps, current + 1))}
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
                  <svg className="w-10 h-10 text-white animate-bounce-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-foreground">نحضّر مقاطعك الآن</h2>
                  <p className="text-lg text-muted-foreground">
                    {status || "يرجى الانتظار قليلاً..."}
                  </p>
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full progress-gradient rounded-full animate-pulse" style={{ width: "66%" }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Skeleton Cards Preview */}
            <div className="grid gap-6 grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="overflow-hidden shadow-card border-0 bg-gradient-card animate-fade-in" style={{ animationDelay: `${i * 0.2}s` }}>
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
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-foreground">المقاطع جاهزة!</h2>
              <p className="text-lg text-muted-foreground">اختر المقطع الذي يعجبك للمعاينة والتحميل</p>
            </div>
            {clips.length === 0 ? (
              <p className="text-base text-muted-foreground text-center">لم يتم إنشاء أي مقاطع بعد.</p>
            ) : (
              <div className="grid gap-8 grid-cols-2 lg:grid-cols-3">
                {clips.map((clip, index) => {
                  const previewParams = new URLSearchParams({
                    url: clip.url,
                    title: clip.title,
                    duration: String(Math.round(clip.duration)),
                    thumbnail: clip.thumbnail,
                    category: clip.category,
                    tags: clip.tags.join(","),
                    transcript: clip.transcript,
                  });
                  const previewUrl = `/preview?${previewParams.toString()}`;
                  const isPortrait = thumbnailPortraitMap[clip.url];
                  const wrapperClass = `aspect-[9/16] relative overflow-hidden ${
                    isPortrait === false ? "bg-black" : "bg-muted"
                  }`;
                  const imageClass = `w-full h-full transition-transform duration-500 group-hover:scale-110 ${
                    isPortrait === false ? "object-contain" : "object-cover"
                  }`;
                  return (
                    <Card
                      key={clip.url}
                      className="overflow-hidden shadow-card border-0 bg-gradient-card group hover:shadow-card-hover hover:scale-[1.03] transition-all duration-500 animate-fade-in"
                      style={{ animationDelay: `${index * 0.15}s` }}
                    >
                      <div className={wrapperClass}>
                        <img
                          src={clip.thumbnail}
                          alt={clip.title}
                          onLoad={handleThumbnailLoad(clip.url)}
                          className={imageClass}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100 shadow-xl">
                            <svg className="w-7 h-7 text-primary mr-[-3px]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                        {/* Duration Badge */}
                        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-white text-xs font-medium backdrop-blur-sm">
                          {Math.round(clip.duration)} ثانية
                        </div>
                      </div>
                      <CardContent className="p-5 space-y-4">
                        <div className="space-y-2">
                          <span className="inline-block px-3 py-1 text-xs font-semibold bg-primary/10 text-primary rounded-full">
                            {clip.category}
                          </span>
                          <h3 className="font-bold text-foreground text-lg line-clamp-2 leading-snug">{clip.title}</h3>
                        </div>
                        <Button
                          asChild
                          className="w-full h-12 text-white text-base font-semibold bg-gradient-teal hover:shadow-teal hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-xl"
                        >
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                            معاينة وتحميل
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
      </section>
    </main>
  );
}
