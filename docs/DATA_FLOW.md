# Reelify Data Flow Documentation

## Overview
Reelify is an Arabic video reel generator that processes long-form videos and automatically creates short-form clips optimized for social media platforms (Instagram Reels, TikTok, YouTube Shorts, etc.).

---

## Complete Data Flow Pipeline

### Phase 1: Video Upload & Background Processing

**Step 1.1: User Uploads Video**
- **Location**: `app/page.tsx` - Upload screen
- **Tool**: Browser File API
- **Action**: User selects video file (MP4, MOV, AVI)
- **Validation**: File size limit 100MB
- **Output**: `File` object stored in React state

**Step 1.2: Background Audio Extraction (Parallel Processing)**
- **Location**: `app/page.tsx` - `startBackgroundProcessing()` function
- **Tool**: FFmpeg WASM (`@ffmpeg/ffmpeg`)
- **Process**:
  1. Load FFmpeg WASM library
  2. Write video file to FFmpeg virtual filesystem
  3. Extract audio track using FFmpeg command:
     ```
     -i input.mp4 -vn -ac 1 -ar 16000 -acodec libmp3lame -b:a 24k audio.mp3
     ```
  4. Convert audio to MP3 format (16kHz, mono, 24k bitrate) for smaller file size
- **Output**: Audio Blob (MP3 format)

**Step 1.3: Store Audio in IndexedDB (Client-Side)**
- **Location**: `app/page.tsx` - `startBackgroundProcessing()` function
- **Tool**: IndexedDB (`lib/videoStorage.ts`)
- **Process**:
  1. Create File object from audio Blob
  2. Store audio file in IndexedDB using `storeAudioFile()`
  3. Create blob URL for local access (not uploaded to server)
- **Output**: Audio file stored in IndexedDB, blob URL created locally
- **Storage Details**:
  - **Database**: `reelify-video-storage` (IndexedDB)
  - **Store**: `audio` object store
  - **Purpose**: Persist audio across page navigations, avoid server upload
  - **Cleanup**: Cleared on page/tab close or new upload

---

### Phase 2: User Preferences Collection

**Step 2.1: Preference Form (5 Questions)**
- **Location**: `app/page.tsx` - Form screen
- **Questions**:
  1. **Platform Selection** (Required)
     - Options: Instagram, TikTok, YouTube Shorts, Snapchat, Facebook, LinkedIn
     - Auto-sets recommended duration based on platform
  2. **Preferred Duration** (Required)
     - Options: 30, 45, 60, 75, 90 seconds
     - Default based on selected platform
  3. **Target Audience** (Optional)
     - Pre-defined options or custom text input
     - Can be skipped
  4. **Tone** (Optional)
     - Options: ملهم (Inspiring), تعليمي (Educational), حماسي (Energetic), etc.
     - Can be skipped
  5. **Hook Style** (Optional)
     - Options: سؤال مباشر (Direct Question), رقم قوي (Strong Number), etc.
     - Can be skipped

**Step 2.2: Persist Preferences**
- **Location**: `app/page.tsx` - `persistPreferences()` function
- **Endpoint**: `/api/preferences` (POST)
- **Tool**: File System (`fs/promises`)
- **Process**:
  1. Send preferences to `/api/preferences` endpoint
  2. Server saves to `data/user-preferences.json`
  3. Preferences are merged with existing stored preferences
- **API Details**:
  - **Endpoint**: `POST /api/preferences`
  - **Handler**: `app/api/preferences/route.ts`
  - **Storage**: `lib/qaStore.ts`
  - **File**: `data/user-preferences.json`

---

### Phase 3: Audio Transcription & AI Analysis

**Step 3.1: Initiate Processing**
- **Location**: `app/page.tsx` - `onStartProcessing()` function
- **Trigger**: User clicks "ابدأ التحويل" (Start Conversion)
- **Prerequisites**: 
  - Background processing must be complete (audioUrl available)
  - User preferences collected (or skipped)

