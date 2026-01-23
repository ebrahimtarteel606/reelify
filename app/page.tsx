"use client";

import { useState } from "react";
import styles from "./page.module.css";

type ClipItem = {
  title: string;
  duration: number;
  url: string;
  start: number;
  end: number;
};

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [platform, setPlatform] = useState("instagram");
  const [preferredDuration, setPreferredDuration] = useState(45);
  const [audience, setAudience] = useState("شباب 18-30");
  const [tone, setTone] = useState("ملهم");
  const [hookStyle, setHookStyle] = useState("سؤال مباشر");
  const [keyTopics, setKeyTopics] = useState<string[]>([]);
  const [callToAction, setCallToAction] = useState("شارك مع صديق");

  const persistPreferences = async (partial: Record<string, unknown>) => {
    if (!isLoading) return;
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

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setClips([]);

    if (!file) {
      setError("يرجى اختيار فيديو قبل المتابعة.");
      return;
    }

    try {
      setIsLoading(true);
      setStatus("جارٍ رفع الفيديو...");
      const formData = new FormData();
      formData.append("video", file);
      formData.append("platform", platform);
      formData.append("preferredDuration", String(preferredDuration));
      formData.append("audience", audience);
      formData.append("tone", tone);
      formData.append("hookStyle", hookStyle);
      formData.append("keyTopics", keyTopics.join(", "));
      formData.append("callToAction", callToAction);

      setStatus("جارٍ معالجة الفيديو وتحليل المحتوى...");
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "حدث خطأ غير متوقع أثناء المعالجة.");
      }

      setClips(payload.clips || []);
      setStatus("تم إنشاء المقاطع بنجاح.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إكمال المعالجة.";
      setError(message);
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Realify</p>
          {/* <h1>حوّل فيديوك إلى مقاطع عربية قصيرة جاهزة للنشر</h1> */}
          {/* <p className={styles.subtitle}>
            ارفع الفيديو المحلي، وسيتم استخراج أفضل اللحظات تلقائيًا مع عناوين جذابة.
          </p> */}
        </div>
        <form className={styles.card} onSubmit={onSubmit}>
          {isLoading ? (
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>أثناء المعالجة، شارك تفضيلاتك</h2>
              <p className={styles.helperText}>
                إجاباتك تساعدنا في اختيار المقاطع والعناوين المناسبة.
              </p>
            </div>
          ) : null}
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>تفضيلات المقاطع القصيرة</h2>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="platform">
                على أي منصة ستنشر الفيديو؟
              </label>
              <select
                id="platform"
                className={styles.select}
                value={platform}
                onChange={(event) => {
                  const value = event.target.value;
                  setPlatform(value);
                  void persistPreferences({ platform: value });
                }}
              >
                <option value="instagram">إنستغرام ريلز</option>
                <option value="tiktok">تيك توك</option>
                <option value="youtube">يوتيوب شورتس</option>
                <option value="snapchat">سناب شات سبوتلايت</option>
                <option value="facebook">فيسبوك ريلز</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="preferredDuration">
                ما المدة المفضلة للمقطع؟ (30-90 ثانية)
              </label>
              <select
                id="preferredDuration"
                className={styles.select}
                value={preferredDuration}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPreferredDuration(value);
                  void persistPreferences({ preferredDuration: value });
                }}
              >
                <option value={30}>30 ثانية</option>
                <option value={45}>45 ثانية</option>
                <option value={60}>60 ثانية</option>
                <option value={75}>75 ثانية</option>
                <option value={90}>90 ثانية</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="audience">
                من هو الجمهور المستهدف؟
              </label>
              <select
                id="audience"
                className={styles.select}
                value={audience}
                onChange={(event) => {
                  const value = event.target.value;
                  setAudience(value);
                  void persistPreferences({ audience: value });
                }}
              >
                <option value="شباب 18-30">شباب 18-30</option>
                <option value="رواد أعمال">رواد أعمال</option>
                <option value="مهتمون بالتطوير الذاتي">مهتمون بالتطوير الذاتي</option>
                <option value="طلاب جامعات">طلاب جامعات</option>
                <option value="مهنيون في التقنية">مهنيون في التقنية</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="tone">
                ما النبرة الأنسب للمقطع؟
              </label>
              <select
                id="tone"
                className={styles.select}
                value={tone}
                onChange={(event) => {
                  const value = event.target.value;
                  setTone(value);
                  void persistPreferences({ tone: value });
                }}
              >
                <option value="ملهم">ملهم</option>
                <option value="تعليمي">تعليمي</option>
                <option value="حماسي">حماسي</option>
                <option value="هادئ">هادئ</option>
                <option value="عملي">عملي ومباشر</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="hookStyle">
                أسلوب الافتتاح (الهوك)؟
              </label>
              <select
                id="hookStyle"
                className={styles.select}
                value={hookStyle}
                onChange={(event) => {
                  const value = event.target.value;
                  setHookStyle(value);
                  void persistPreferences({ hookStyle: value });
                }}
              >
                <option value="سؤال مباشر">سؤال مباشر</option>
                <option value="رقم قوي">رقم قوي أو إحصائية</option>
                <option value="وعد سريع">وعد بنتيجة سريعة</option>
                <option value="قصة قصيرة">قصة قصيرة</option>
                <option value="تنبيه أو تحذير">تنبيه أو تحذير</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="keyTopics">
                ما أهم المحاور التي تريد التركيز عليها؟
              </label>
              <select
                id="keyTopics"
                className={styles.multiSelect}
                multiple
                value={keyTopics}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions).map(
                    (option) => option.value
                  );
                  setKeyTopics(values);
                  void persistPreferences({ keyTopics: values.join(", ") });
                }}
              >
                <option value="التحفيز الذاتي">التحفيز الذاتي</option>
                <option value="إدارة الوقت">إدارة الوقت</option>
                <option value="التركيز والإنتاجية">التركيز والإنتاجية</option>
                <option value="القيادة والعمل الجماعي">القيادة والعمل الجماعي</option>
                <option value="التجارب والقصص الواقعية">التجارب والقصص الواقعية</option>
                <option value="النصائح العملية">النصائح العملية</option>
                <option value="التسويق والمبيعات">التسويق والمبيعات</option>
                <option value="الصحة النفسية">الصحة النفسية</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="callToAction">
                هل تريد دعوة للفعل محددة؟
              </label>
              <select
                id="callToAction"
                className={styles.select}
                value={callToAction}
                onChange={(event) => {
                  const value = event.target.value;
                  setCallToAction(value);
                  void persistPreferences({ callToAction: value });
                }}
              >
                <option value="شارك مع صديق">شارك مع صديق</option>
                <option value="احفظ المقطع للعودة له">احفظ المقطع للعودة له</option>
                <option value="اكتب رأيك في التعليقات">اكتب رأيك في التعليقات</option>
                <option value="تابعنا للمزيد">تابعنا للمزيد</option>
                <option value="طبّق النصيحة اليوم">طبّق النصيحة اليوم</option>
              </select>
            </div>
          </div>
          <label className={styles.label} htmlFor="video">
            اختر فيديو من جهازك
          </label>
          <input
            id="video"
            type="file"
            accept="video/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className={styles.input}
          />
          <button className={styles.button} type="submit" disabled={!file || isLoading}>
            {isLoading ? "جارٍ المعالجة..." : "ابدأ التحويل"}
          </button>
          {status ? <p className={styles.status}>{status}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </section>

      <section className={styles.results}>
        <h2>المقاطع الجاهزة</h2>
        {clips.length === 0 && !isLoading ? (
          <p className={styles.empty}>لم يتم إنشاء أي مقاطع بعد.</p>
        ) : (
          <div className={styles.grid}>
            {clips.map((clip) => (
              <article key={clip.url} className={styles.clipCard}>
                <div>
                  <h3>{clip.title}</h3>
                  <p className={styles.meta}>
                    المدة: {Math.round(clip.duration)} ثانية
                  </p>
                </div>
                <a className={styles.link} href={clip.url} download>
                  تحميل المقطع
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
