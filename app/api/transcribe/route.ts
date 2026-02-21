import { NextRequest, NextResponse } from "next/server";
import { getAvailableApiKey, markKeyExhausted } from "../../../lib/elevenlabs-keys";

/** Max retries when a key is exhausted mid-request */
const MAX_KEY_RETRIES = 5;

export async function POST(request: NextRequest) {
  try {
    const { videoUrl } = await request.json();

    if (!videoUrl) {
      return NextResponse.json({ error: "Video URL is required" }, { status: 400 });
    }

    // Fetch the video file once (reused across retries)
    console.log("Fetching video from:", videoUrl);
    const videoResponse = await fetch(videoUrl);

    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
    }

    const videoBlob = await videoResponse.blob();
    console.log("Video fetched, size:", videoBlob.size, "bytes");

    // Retry loop: try different API keys if one is exhausted mid-request
    let lastError = "";
    for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
      // Get an API key that hasn't been marked exhausted (rotates across multiple keys)
      const apiKey = getAvailableApiKey();

      // Create FormData for ElevenLabs Speech-to-Text API (Scribe v2)
      const formData = new FormData();
      formData.append("file", videoBlob, "video.mp4");
      formData.append("model_id", "scribe_v2");

      console.log(
        `Calling ElevenLabs Speech-to-Text API (Scribe v2)…${attempt > 0 ? ` (retry #${attempt})` : ""}`
      );

      const transcriptionResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error("ElevenLabs API error:", transcriptionResponse.status, errorText);

        // If quota/auth error, mark key exhausted and try next key
        if (
          transcriptionResponse.status === 401 ||
          transcriptionResponse.status === 403 ||
          transcriptionResponse.status === 429
        ) {
          markKeyExhausted(apiKey);
          lastError = `ElevenLabs API error: ${transcriptionResponse.status}`;
          console.warn(
            `[Transcribe] Key exhausted (${transcriptionResponse.status}). Trying next key…`
          );
          continue; // try next key
        }

        return NextResponse.json(
          {
            error: `ElevenLabs API error: ${transcriptionResponse.status}`,
            details: errorText,
          },
          { status: transcriptionResponse.status }
        );
      }

      // Success – parse and return
      const result = await transcriptionResponse.json();
      console.log("ElevenLabs transcription received");

      // ElevenLabs returns: { text, language_code, language_probability, words: [...] }
      const detectedLanguage = result.language_code === "ar" ? "ar" : "en";

      // Convert word-level timestamps to segments (group by sentences)
      const words = result.words || [];
      const segments = groupWordsIntoSegments(words, detectedLanguage);

      return NextResponse.json({
        segments,
        language: detectedLanguage,
      });
    }

    // If we exhausted all retries, return the last error
    return NextResponse.json(
      { error: lastError || "All ElevenLabs API keys are exhausted" },
      { status: 503 }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      {
        error: "Failed to transcribe video",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Word-level timestamp for karaoke
export type SegmentWord = { text: string; start: number; end: number };

// Group word-level timestamps into sentence segments; include words for karaoke
function groupWordsIntoSegments(
  words: any[],
  language: "ar" | "en"
): Array<{
  text: string;
  start: number;
  end: number;
  language: "ar" | "en";
  words?: SegmentWord[];
}> {
  if (!words || words.length === 0) {
    return [];
  }

  const segments: Array<{
    text: string;
    start: number;
    end: number;
    language: "ar" | "en";
    words?: SegmentWord[];
  }> = [];
  let currentSegment: { words: any[]; text: string; start: number } = {
    words: [],
    text: "",
    start: 0,
  };

  const sentenceEnders = /[.!?،؛]/;
  const maxSegmentDuration = 5;
  const maxWords = 15;

  words.forEach((word, index) => {
    const wordText = word.text || "";
    const wordStart = word.start || 0;
    const wordEnd = word.end || wordStart + 0.5;

    if (currentSegment.words.length === 0) {
      currentSegment.start = wordStart;
    }

    currentSegment.words.push(word);
    currentSegment.text += (currentSegment.text ? " " : "") + wordText;

    const duration = wordEnd - currentSegment.start;
    const endsWithPunctuation = sentenceEnders.test(wordText);
    const isLastWord = index === words.length - 1;
    const tooManyWords = currentSegment.words.length >= maxWords;

    if (endsWithPunctuation || duration >= maxSegmentDuration || tooManyWords || isLastWord) {
      const segmentWords: SegmentWord[] = currentSegment.words.map((w: any) => ({
        text: w.text || "",
        start: w.start ?? 0,
        end: w.end ?? w.start + 0.5,
      }));
      segments.push({
        text: currentSegment.text.trim(),
        start: currentSegment.start,
        end: wordEnd,
        language: language,
        words: segmentWords,
      });

      currentSegment = { words: [], text: "", start: 0 };
    }
  });

  return segments;
}
