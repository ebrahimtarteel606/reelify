# Realify Arabic Reels

تحويل الفيديوهات العربية إلى مقاطع قصيرة جاهزة للنشر باستخدام ElevenLabs وGemini وFFmpeg.

## المتطلبات

- Node.js 18+
- FFmpeg مثبت على الجهاز ومتاح في PATH

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
   ```

## التشغيل

```bash
npm run dev
```

## اختبار يدوي

1. افتح `http://localhost:3000`.
2. ارفع فيديو عربي محلي من جهازك.
3. انتظر حتى تظهر المقاطع مع العناوين العربية وروابط التحميل.

## الملاحظات

- يتم حفظ المقاطع الناتجة داخل `public/clips/`.
- واجهة البرمجة تعمل على Node.js عبر `runtime = "nodejs"`.
- في حال وجود خطأ، ستظهر رسالة واضحة مثل: `Missing GEMINI_API_KEY` أو `Transcript was empty`.