**Step 3.2: Call Processing API**
- **Location**: `app/page.tsx` - `onStartProcessing()` function
- **Endpoint**: `/api/process` (POST)
- **Request Format**: FormData (multipart/form-data)
- **Request Body**:
  ```
  FormData:
    - audio: File (MP3 audio file from IndexedDB)
    - preferences: JSON string
      {
        "platform": "instagram",
        "preferredDuration": 45,
        "audience": "شباب 18-30",
        "tone": "ملهم",
        "hookStyle": "سؤال مباشر"
      }
  ```
- **Process**:
  1. Retrieve audio file from IndexedDB using `getAudioFile()`
  2. Create FormData with audio file and preferences JSON
  3. Send POST request to `/api/process`
- **API Details**:
  - **Endpoint**: `POST /api/process`
  - **Handler**: `app/api/process/route.ts`
  - **Runtime**: Node.js
  - **Content-Type**: `multipart/form-data`

**Step 3.3: Save Audio to Temporary File**
- **Location**: `app/api/process/route.ts`
- **Tool**: Node.js File System (`node:fs/promises`)
- **Process**:
  1. Parse FormData to extract audio File
  2. Convert File to Buffer
  3. Create temporary directory (`data/temp-audio/`)
  4. Save audio Buffer to temporary file (`audio-{timestamp}-{random}.mp3`)
  5. Pass file path to ElevenLabs API
  6. Delete temporary file after transcription (in `finally` block)
- **Output**: Temporary audio file path
- **Cleanup**: File automatically deleted after processing

**Step 3.4: Transcribe Audio**
- **Location**: `app/api/process/route.ts` → `lib/elevenlabs.ts` or `lib/geminiAudio.ts`
- **Tool**: ElevenLabs Speech-to-Text API **or** Google Gemini Audio Understanding
- **Provider Selection**: Controlled by the `TRANSCRIPTION_PROVIDER` env var (default: `elevenlabs`). Can also be passed per-request via the `provider` field.

  **Provider A — ElevenLabs (default)**
  - API Endpoint: `https://api.elevenlabs.io/v1/speech-to-text`
  - Process:
    1. Convert audio Buffer to Blob and create FormData
    2. Send POST request with model `scribe_v2` and `timestamps_granularity: word`
    3. Parse word-level timestamps into segments

  **Provider B — Gemini**
  - Uses the Gemini audio understanding capability (`generateContent` with audio data)
  - Process:
    1. For audio <= 15 MB: send inline as base64 data
    2. For audio > 15 MB: upload via Gemini Files API, then reference by URI
    3. Prompt Gemini for a structured JSON transcription with timestamps in seconds
    4. Parse the JSON response into `TranscriptSegment[]`
  - Implementation: `lib/geminiAudio.ts`

- **Output**: `TranscriptSegment[]` array:
  ```typescript
  {
    start: number,  // seconds
    end: number,    // seconds
    text: string    // Arabic text
  }[]
  ```

**Step 3.5: Load User Preferences**
- **Location**: `app/api/process/route.ts`
- **Tool**: File System (`lib/qaStore.ts`)
- **Process**:
  1. Parse preferences from FormData (JSON string)
  2. Load stored preferences from `data/user-preferences.json` in parallel with transcription
  3. Priority: Request preferences override stored preferences (no merging)
  4. If request preferences exist and not empty → use request preferences
  5. Else if stored preferences exist and not empty → use stored preferences
  6. Else → use undefined (no preferences)
- **Output**: `QAPreferences` object or `undefined`

**Step 3.6: Generate Clip Candidates with AI**
- **Location**: `app/api/process/route.ts` → `lib/gemini.ts`
- **Tool**: Google Gemini AI (`@google/generative-ai`)
- **Model**: `gemini-3-flash-preview` (default, configurable via `GEMINI_MODEL` env var)
- **Model Fallback**: If model invalid/unavailable, auto-corrects to available models:
  - `gemini-3-flash-preview` (fastest, default)
  - `gemini-3-pro-preview` (fallback)
  - `gemini-1.5-pro` (fallback)
