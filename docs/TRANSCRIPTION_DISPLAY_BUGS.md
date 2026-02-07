# Transcription Display Bugs

Two bugs are preventing transcription segments from showing in the Preview and Editor screens. They were identified by analyzing two sample outputs (see `samples.json`).

---

## Bug 1: `normalizeTime` corrupts timestamps beyond 1000 seconds

### File
`lib/elevenlabs.ts` — line 21

### The problem
```typescript
const normalizeTime = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value > 1000 ? value / 1000 : value;   // <-- THIS LINE
};
```

ElevenLabs `scribe_v2` returns timestamps **in seconds**. The function incorrectly assumes values > 1000 are milliseconds and divides them by 1000. For a 77-minute video (~4632 s) every timestamp after the 1000-second mark is destroyed.

### Proof (from `samples.json`, Sample 1)

The exact segment where it breaks:
```
"start": 999.127,        ← correct (< 1000, untouched)
"end":   1.001397,        ← WRONG — should be 1001.397 (÷ 1000)
```

After this point every timestamp is compressed into the 1.0–4.6 range. That's why:

- Clips whose `start` < 1000 s (e.g. 447 s) → `preview: true`, `editor: "first 1000 seconds"` — segments match the reel time range.
- Clips whose `start` > 1000 s (e.g. 3822 s) → `preview: false`, `editor: false` — no segment timestamps anywhere near 3822 s exist anymore.

### Fix
Remove the division. The value is already in seconds:
```typescript
const normalizeTime = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;   // scribe_v2 returns seconds — no conversion needed
};
```

### Important
All previously processed videos have corrupted timestamps baked into `sessionStorage` / `localStorage`. After deploying the fix the video **must be re-processed from scratch** (upload → transcribe → generate clips) to get correct data.

---

## Bug 2: Segments not reaching the Preview / Editor pages (Sample 2 — Arabic, short video)

This is independent of Bug 1 (the video is only ~270 s, so `normalizeTime` isn't the culprit). Transcriptions are missing on **both** Preview and Editor screens.

### Root causes

#### 2a. `window.open` with `noopener` blocks `sessionStorage` inheritance

**File:** `app/[locale]/page.tsx` — the `handlePreviewClick` handler (~line 1846)

```typescript
window.open(previewUrl, "_blank", "noopener,noreferrer");
```

`noopener` means the new tab does **not** share the opener's `sessionStorage`. The code does also write to `localStorage`, but if that write fails silently (quota exceeded, private browsing, etc.) the new tab finds nothing.

**Fix:** change to `"noreferrer"` only (drop `noopener`), and verify the `localStorage` write succeeded:

```typescript
window.open(previewUrl, "_blank", "noreferrer");
```

#### 2b. `useMemo` reads storage too early (SSR/hydration timing)

**Files:**
- `app/[locale]/preview/page.tsx` — `fullTranscriptSegments` memo (~line 148)
- `app/[locale]/editor/page.tsx` — `clipData` memo (~line 161)

Both memos read `sessionStorage` / `localStorage` inside `useMemo`, but:
- During SSR, `window` is `undefined` → returns `null`
- The dependency arrays only include URL params (`startTimeParam`, `endTimeParam`), which don't change between SSR and hydration, so the memo **never re-runs on the client**.

**Fix:** Add a `storageReady` state that flips to `true` in a `useEffect` (client-only), and include it in the memo's dependency array:

```typescript
const [storageReady, setStorageReady] = useState(false);
useEffect(() => { setStorageReady(true); }, []);

const fullTranscriptSegments = useMemo(() => {
  if (!storageReady) return null;
  // ... existing logic ...
}, [startTimeParam, endTimeParam, storageReady]);
```

Apply the same pattern to the editor's `clipData` memo.

---

## Full data flow (for context)

```
Upload page ──(audio)──▸ /api/process
                            │
                     ElevenLabs scribe_v2
                            │
                     returns { segments, clips }
                            │
                     ▼──────┴──────▼
             sessionStorage      localStorage
            "reelify_segments"  "reelify_segments"
                     │               │
        ┌────────────┘               └──────────────┐
        ▼                                           ▼
   Preview page                                Editor page
   (new tab via window.open)                   (router.push)
        │                                           │
   reads sessionStorage → localStorage         reads sessionStorage → localStorage
        │                                           │
   fullTranscriptSegments (useMemo)            clipData (useMemo)
        │                                           │
   renders full transcript                     passes to ReelEditor
   with highlighted reel range                      │
                                               Zustand store (setCurrentClip)
                                                    │
                                               creates captions from segments
                                                    │
                                               TranscriptionEditor displays text
```

### Key storage locations
| Key | Contents |
|-----|----------|
| `reelify_segments` (session + local) | Full transcription `[{ text, start, end }]` |
| `reelify_clips` (session) | Clip candidates from Gemini |
| `reelify_video_url` (session) | Original video URL |

### Key files to look at
| File | Role |
|------|------|
| `lib/elevenlabs.ts` | Transcription + `normalizeTime` |
| `app/[locale]/page.tsx` | Home page, storage writes, `window.open` |
| `app/[locale]/preview/page.tsx` | Preview, `fullTranscriptSegments` memo |
| `app/[locale]/editor/page.tsx` | Editor, `clipData` memo |
| `components/reel-editor/TranscriptionEditor.tsx` | Text display in editor |
| `lib/store/useReelEditorStore.ts` | Zustand store, `setCurrentClip`, `setTrimPoints` |

---

## How to test

1. Clear all site data (DevTools → Application → Storage → Clear site data)
2. Close all Reelify tabs
3. Restart the dev server (`npm run dev`)
4. Upload a **long video** (> 17 min) to verify Bug 1 fix — clips after the 1000 s mark should now show transcription
5. Upload a **short Arabic video** to verify Bug 2 fix — transcription should appear in both Preview and Editor
6. Check that Preview (new tab) has segments in `localStorage` (DevTools → Application → Local Storage)
