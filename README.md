# Realify Arabic Reels v 0.0

تحويل الفيديوهات العربية إلى مقاطع قصيرة جاهزة للنشر باستخدام ElevenLabs وGemini وFFmpeg.wasm.

## المتطلبات

- Node.js 18+
- حساب Vercel مع Blob Storage مفعّل

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
   BLOB_READ_WRITE_TOKEN=YOUR_VERCEL_BLOB_TOKEN
   ```

## التشغيل

```bash
npm run dev
```

## اختبار يدوي

1. افتح `http://localhost:3000`.
2. ارفع فيديو عربي محلي من جهازك.
3. أجب على الأسئلة التسويقية.
4. انتظر حتى تظهر المقاطع مع العناوين العربية وروابط التحميل.

## البنية التقنية

- **FFmpeg.wasm**: يعمل في المتصفح لاستخراج الصوت وتقطيع الفيديو (لا حاجة لتثبيت FFmpeg على الخادم).
- **Vercel Blob**: تخزين الصوت والمقاطع الناتجة لتجنب قيود حجم الطلبات.
- **ElevenLabs**: تحويل الصوت إلى نص مع توقيتات دقيقة.
- **Gemini**: اختيار أفضل المقاطع وتوليد العناوين بالعربية.

## الملاحظات

- واجهة البرمجة تعمل على Node.js عبر `runtime = "nodejs"`.
- في حال وجود خطأ، ستظهر رسالة واضحة مثل: `Missing GEMINI_API_KEY` أو `Transcript was empty`.
- المقاطع الناتجة تُخزّن في Vercel Blob ويمكن تحميلها مباشرة.

