/**
 * ElevenLabs API Service for transcription and audio processing
 *
 * To use this service, you need to:
 * 1. Get an API key from https://elevenlabs.io
 * 2. Set ELEVENLABS_API_KEY in your environment variables
 */

export interface ElevenLabsTranscriptionSegment {
  text: string;
  start: number; // Timestamp in seconds
  end: number; // Timestamp in seconds
  language: "ar" | "en";
}

export interface ElevenLabsTranscriptionResult {
  segments: ElevenLabsTranscriptionSegment[];
  language: "ar" | "en";
}

export class ElevenLabsService {
  private static readonly API_BASE_URL = "https://api.elevenlabs.io/v1";

  /**
   * Get API key from environment variables
   */
  private static getApiKey(): string {
    if (typeof window !== "undefined") {
      // Client-side: you might want to use a secure method to store this
      // For now, we'll use an environment variable that should be set at build time
      return process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "";
    }
    return process.env.ELEVENLABS_API_KEY || "";
  }

  /**
   * Transcribe audio/video file using backend API
   * This calls our Next.js API route which handles the transcription server-side
   *
   * @param audioUrl URL or file path to the audio/video file
   * @param language Language code ('ar' for Arabic, 'en' for English) - optional for auto-detection
   * @returns Transcription result with segments
   */
  static async transcribeAudio(
    audioUrl: string,
    language?: "ar" | "en"
  ): Promise<ElevenLabsTranscriptionResult> {
    try {
      // Call our backend API route which handles transcription server-side
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl: audioUrl,
          language: language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Transcription failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Data should already be in the correct format from our API
      return {
        segments: data.segments || [],
        language: data.language || "en",
      };
    } catch (error) {
      console.error("Transcription error:", error);

      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Failed to transcribe audio. Please check your setup and try again.");
    }
  }

  /**
   * Detect language from text (simple heuristic)
   */
  private static detectLanguage(text: string): "ar" | "en" {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? "ar" : "en";
  }

  /**
   * Group word-level timestamps into sentence segments
   */
  private static groupWordsIntoSegments(
    words: any[],
    language: "ar" | "en"
  ): ElevenLabsTranscriptionSegment[] {
    const segments: ElevenLabsTranscriptionSegment[] = [];
    let currentSegment: { text: string; start: number; words: any[] } = {
      text: "",
      start: 0,
      words: [],
    };

    const sentenceEnders = /[.!?،؛]/;
    const maxSegmentDuration = 5; // Maximum 5 seconds per segment

    words.forEach((word, index) => {
      const wordText = word.text || word.word || "";
      const wordStart = word.start || word.start_time || 0;
      const wordEnd = word.end || word.end_time || wordStart + 0.5;

      if (currentSegment.words.length === 0) {
        currentSegment.start = wordStart;
      }

      currentSegment.words.push(word);
      currentSegment.text += (currentSegment.text ? " " : "") + wordText;

      const duration = wordEnd - currentSegment.start;
      const endsWithPunctuation = sentenceEnders.test(wordText);
      const isLastWord = index === words.length - 1;

      if (endsWithPunctuation || duration >= maxSegmentDuration || isLastWord) {
        segments.push({
          text: currentSegment.text.trim(),
          start: currentSegment.start,
          end: wordEnd,
          language: language,
        });

        currentSegment = { text: "", start: 0, words: [] };
      }
    });

    return segments;
  }

  /**
   * Generate speech from text using ElevenLabs TTS
   *
   * @param text Text to convert to speech
   * @param voiceId ElevenLabs voice ID
   * @param language Language code
   * @returns Audio blob URL
   */
  static async textToSpeech(
    text: string,
    voiceId: string = "default",
    language: "ar" | "en" = "en"
  ): Promise<string> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error("ElevenLabs API key not found");
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          language: language,
          model_id: "eleven_multilingual_v2", // Use multilingual model for Arabic support
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(`ElevenLabs TTS error: ${error.message || response.statusText}`);
      }

      const audioBlob = await response.blob();
      return URL.createObjectURL(audioBlob);
    } catch (error) {
      console.error("ElevenLabs TTS error:", error);
      throw error instanceof Error ? error : new Error("Failed to generate speech with ElevenLabs");
    }
  }

  /**
   * Get available voices from ElevenLabs
   */
  static async getVoices(): Promise<any[]> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error("ElevenLabs API key not found");
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/voices`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.statusText}`);
      }

      const data = await response.json();
      return data.voices || [];
    } catch (error) {
      console.error("Error fetching ElevenLabs voices:", error);
      throw error instanceof Error ? error : new Error("Failed to fetch voices from ElevenLabs");
    }
  }
}
