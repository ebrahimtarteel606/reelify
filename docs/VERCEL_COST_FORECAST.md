# Vercel Cost Forecast: 100 Users, 10 Reels/Day, 1-Hour Videos

Based on [Vercel Pricing](https://vercel.com/pricing) and Reelify’s architecture (one serverless flow per reel).

---

## Usage assumptions

| Parameter | Value |
|-----------|--------|
| Users | 100 |
| Reels per user per day | 10 |
| Video length per reel | 1 hour |
| **Total process requests per day** | **1,000** |
| **Total process requests per month** | **~30,000** |

**Per-reel flow (from your app):**

- 1 × `POST /api/process` (FormData: audio + preferences).
- That route: transcribe (ElevenLabs or Gemini) then Gemini clip analysis. No separate `/api/transcribe` call in this flow.

**Per-invocation estimates:**

- **Active CPU time:** ~10 minutes (transcription of 1 hr audio + Gemini). Conservative range: 5–15 min.
- **Memory:** 1 GB (default Node serverless).
- **Request payload (audio):** ~10–20 MB (1 hr MP3, 16–24 kbps mono).
- **Response:** ~0.1–1 MB (JSON clips + segments).

---

## Monthly usage on Vercel

| Resource | Calculation | Monthly usage |
|----------|-------------|----------------|
| **Function invocations** | 1,000/day × 30 | **30,000** |
| **Active CPU (hours)** | 30,000 × (10/60) | **5,000 hours** |
| **Provisioned memory (GB-hours)** | 30,000 × 1 × (10/60) | **5,000 GB-hours** |
| **Edge requests (approx.)** | Process + pages, ~3,000/day | **~90,000** |
| **Fast Data Transfer (approx.)** | 1,000 × 15 MB in + 1 MB out ≈ 16 GB/day | **~480 GB** |

---

## Vercel Pro plan cost (reference: vercel.com/pricing)

Pro is required for this load (Hobby has tight limits and is for personal use). Pricing below is from Vercel’s public pricing; you get **$20 included usage credit** on Pro.

| SKU | Allowance / rate | Your usage | Estimated cost (USD/mo) |
|-----|-------------------|------------|--------------------------|
| **Invocations** | $0.60 per 1M | 30,000 | **~$18** |
| **Active CPU** | $0.128 per hour | 5,000 hrs | **~$640** |
| **Provisioned Memory** | $0.0106 per GB-hour | 5,000 GB-hrs | **~$53** |
| **Edge requests** | 10M/mo included | ~90K | **$0** |
| **Fast Data Transfer** | 1 TB/mo included | ~480 GB | **$0** |

**Subtotal (Vercel compute only):** **~$711/month**  
After **$20 included credit:** **~$691/month** (order of magnitude; actuals depend on rounding and other usage).

---

## Summary

- **Rough Vercel-only forecast:** **~\$700/month** (Pro plan, 100 users × 10 reels/day × 1 hr video).
- **Driver:** **Active CPU** (~\$640) from long-running transcription + Gemini per 1-hour video.
- Invocations and memory add ~\$70; edge and data transfer stay within Pro included amounts.

---

## Important caveats

1. **Function duration**  
   Processing ~10 min per request is within Pro’s configurable limit (e.g. 800 s). Set `maxDuration` for the process route (e.g. in that route file or `vercel.json`) so the function doesn’t time out.

2. **Third-party APIs (not on Vercel)**  
   This estimate is **Vercel only**. You still pay for:
   - **Gemini** (transcription and/or clip analysis)
   - **ElevenLabs** (if used for transcription)

   Those bills depend on your chosen providers and their pricing for 1,000 hours of audio per day.

3. **Scaling and optimization**  
   - Reducing average CPU time per reel (faster transcription, smaller audio, or chunking) lowers the **Active CPU** share.
   - Moving heavy work to a queue + background worker (e.g. off-Vercel) would change the cost shape (fewer long serverless runs, possibly lower Vercel compute, but other infra cost).

4. **Hobby plan**  
   Hobby is not suitable: 4 hours Active CPU/month and 1M invocations/month are far below 5,000 CPU hours and 30K invocations, and the plan is for non-commercial use.

---

## Quick reference (Vercel pricing)

- [Vercel Pricing](https://vercel.com/pricing)
- [Platform limits](https://vercel.com/docs/platform/limits)
- [Function duration](https://vercel.com/docs/functions/configuring-functions/duration)
