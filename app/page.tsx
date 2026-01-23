"use client";

import { useState } from "react";
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

  const onUploadSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setClips([]);

    if (!file) {
      setError("يرجى اختيار فيديو قبل المتابعة.");
      return;
    }

    setStep(1);
    setScreen("form");
  };

  const onStartProcessing = async () => {
    try {
      if (!file) {
        throw new Error("يرجى رفع الفيديو أولاً.");
      }
      setError("");
      setScreen("loading");
      setIsProcessing(true);
      setStatus("نجهّز الصوت للتفريغ...");
      const ffmpeg = await getFfmpeg();
      const inputName = `input-${Date.now()}.mp4`;
      await writeInputFile(ffmpeg, inputName, file);

      const audioName = `audio-${Date.now()}.wav`;
      const audioBlob = await extractAudioWav(ffmpeg, inputName, audioName);

      // Upload audio to Vercel Blob
      setStatus("نرفع الصوت للمعالجة...");
      const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });
      const audioUpload = await upload(audioFile.name, audioFile, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });

      // Send audio URL to server for transcription
      setStatus("نحلل النص ونختار أفضل المقاطع...");
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: audioUpload.url }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "حدث خطأ غير متوقع أثناء المعالجة.");
      }

      const candidates = Array.isArray(payload?.clips) ? payload.clips : [];
      const segments: TranscriptSegment[] = Array.isArray(payload?.segments) ? payload.segments : [];
      if (candidates.length === 0) {
        throw new Error("لم يتم العثور على مقاطع مناسبة.");
      }

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

  const totalSteps = 7;

  const questionTitles: Record<number, string> = {
    1: "على أي منصة ستنشر الفيديو؟",
    2: "ما المدة المفضلة للمقطع؟",
    3: "من هو الجمهور المستهدف؟",
    4: "ما النبرة الأنسب للمقطع؟",
    5: "ما أسلوب الافتتاح (الهوك)؟",
    6: "ما أهم المحاور التي تريد التركيز عليها؟",
    7: "هل تريد دعوة للفعل محددة؟",
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50" dir="rtl">
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 pb-20 pt-16">
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Realify
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            اصنع ريلز عربية احترافية
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            ارفع الفيديو وأجب عن أسئلة بسيطة لنصنع لك أفضل المقاطع
          </p>
        </header>

        {/* Upload Screen */}
        {screen === "upload" && (
          <Card className="shadow-lg border-0 bg-white">
            <CardContent className="p-8">
              <form className="flex flex-col items-center gap-6" onSubmit={onUploadSubmit}>
                <div className="w-full">
                  <label
                    htmlFor="video"
                    className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50/50 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-12 h-12 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold text-primary">اضغط لرفع الفيديو</span>
                      </p>
                      <p className="text-xs text-gray-400">MP4, MOV, AVI</p>
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
                    <p className="mt-3 text-sm text-center text-green-600 font-medium">
                      تم اختيار: {file.name}
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={!file} size="lg" className="w-full max-w-xs">
                  متابعة
                </Button>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Form Screen - One Question Per Step */}
        {screen === "form" && (
          <Card className="shadow-lg border-0 bg-white">
            <CardContent className="p-8 space-y-8">
              {/* Progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">السؤال {step} من {totalSteps}</span>
                  <span className="font-medium text-primary">{Math.round((step / totalSteps) * 100)}%</span>
                </div>
                <Progress value={(step / totalSteps) * 100} className="h-2" />
              </div>

              {/* Question Title */}
              <h2 className="text-xl font-semibold text-center text-gray-900">
                {questionTitles[step]}
              </h2>

              {error && <p className="text-sm text-destructive text-center">{error}</p>}

              {/* Step 1: Platform */}
              {step === 1 && (
                <div className="grid gap-3">
                  {[
                    { value: "instagram", label: "إنستغرام ريلز", icon: "📸" },
                    { value: "tiktok", label: "تيك توك", icon: "🎵" },
                    { value: "youtube", label: "يوتيوب شورتس", icon: "▶️" },
                    { value: "snapchat", label: "سناب شات سبوتلايت", icon: "👻" },
                    { value: "facebook", label: "فيسبوك ريلز", icon: "📘" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setPlatform(option.value);
                        void persistPreferences({ platform: option.value });
                      }}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-right ${
                        platform === option.value
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="font-medium">{option.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: Duration */}
              {step === 2 && (
                <div className="grid grid-cols-3 gap-3">
                  {[30, 45, 60, 75, 90].map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => {
                        setPreferredDuration(duration);
                        void persistPreferences({ preferredDuration: duration });
                      }}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        preferredDuration === duration
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <span className="text-2xl font-bold text-gray-900">{duration}</span>
                      <span className="block text-sm text-muted-foreground">ثانية</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 3: Audience */}
              {step === 3 && (
                <div className="grid gap-3">
                  {[
                    { value: "شباب 18-30", icon: "👥" },
                    { value: "رواد أعمال", icon: "💼" },
                    { value: "مهتمون بالتطوير الذاتي", icon: "🚀" },
                    { value: "طلاب جامعات", icon: "🎓" },
                    { value: "مهنيون في التقنية", icon: "💻" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setAudience(option.value);
                        void persistPreferences({ audience: option.value });
                      }}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-right ${
                        audience === option.value
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="font-medium">{option.value}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 4: Tone */}
              {step === 4 && (
                <div className="grid gap-3">
                  {[
                    { value: "ملهم", icon: "✨" },
                    { value: "تعليمي", icon: "📚" },
                    { value: "حماسي", icon: "🔥" },
                    { value: "هادئ", icon: "🌿" },
                    { value: "عملي", label: "عملي ومباشر", icon: "🎯" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTone(option.value);
                        void persistPreferences({ tone: option.value });
                      }}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-right ${
                        tone === option.value
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="font-medium">{option.label || option.value}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 5: Hook Style */}
              {step === 5 && (
                <div className="grid gap-3">
                  {[
                    { value: "سؤال مباشر", icon: "❓" },
                    { value: "رقم قوي", label: "رقم قوي أو إحصائية", icon: "📊" },
                    { value: "وعد سريع", label: "وعد بنتيجة سريعة", icon: "⚡" },
                    { value: "قصة قصيرة", icon: "📖" },
                    { value: "تنبيه أو تحذير", icon: "⚠️" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setHookStyle(option.value);
                        void persistPreferences({ hookStyle: option.value });
                      }}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-right ${
                        hookStyle === option.value
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="font-medium">{option.label || option.value}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 6: Key Topics */}
              {step === 6 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: "التحفيز الذاتي", icon: "💪" },
                    { value: "إدارة الوقت", icon: "⏰" },
                    { value: "التركيز والإنتاجية", icon: "🎯" },
                    { value: "القيادة والعمل الجماعي", icon: "👥" },
                    { value: "التجارب والقصص الواقعية", icon: "📝" },
                    { value: "النصائح العملية", icon: "💡" },
                    { value: "التسويق والمبيعات", icon: "📈" },
                    { value: "الصحة النفسية", icon: "🧠" },
                  ].map((topic) => (
                    <button
                      key={topic.value}
                      type="button"
                      onClick={() => {
                        const next = keyTopics.includes(topic.value)
                          ? keyTopics.filter((item) => item !== topic.value)
                          : [...keyTopics, topic.value];
                        setKeyTopics(next);
                        void persistPreferences({ keyTopics: next.join(", ") });
                      }}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-right ${
                        keyTopics.includes(topic.value)
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <span className="text-xl">{topic.icon}</span>
                      <span className="font-medium text-sm">{topic.value}</span>
                      {keyTopics.includes(topic.value) && (
                        <span className="mr-auto text-primary">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 7: Call to Action */}
              {step === 7 && (
                <div className="grid gap-3">
                  {[
                    { value: "شارك مع صديق", icon: "🔗" },
                    { value: "احفظ المقطع للعودة له", icon: "🔖" },
                    { value: "اكتب رأيك في التعليقات", icon: "💬" },
                    { value: "تابعنا للمزيد", icon: "➕" },
                    { value: "طبّق النصيحة اليوم", icon: "✅" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setCallToAction(option.value);
                        void persistPreferences({ callToAction: option.value });
                      }}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-right ${
                        callToAction === option.value
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="font-medium">{option.value}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep((current) => Math.max(1, current - 1))}
                  disabled={step === 1}
                  className={step === 1 ? "invisible" : ""}
                >
                  السابق
                </Button>
                {step < totalSteps ? (
                  <Button
                    type="button"
                    onClick={() => setStep((current) => Math.min(totalSteps, current + 1))}
                  >
                    التالي
                  </Button>
                ) : (
                  <Button type="button" onClick={onStartProcessing} disabled={isProcessing}>
                    {isProcessing ? "جارٍ التحويل..." : "ابدأ التحويل"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading Screen */}
        {screen === "loading" && (
          <Card className="shadow-lg border-0 bg-white">
            <CardContent className="p-12 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-gray-900">نحضّر مقاطعك الآن</h2>
                <p className="text-muted-foreground">
                  {status || "يرجى الانتظار قليلاً..."}
                </p>
              </div>
              <Progress value={66} className="max-w-xs mx-auto" />
            </CardContent>
          </Card>
        )}

        {/* Results Screen */}
        {screen === "results" && (
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">المقاطع جاهزة!</h2>
              <p className="text-muted-foreground">اختر المقطع الذي يعجبك للمعاينة والتحميل</p>
            </div>
            {clips.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">لم يتم إنشاء أي مقاطع بعد.</p>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {clips.map((clip) => {
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
                  return (
                    <Card key={clip.url} className="overflow-hidden shadow-lg border-0 bg-white group">
                      <div className="aspect-video bg-gray-100 relative overflow-hidden">
                        <img
                          src={clip.thumbnail}
                          alt={clip.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-5 h-5 text-gray-900 mr-[-2px]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-4 space-y-3">
                        <div>
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full mb-2">
                            {clip.category}
                          </span>
                          <h3 className="font-semibold text-gray-900 line-clamp-2">{clip.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {Math.round(clip.duration)} ثانية
                          </p>
                        </div>
                        <Button asChild className="w-full">
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