- **Process**:
  1. Format transcript with timestamps (all segments included, no filtering):
     ```
     [0.00 - 5.23] النص العربي...
     [5.23 - 10.45] المزيد من النص...
     ```
  2. Build prompt with:
     - Transcript with timestamps
     - User preferences (platform, duration, audience, tone, hook style, keyTopics, callToAction)
     - Auto-detect language/dialect from transcript
     - Instructions for selecting clips with score >= 65%
     - Return all clips meeting criteria (no 20-clip limit)
     - Use same language/dialect for titles and tags
  3. Send prompt to Gemini API:
     - `maxOutputTokens: 16384`
     - `temperature: 0.7`
  4. Parse JSON response (with error recovery)
  5. Filter clips: Only clips with `score >= 65` are returned
  6. Validate clip candidates:
     - Valid start/end times
     - Snap timestamps to nearest segment boundaries
- **Output**: `ClipCandidate[]` array (all clips with score >= 65%):
  ```typescript
  {
    title: string,      // Arabic title (same language/dialect as transcript)
    start: number,      // seconds
    end: number,        // seconds
    category: string,   // e.g., "تعليمي", "ترفيهي"
    tags: string[],     // Arabic tags (same language/dialect)
    score: number      // Quality score (0-100)
  }[]
  ```
- **API Details**:
  - **API Key**: `GEMINI_API_KEY` (from env)
  - **Model**: `GEMINI_MODEL` (default: `gemini-3-flash-preview`)
  - **Note**: Platform-specific recommendations are static (not generated by LLM)

**Step 3.7: Return Results**
- **Location**: `app/api/process/route.ts`
- **Response**:
  ```json
  {
    "clips": [
      {
        "title": "...",
        "start": 0,
        "end": 45,
        "category": "...",
        "tags": ["...", "..."]
      }
    ],
    "segments": [
      {
        "start": 0,
        "end": 5.23,
        "text": "..."
      }
    ]
  }
  ```

---

### Phase 4: Video Clip Generation

**Step 4.1: Display Results Immediately**
- **Location**: `app/page.tsx` - `onStartProcessing()` function
- **Process**:
  1. Create `ClipItem[]` array with metadata from candidates
  2. Use original video blob URL (stored in IndexedDB) for all clips
  3. Set thumbnail to empty string initially (generated in background)
  4. Generate transcript text for each clip time range from segments
  5. Display results screen immediately (non-blocking)

**Step 4.2: Generate Thumbnails in Background**
- **Location**: `app/page.tsx` - `generateThumbnailsInParallel()` function
- **Tool**: FFmpeg WASM (client-side)
- **Process**:
  1. Verify input file exists in FFmpeg virtual filesystem
  2. If missing, re-write input file from original video (fixes memory access issues after long API calls)
  3. For each clip candidate, extract thumbnail in parallel:
     ```
     -ss {start} -i input.mp4 -frames:v 1 -q:v 5 -vf "scale=640:-1" thumb.jpg
     ```
  4. Store thumbnails as Blobs in IndexedDB
  5. Create blob URLs for display
  6. Update clips with thumbnail URLs as they're generated
- **Storage**: IndexedDB (`lib/videoStorage.ts`)
  - **Database**: `reelify-video-storage`
  - **Store**: `thumbnails` object store
  - **Key**: `thumb-{start}-{end}`
- **Output**: Thumbnail blob URLs updated in clip objects

**Step 4.3: Cleanup**
- **Location**: `app/page.tsx` - `generateThumbnailsInParallel()` function
- **Process**:
  1. After all thumbnails generated, delete input video file from FFmpeg virtual filesystem
  2. Free memory

---

### Phase 5: Results Display

**Step 5.1: Display Clips**
- **Location**: `app/page.tsx` - Results screen
- **UI Elements**:
  - Thumbnail image (9:16 aspect ratio) - skeleton loader while generating
  - Title, category, tags
  - Duration badge
  - "معاينة وتحميل" (Preview & Download) button
- **Platform Recommendations**: Static recommendations displayed during loading screen
  - Rotates every 4 seconds
  - Platform-specific tips (3-5 sentences per platform)
  - Not generated by LLM (static data)
- **Progress Tracking**: 
  - 0-20%: FFmpeg processing (load, write input, extract audio)
  - 20-92%: API call (transcription + Gemini analysis)
  - 92-100%: Final processing and results display

**Step 5.2: Preview & Download**
- **Location**: `app/preview/page.tsx`
- **Process**: User clicks preview button → navigates to preview page
- **Features**: Video player with editing capabilities (caption editor, timeline, etc.)

