import { readFile } from "fs/promises";
import path from "path";

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
      text: currentWords.join(" ").trim()
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

export async function transcribeAudio(filePath: string): Promise<TranscriptSegment[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  const fileBuffer = await readFile(filePath);
  const fileBlob = new Blob([fileBuffer]);
  const formData = new FormData();
  formData.append("model_id", "scribe_v1");
  formData.append("timestamps_granularity", "word");
  formData.append("file", fileBlob, path.basename(filePath));

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey
    },
    body: formData
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ElevenLabs STT failed: ${details}`);
  }

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
          text: String(segment.text ?? "").trim()
        }))
        .filter((segment) => segment.text)
    : buildSegmentsFromWords(words);

  return segments.filter((segment) => segment.text);
}
