# Realify Arabic Reels

تحويل الفيديوهات العربية إلى مقاطع قصيرة جاهزة للنشر باستخدام ElevenLabs وGemini وFFmpeg.

## المتطلبات

- Node.js 18+
- FFmpeg مثبت على الجهاز ومتاح في PATH (أو استخدام ffmpeg-static في الإنتاج)

## الإعداد

1. تثبيت الاعتمادات:
   ```bash
   npm install
   ```
2. إنشاء ملف `.env.local`:
   ```bash
   ELEVENLABS_API_KEY=YOUR_KEY
   GEMINI_API_KEY=YOUR_KEY
   GEMINI_MODEL=gemini-2.5-flash
   BLOB_READ_WRITE_TOKEN=YOUR_KEY
   # اختياري: مسار FFmpeg
   FFMPEG_PATH=/path/to/ffmpeg
   ```

## التشغيل

```bash
npm run dev
```

## اختبار يدوي

1. افتح `http://localhost:3000`.
2. ارفع فيديو عربي محلي من جهازك (سيتم رفعه إلى Vercel Blob أولاً).
3. انتظر حتى تظهر المقاطع مع العناوين العربية وروابط التحميل.

## الملاحظات

- يتم حفظ المقاطع الناتجة داخل `public/clips/`.
- واجهة البرمجة تعمل على Node.js عبر `runtime = "nodejs"`.
- في حال وجود خطأ، ستظهر رسالة واضحة مثل: `Missing GEMINI_API_KEY` أو `Transcript was empty`.
- في الإنتاج يتم رفع الفيديو إلى Vercel Blob لتجنب قيود حجم الطلبات.
- في بيئات لا يتوفر فيها FFmpeg على PATH، يتم استخدام `ffmpeg-static`.

