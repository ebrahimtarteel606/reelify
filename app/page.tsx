"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
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
};

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [screen, setScreen] = useState<"upload" | "form" | "loading" | "results">(
    "upload"
  );
  const [step, setStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
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

  const onUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setClips([]);

    if (!file) {
      setError("يرجى اختيار فيديو قبل المتابعة.");
      return;
    }

    try {
      setIsUploading(true);
      setStatus("جارٍ رفع الفيديو...");
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload"
      });
      setVideoUrl(blob.url);
      setStep(1);
      setScreen("form");
      setStatus("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "تعذر رفع الفيديو، حاول مرة أخرى.";
      setError(message);
      setStatus("");
    } finally {
      setIsUploading(false);
    }
  };

  const onStartProcessing = async () => {
    try {
      if (!videoUrl) {
        throw new Error("يرجى رفع الفيديو أولاً.");
      }
      setScreen("loading");
      setStatus("نجهّز الفيديو الآن...");
      const requestBody = { videoUrl };
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "حدث خطأ غير متوقع أثناء المعالجة.");
      }

      setClips(payload.clips || []);
      setStatus("");
      setScreen("results");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إكمال المعالجة.";
      setError(message);
      setStatus("");
      setScreen("form");
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-20 pt-12">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">
            Realify
          </p>
          <h1 className="text-3xl font-semibold leading-snug">
            اصنع ريلز عربية دقيقة خلال دقائق
          </h1>
          <p className="text-sm text-muted-foreground">
            ارفع الفيديو أولاً، وخلال المعالجة أجب عن أسئلة قصيرة لالتقاط أفضل المقاطع.
          </p>
        </header>

        {screen === "upload" ? (
          <Card>
            <CardHeader>
              <CardTitle>ارفع الفيديو</CardTitle>
              <CardDescription>ابدأ برفع الفيديو المحلي ثم انتقل للأسئلة.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={onUploadSubmit}>
                <input
                  id="video"
                  type="file"
                  accept="video/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground file:transition hover:file:opacity-90"
                />
                <Button type="submit" disabled={!file || isUploading}>
                  {isUploading ? "جارٍ الرفع..." : "التالي"}
                </Button>
                {status ? <p className="text-sm text-primary">{status}</p> : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </form>
            </CardContent>
          </Card>
        ) : null}

        {screen === "form" ? (
          <Card>
            <CardHeader>
              <CardTitle>الأسئلة التسويقية</CardTitle>
              <CardDescription>اختر الإجابات المناسبة لتحسين النتائج.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>الخطوة {step} من 3</span>
                  <span>{Math.round((step / 3) * 100)}%</span>
                </div>
                <Progress value={(step / 3) * 100} />
              </div>

              {step === 1 ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      على أي منصة ستنشر الفيديو؟
                    </p>
                    <Select
                      value={platform}
                      onValueChange={(value) => {
                        setPlatform(value);
                        void persistPreferences({ platform: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المنصة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">إنستغرام ريلز</SelectItem>
                        <SelectItem value="tiktok">تيك توك</SelectItem>
                        <SelectItem value="youtube">يوتيوب شورتس</SelectItem>
                        <SelectItem value="snapchat">سناب شات سبوتلايت</SelectItem>
                        <SelectItem value="facebook">فيسبوك ريلز</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      ما المدة المفضلة للمقطع؟ (30-90 ثانية)
                    </p>
                    <Select
                      value={String(preferredDuration)}
                      onValueChange={(value) => {
                        const duration = Number(value);
                        setPreferredDuration(duration);
                        void persistPreferences({ preferredDuration: duration });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المدة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 ثانية</SelectItem>
                        <SelectItem value="45">45 ثانية</SelectItem>
                        <SelectItem value="60">60 ثانية</SelectItem>
                        <SelectItem value="75">75 ثانية</SelectItem>
                        <SelectItem value="90">90 ثانية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">من هو الجمهور المستهدف؟</p>
                    <Select
                      value={audience}
                      onValueChange={(value) => {
                        setAudience(value);
                        void persistPreferences({ audience: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الجمهور" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="شباب 18-30">شباب 18-30</SelectItem>
                        <SelectItem value="رواد أعمال">رواد أعمال</SelectItem>
                        <SelectItem value="مهتمون بالتطوير الذاتي">
                          مهتمون بالتطوير الذاتي
                        </SelectItem>
                        <SelectItem value="طلاب جامعات">طلاب جامعات</SelectItem>
                        <SelectItem value="مهنيون في التقنية">مهنيون في التقنية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">ما النبرة الأنسب للمقطع؟</p>
                    <Select
                      value={tone}
                      onValueChange={(value) => {
                        setTone(value);
                        void persistPreferences({ tone: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر النبرة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ملهم">ملهم</SelectItem>
                        <SelectItem value="تعليمي">تعليمي</SelectItem>
                        <SelectItem value="حماسي">حماسي</SelectItem>
                        <SelectItem value="هادئ">هادئ</SelectItem>
                        <SelectItem value="عملي">عملي ومباشر</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">أسلوب الافتتاح (الهوك)؟</p>
                    <Select
                      value={hookStyle}
                      onValueChange={(value) => {
                        setHookStyle(value);
                        void persistPreferences({ hookStyle: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الأسلوب" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="سؤال مباشر">سؤال مباشر</SelectItem>
                        <SelectItem value="رقم قوي">رقم قوي أو إحصائية</SelectItem>
                        <SelectItem value="وعد سريع">وعد بنتيجة سريعة</SelectItem>
                        <SelectItem value="قصة قصيرة">قصة قصيرة</SelectItem>
                        <SelectItem value="تنبيه أو تحذير">تنبيه أو تحذير</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      ما أهم المحاور التي تريد التركيز عليها؟
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        "التحفيز الذاتي",
                        "إدارة الوقت",
                        "التركيز والإنتاجية",
                        "القيادة والعمل الجماعي",
                        "التجارب والقصص الواقعية",
                        "النصائح العملية",
                        "التسويق والمبيعات",
                        "الصحة النفسية"
                      ].map((topic) => (
                        <label
                          key={topic}
                          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={keyTopics.includes(topic)}
                            onCheckedChange={(checked) => {
                              const next = checked === true
                                ? [...keyTopics, topic]
                                : keyTopics.filter((item) => item !== topic);
                              setKeyTopics(next);
                              void persistPreferences({ keyTopics: next.join(", ") });
                            }}
                          />
                          <span>{topic}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">هل تريد دعوة للفعل محددة؟</p>
                    <Select
                      value={callToAction}
                      onValueChange={(value) => {
                        setCallToAction(value);
                        void persistPreferences({ callToAction: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر دعوة للفعل" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="شارك مع صديق">شارك مع صديق</SelectItem>
                        <SelectItem value="احفظ المقطع للعودة له">
                          احفظ المقطع للعودة له
                        </SelectItem>
                        <SelectItem value="اكتب رأيك في التعليقات">
                          اكتب رأيك في التعليقات
                        </SelectItem>
                        <SelectItem value="تابعنا للمزيد">تابعنا للمزيد</SelectItem>
                        <SelectItem value="طبّق النصيحة اليوم">طبّق النصيحة اليوم</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                {step > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep((current) => Math.max(1, current - 1))}
                  >
                    السابق
                  </Button>
                ) : (
                  <span />
                )}
                {step < 3 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep((current) => Math.min(3, current + 1))}
                  >
                    التالي
                  </Button>
                ) : (
                  <Button type="button" onClick={onStartProcessing}>
                    ابدأ التحويل
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {screen === "loading" ? (
          <Card>
            <CardHeader>
              <CardTitle>نحضّر مقاطعك الآن</CardTitle>
              <CardDescription>نحن نجهّز الفيديوهات المناسبة لك الآن.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Progress value={66} />
                <p className="text-sm text-muted-foreground">
                  {status || "يرجى الانتظار قليلاً..."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {screen === "results" ? (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">المقاطع الجاهزة</h2>
            {clips.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم يتم إنشاء أي مقاطع بعد.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {clips.map((clip) => (
                  <Card key={clip.url}>
                    <CardHeader>
                      <CardTitle className="text-base">{clip.title}</CardTitle>
                      <CardDescription>
                        المدة: {Math.round(clip.duration)} ثانية
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button asChild>
                        <a href={clip.url} download>
                          تحميل المقطع
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}
