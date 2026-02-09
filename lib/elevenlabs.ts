import { readFile } from "node:fs/promises";

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type ElevenLabsWord = {
  start?: number;
  end?: number;
  text?: string;
  word?: string;
  start_time?: number;
  end_time?: number;
};

const API_URL = "https://api.elevenlabs.io/v1/speech-to-text";

const normalizeTime = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return value > 1000 ? value / 1000 : value;
};

const buildSegmentsFromWords = (words: ElevenLabsWord[]): TranscriptSegment[] => {
  const segments: TranscriptSegment[] = [];
  let currentWords: string[] = [];
  let segmentStart = 0;
  let segmentEnd = 0;

  const pushSegment = () => {
    if (currentWords.length === 0) return;
    segments.push({
      start: segmentStart,
      end: segmentEnd,
      text: currentWords.join(" ").trim(),
    });
    currentWords = [];
  };

  words.forEach((word, index) => {
    const wordText = (word.text ?? word.word ?? "").trim();
    const start = normalizeTime(word.start ?? word.start_time);
    const end = normalizeTime(word.end ?? word.end_time);

    if (currentWords.length === 0) {
      segmentStart = start;
    }

    if (wordText) {
      currentWords.push(wordText);
      segmentEnd = end || segmentEnd;
    }

    const shouldSplit = currentWords.length >= 12 || index === words.length - 1;
    if (shouldSplit) {
      pushSegment();
    }
  });

  return segments;
};

// Transcribe audio from Buffer (no file system needed)
export async function transcribeAudioFromBuffer(audioBuffer: Buffer): Promise<TranscriptSegment[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  const fileSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);

  // Use scribe_v2 for faster transcription (newer and faster than scribe_v1)
  // Available models: scribe_v1, scribe_v1_experimental, scribe_v2
  const modelId = process.env.ELEVENLABS_STT_MODEL || "scribe_v2";
  console.log(`[ElevenLabs] Using model: ${modelId}`);

  // Create FormData compatible with fetch API
  // Convert Buffer to Uint8Array then to Blob for FormData
  // Buffer is a subclass of Uint8Array, but we need to ensure compatibility
  const uint8Array = Uint8Array.from(audioBuffer);
  const audioBlob = new Blob([uint8Array], { type: "audio/ogg" });
  const formData = new FormData();

  formData.append("model_id", modelId);
  formData.append("timestamps_granularity", "word");
  formData.append("file", audioBlob, "audio.opus");

  const requestStart = Date.now();
  console.log(`[ElevenLabs] Starting transcription request from buffer (${fileSizeMB}MB)`);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  const requestTime = Date.now() - requestStart;
  console.log(`[ElevenLabs] Transcription request completed in ${requestTime}ms`);

  if (!response.ok) {
    const details = await response.text();
    const error = `ElevenLabs STT failed (${response.status}): ${details}`;
    throw new Error(error);
  }

  try {
    const data = await response.json();
    const words: ElevenLabsWord[] = Array.isArray(data?.words)
      ? data.words
      : Array.isArray(data?.word_timestamps)
        ? data.word_timestamps
        : [];

    const segments: TranscriptSegment[] = Array.isArray(data?.segments)
      ? data.segments
          .map((segment: any) => ({
            start: normalizeTime(segment.start),
            end: normalizeTime(segment.end),
            text: String(segment.text ?? "").trim(),
          }))
          .filter((segment: TranscriptSegment) => segment.text)
      : buildSegmentsFromWords(words);

    const filteredSegments = segments.filter((segment) => segment.text);

    return filteredSegments;
  } catch (error) {
    throw error;
  }
}

// Transcribe from local file path (for backward compatibility)
export async function transcribeAudioFromUrl(
  filePath: string,
  originalUrl: string
): Promise<TranscriptSegment[]> {
  // Read file into Buffer and use the buffer-based function
  const audioBuffer = await readFile(filePath);
  return transcribeAudioFromBuffer(audioBuffer);
}

// Keep original function for backward compatibility
// Note: This function now uses transcribeAudioFromUrl which reads the file directly
export async function transcribeAudio(filePath: string): Promise<TranscriptSegment[]> {
  return transcribeAudioFromUrl(filePath, "");
}
