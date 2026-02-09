# Reelify Data Flow - Visual Diagram

## Simplified Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1: UPLOAD & PREP                             │
└─────────────────────────────────────────────────────────────────────────────┘

    User Browser                    Client-Side Processing
    ┌─────────────┐                ┌──────────────────────┐
    │ Upload Video│───────────────▶│  FFmpeg WASM         │
    │   (File)    │                │  • Extract Audio    │
    └─────────────┘                │  • Convert to MP3   │
                                   │  (16kHz, mono, 24k) │
                                   └──────────┬───────────┘
                                              │
                                              ▼
                                   ┌──────────────────────┐
                                   │  IndexedDB Storage    │
                                   │  • Store Video       │
                                   │  • Store Audio        │
                                   │  (Client-side only)  │
                                   └──────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: USER PREFERENCES                               │
└─────────────────────────────────────────────────────────────────────────────┘

    User Browser                    API Endpoint
    ┌─────────────┐                ┌──────────────────────┐
    │ Fill Form   │───────────────▶│ POST /api/preferences│
    │ (5 Q's)     │                └──────────┬───────────┘
    └─────────────┘                           │
                                              ▼
                                   ┌──────────────────────┐
                                   │  File System         │
                                   │  Save to JSON        │
                                   │  data/user-preferences│
                                   └──────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: TRANSCRIPTION & AI ANALYSIS                       │
└─────────────────────────────────────────────────────────────────────────────┘

    User Browser                    Server API
    ┌─────────────┐                ┌──────────────────────┐
    │ Click Start │───────────────▶│ POST /api/process    │
    │ Processing  │                │ FormData:            │
    └─────────────┘                │ • audio: File        │
                                   │ • preferences: JSON  │
                                   └──────────┬───────────┘
                                              │
                                              ▼
                                   ┌──────────────────────┐
                                   │ Save Audio to Temp   │
                                   │ data/temp-audio/     │
                                   │ (MP3 file)           │
                                   └──────────┬───────────┘
                                              │
                                              ▼
                                   ┌──────────────────────┐
                                   │ Transcription        │
                                   │ (Provider Selection) │
                                   │ ┌──────────────────┐ │
                                   │ │ ElevenLabs API   │ │
                                   │ │ • scribe_v2      │ │
                                   │ │ • Word timestamps│ │
                                   │ ├──────────────────┤ │
                                   │ │ Gemini Audio     │ │
                                   │ │ • Inline / Files │ │
                                   │ │ • JSON segments  │ │
                                   │ └──────────────────┘ │
                                   └──────────┬───────────┘
                                              │
                                              ▼ TranscriptSegment[]
                                   ┌──────────────────────┐
                                   │ Google Gemini API    │
                                   │ • Model: gemini-3-   │
                                   │   flash-preview      │
                                   │ • Analyze transcript │
                                   │ • Score >= 65%       │
                                   │ • All qualifying     │
                                   │   clips (no limit)   │
                                   └──────────┬───────────┘
                                              │
                                              ▼ ClipCandidate[]
                                   ┌──────────────────────┐
                                   │ Return to Client     │
                                   │ { clips, segments }  │
                                   └──────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 4: VIDEO CLIP GENERATION                           │
└─────────────────────────────────────────────────────────────────────────────┘

    Client-Side Processing          IndexedDB Storage
    ┌──────────────────────┐        ┌──────────────────────┐
    │ Display Results      │        │                      │
    │ Immediately          │        │                      │
    └──────────┬───────────┘        │                      │
               │                    │                      │
               ▼                    │                      │
    ┌──────────────────────┐        │                      │
    │ Generate Thumbnails  │        │                      │
    │ (Background)         │        │                      │
    │ • Verify FFmpeg file │        │                      │
    │ • Extract thumbs     │────────▶│  IndexedDB          │
    │ • Store in IndexedDB │        │  • Thumbnails       │
    │ • Update clips       │        │  • Video            │
    └──────────────────────┘        │  • Audio            │
                                     │                      │
                                     └──────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 5: RESULTS DISPLAY                             │
└─────────────────────────────────────────────────────────────────────────────┘

    User Browser
    ┌──────────────────────┐
    │ Display Clips        │
    │ • Thumbnails         │
    │ • Titles, Tags       │
    │ • Preview Button     │
    └──────────────────────┘
```

---

## Detailed Tool Usage Per Step

### Step 1: Video Upload

- **Tool**: Browser File API
- **Input**: User-selected video file
- **Output**: File object

### Step 2: Audio Extraction

- **Tool**: FFmpeg WASM (`@ffmpeg/ffmpeg`)
- **Command**: `-i input.mp4 -vn -ac 1 -ar 16000 -acodec libmp3lame -b:a 24k audio.mp3`
- **Input**: Video file
- **Output**: MP3 audio blob (16kHz, mono, 24k bitrate)

### Step 3: Audio Storage

- **Tool**: IndexedDB (`lib/videoStorage.ts`)
- **Database**: `reelify-video-storage`
- **Store**: `audio` object store
- **Input**: Audio File object
- **Output**: Stored in IndexedDB (client-side only, no server upload)

### Step 4: Preferences Collection

- **Tool**: React state management
- **Storage**: `POST /api/preferences` → File System (`data/user-preferences.json`)
- **Input**: User form responses
- **Output**: Preferences object

### Step 5: Processing Request

- **Tool**: Fetch API
- **Endpoint**: `POST /api/process`
- **Format**: FormData (multipart/form-data)
- **Input**: `{ audio: File, preferences: JSON string }`
- **Output**: `{ clips, segments }`

### Step 6: Audio Temporary Storage

- **Tool**: Node.js File System (`node:fs/promises`)
- **Input**: Audio File from FormData
- **Process**: Convert to Buffer, save to `data/temp-audio/audio-*.mp3`
- **Output**: Temporary audio file path
- **Cleanup**: Deleted after transcription

### Step 7: Transcription

- **Provider**: Controlled by `TRANSCRIPTION_PROVIDER` env var (default: `elevenlabs`)
- **Option A — ElevenLabs**:
  - Endpoint: `https://api.elevenlabs.io/v1/speech-to-text`
  - Model: `scribe_v2` (configurable via `ELEVENLABS_STT_MODEL`)
- **Option B — Gemini Audio Understanding**:
  - Inline base64 for files <= 15 MB, Gemini Files API for larger files
  - Implementation: `lib/geminiAudio.ts`
- **Input**: Audio buffer (from temp file or IndexedDB)
- **Output**: `TranscriptSegment[]` with timestamps (all segments, no filtering)

### Step 8: AI Analysis

- **Tool**: Google Gemini AI (`@google/generative-ai`)
- **Model**: `gemini-3-flash-preview` (default, with fallbacks)
- **Input**: Transcript + Preferences
- **Process**:
  - Auto-detect language/dialect
  - Filter clips with score >= 65%
  - Return all qualifying clips (no limit)
- **Output**: `ClipCandidate[]` (all clips with score >= 65, titles/tags in same language/dialect)

### Step 9: Display Results

- **Tool**: React state management
- **Process**:
  - Create ClipItem[] with metadata immediately
  - Use original video URL from IndexedDB
  - Show skeleton loaders for thumbnails
  - Display static platform recommendations during loading
- **Input**: ClipCandidate[] from API
- **Output**: Results screen displayed (non-blocking)

### Step 10: Thumbnail Generation (Background)

- **Tool**: FFmpeg WASM
- **Process**:
  1. Verify input file exists in FFmpeg filesystem
  2. Re-write if missing (fixes memory access issues)
  3. Extract thumbnails in parallel for all clips
- **Command**: `-ss {start} -i input.mp4 -frames:v 1 -q:v 5 -vf "scale=640:-1" thumb.jpg`
- **Input**: Original video + clip timestamps
- **Output**: Thumbnail image blobs

### Step 11: Store Thumbnails

- **Tool**: IndexedDB (`lib/videoStorage.ts`)
- **Database**: `reelify-video-storage`
- **Store**: `thumbnails` object store
- **Key**: `thumb-{start}-{end}`
- **Input**: Thumbnail blobs
- **Output**: Stored in IndexedDB, blob URLs created for display
- **Cleanup**: FFmpeg input file deleted after thumbnails generated

---

## API Endpoints Reference

| Endpoint           | Method | Purpose                  | Tools Used                 |
| ------------------ | ------ | ------------------------ | -------------------------- |
| `/api/preferences` | GET    | Get user preferences     | File System                |
| `/api/preferences` | POST   | Save user preferences    | File System                |
| `/api/process`     | POST   | Main processing pipeline | ElevenLabs API, Gemini API |

---

## External APIs

| Service              | Purpose                                 | Endpoint                              | Authentication                          |
| -------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------- |
| **ElevenLabs**       | Speech-to-Text (provider: `elevenlabs`) | `api.elevenlabs.io/v1/speech-to-text` | `xi-api-key` header                     |
| **ElevenLabs Model** | STT Model                               | `scribe_v2` (default)                 | Configurable via `ELEVENLABS_STT_MODEL` |
| **Gemini Audio**     | Speech-to-Text (provider: `gemini`)     | `generativelanguage.googleapis.com`   | API Key in request                      |
| **Google Gemini**    | AI Analysis (clip generation)           | `generativelanguage.googleapis.com`   | API Key in request                      |
| **Gemini Model**     | AI Model                                | `gemini-3-flash-preview` (default)    | Configurable via `GEMINI_MODEL`         |

---

## Data Types Flow

```
File (Browser)
    ↓
Blob (Audio MP3)
    ↓
IndexedDB Storage (Client-side)
    ↓
File (FormData → Server temp)
    ↓
TranscriptSegment[] (with timestamps)
    ↓
ClipCandidate[] (AI-generated, score >= 65%)
    ↓
ClipItem[] (with original video URL from IndexedDB)
    ↓
Display in UI (thumbnails generated in background)
    ↓
IndexedDB Storage (Thumbnails)
```

---

## Key Decision Points

1. **Background Processing**: Audio extraction happens while user fills form (parallel)
2. **Client-Side Storage**: Audio, video, and thumbnails stored in IndexedDB (no server uploads)
3. **Preference Priority**: Request preferences override stored preferences (no merging)
4. **Clip Filtering**: Only clips with score >= 65% are returned (no duration limit)
5. **Timestamp Snapping**: Clip boundaries snap to nearest transcript segment
6. **Error Recovery**: JSON parsing has fallback mechanisms for Gemini responses
7. **Model Selection**: Auto-corrects invalid Gemini model names to available alternatives
8. **FFmpeg Memory Fix**: Verifies and re-writes input file before thumbnail generation
9. **Static Recommendations**: Platform recommendations are static (not LLM-generated)
10. **Progress Tracking**: Detailed progress updates (0-100%) for better UX
11. **Parallel Operations**: Preferences loading parallel with transcription, thumbnails generated in parallel