---

## API Endpoints Summary

### 1. `/api/upload` (POST)
- **Purpose**: Upload files to Vercel Blob Storage
- **Handler**: `app/api/upload/route.ts`
- **Tool**: `@vercel/blob/client`
- **Allowed Types**: audio/wav, audio/mpeg, video/mp4, video/quicktime, image/jpeg
- **Max Size**: 100MB
- **Returns**: Blob URL

### 2. `/api/preferences` (GET/POST)
- **Purpose**: Get/save user preferences
- **Handler**: `app/api/preferences/route.ts`
- **Storage**: `data/user-preferences.json`
- **GET**: Returns current preferences
- **POST**: Saves preferences (merges with existing)

### 3. `/api/process` (POST)
- **Purpose**: Main processing pipeline (transcription + AI analysis)
- **Handler**: `app/api/process/route.ts`
- **Request Format**: FormData (multipart/form-data)
- **Request Body**:
  ```
  FormData:
    - audio: File (MP3 audio file)
    - preferences: JSON string
      {
        "platform": "string",
        "preferredDuration": number,
        "audience": "string",
        "tone": "string",
        "hookStyle": "string"
      }
  ```
- **Response**:
  ```json
  {
    "clips": ClipCandidate[],
    "segments": TranscriptSegment[]
  }
  ```
- **External APIs Used**:
  - ElevenLabs Speech-to-Text API (scribe_v2 model) — when `TRANSCRIPTION_PROVIDER=elevenlabs`
  - Google Gemini Audio Understanding — when `TRANSCRIPTION_PROVIDER=gemini`
  - Google Gemini AI API (gemini-3-flash-preview model) — for clip generation
- **Temporary Files**: Audio saved to `data/temp-audio/` and deleted after processing

---

## Tools & Technologies Used

### Client-Side
1. **FFmpeg WASM** (`@ffmpeg/ffmpeg`)
   - Video processing (audio extraction, clipping, thumbnail generation)
   - Runs entirely in browser
   - Audio format: MP3 (16kHz, mono, 24k bitrate)

2. **IndexedDB** (`lib/videoStorage.ts`)
   - Client-side persistent storage for video, audio, and thumbnails
   - Database: `reelify-video-storage`
   - Stores: Video files, audio files, thumbnail blobs
   - Purpose: Persist data across page navigations, avoid server uploads
   - Cleanup: Cleared on page/tab close or new upload

3. **React** (`react`)
   - UI framework and state management
   - Progress tracking (0-100%)
   - Static platform recommendations display

### Server-Side
1. **ElevenLabs API**
   - Speech-to-text transcription
   - Word-level timestamps
   - Arabic language support

2. **Google Gemini AI** (`@google/generative-ai`)
   - Content analysis
   - Clip candidate generation
   - Natural language understanding

3. **Node.js File System** (`node:fs/promises`)
   - Temporary file management (`data/temp-audio/`)
   - Preferences storage (`data/user-preferences.json`)
   - Temporary files automatically cleaned up after processing

---

## Data Flow Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS VIDEO                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              BACKGROUND PROCESSING (Parallel)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. FFmpeg WASM extracts audio from video                │  │
│  │ 2. Convert to MP3 (16kHz, mono, 24k bitrate)          │  │
│  │ 3. Store audio in IndexedDB (client-side)             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              USER FILLS PREFERENCES FORM (5 Questions)          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Platform (Required)                                   │  │
│  │ • Duration (Required)                                   │  │
│  │ • Audience (Optional)                                    │  │
│  │ • Tone (Optional)                                        │  │
│  │ • Hook Style (Optional)                                   │  │
│  │                                                           │  │
│  │ Preferences saved to /api/preferences                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    USER CLICKS "START PROCESSING"               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POST /api/process                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Request: FormData { audio: File, preferences: JSON }    │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              SAVE AUDIO TO TEMPORARY FILE                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Parse FormData to extract audio File                  │  │
│  │ • Convert to Buffer                                      │  │
│  │ • Save to temp file (data/temp-audio/audio-*.mp3)      │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              TRANSCRIBE AUDIO (ElevenLabs API)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • POST to api.elevenlabs.io/v1/speech-to-text           │  │
│  │ • Model: scribe_v2                                      │  │
│  │ • Returns: word-level timestamps                        │  │
│  │ • Return all segments (no filtering)                   │  │
│  │ • Output: TranscriptSegment[]                           │  │
│  │ • Delete temp file after transcription                 │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              LOAD USER PREFERENCES                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Merge request preferences with stored preferences      │  │
│  │ • Load from data/user-preferences.json                   │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              GENERATE CLIP CANDIDATES (Gemini AI)                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Format transcript with timestamps (all segments)      │  │
│  │ • Build prompt with preferences                          │  │
│  │ • Auto-detect language/dialect                          │  │
│  │ • POST to Gemini API (gemini-3-flash-preview)          │  │
│  │ • Parse JSON response                                    │  │
│  │ • Filter clips: score >= 65%                            │  │
│  │ • Return all qualifying clips (no limit)                │  │
│  │ • Snap timestamps to segment boundaries                  │  │
│  │ • Output: ClipCandidate[] (all clips with score >= 65) │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              RETURN RESULTS TO CLIENT                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Response: { clips: ClipCandidate[], segments: [] }       │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              CLIENT-SIDE PROCESSING                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Display results immediately (no waiting)             │  │
│  │ 2. Generate thumbnails in background (parallel)         │  │
│  │    • Verify input file in FFmpeg filesystem             │  │
│  │    • Re-write if missing (fixes memory issues)         │  │
│  │    • Extract thumbnails for all clips                   │  │
│  │    • Store in IndexedDB                                 │  │
│  │    • Update clips with thumbnail URLs                   │  │
│  │ 3. Use original video URL from IndexedDB                │  │
│  │ 4. Cleanup FFmpeg files after thumbnails                │  │
│  └────────────────────────────┬──────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DISPLAY RESULTS                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Show clip thumbnails                                   │  │
│  │ • Display titles, categories, tags                       │  │
│  │ • "Preview & Download" buttons                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

- `ELEVENLABS_API_KEY`: API key for ElevenLabs Speech-to-Text
- `ELEVENLABS_STT_MODEL`: ElevenLabs STT model (default: `scribe_v2`)
- `GEMINI_API_KEY`: API key for Google Gemini AI
- `GEMINI_MODEL`: Gemini model name (default: `gemini-3-flash-preview`)
- `TRANSCRIPTION_PROVIDER`: Transcription provider — `elevenlabs` (default) or `gemini`

---

## Key Files

- **Frontend**: `app/page.tsx` (main UI and orchestration)
- **Processing API**: `app/api/process/route.ts` (main processing endpoint)
- **Upload API**: `app/api/upload/route.ts` (file upload handler)
- **Preferences API**: `app/api/preferences/route.ts` (preferences storage)
- **Transcription (ElevenLabs)**: `lib/elevenlabs.ts` (ElevenLabs integration)
- **Transcription (Gemini)**: `lib/geminiAudio.ts` (Gemini audio understanding)
- **AI Analysis**: `lib/gemini.ts` (Gemini AI integration)
- **Video Processing**: `lib/ffmpegWasm.ts` (FFmpeg WASM wrapper)
- **Client Storage**: `lib/videoStorage.ts` (IndexedDB for video, audio, thumbnails)
- **Preferences Storage**: `lib/qaStore.ts` (file-based preferences)

---

## Performance Optimizations

1. **Background Processing**: Audio extraction happens while user fills form
2. **Client-Side Storage**: Audio, video, and thumbnails stored in IndexedDB (no server uploads)
3. **MP3 Compression**: Audio compressed to 24k bitrate (smaller file size)
4. **Parallel Operations**: 
   - Preferences loading parallel with transcription
   - Thumbnail generation in parallel for all clips
5. **Temporary File Cleanup**: Audio files deleted after processing
6. **Memory Management**: FFmpeg files deleted after use
7. **Progress Tracking**: Detailed progress updates (0-100%) for better UX
8. **Fast Model Selection**: Uses `gemini-3-flash-preview` (fastest available model)
9. **Static Recommendations**: Platform recommendations are static (no LLM overhead)
10. **FFmpeg Memory Fix**: Verifies and re-writes input file before thumbnail generation
