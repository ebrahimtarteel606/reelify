/**
 * Hook for using ElevenLabs transcription service
 *
 * Usage:
 * ```tsx
 * const { transcribe, isLoading, error } = useElevenLabs();
 *
 * const handleTranscribe = async () => {
 *   const result = await transcribe(videoUrl, 'en');
 *   // Use result.segments to create captions
 * };
 * ```
 */

import { useState, useCallback } from "react";
import { ElevenLabsService, ElevenLabsTranscriptionResult } from "@/lib/services/ElevenLabsService";

export function useElevenLabs() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transcribe = useCallback(
    async (
      audioUrl: string,
      language: "ar" | "en" = "en"
    ): Promise<ElevenLabsTranscriptionResult> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await ElevenLabsService.transcribeAudio(audioUrl, language);
        setIsLoading(false);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Transcription failed");
        setError(error);
        setIsLoading(false);
        throw error;
      }
    },
    []
  );

  const textToSpeech = useCallback(
    async (
      text: string,
      voiceId: string = "default",
      language: "ar" | "en" = "en"
    ): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const audioUrl = await ElevenLabsService.textToSpeech(text, voiceId, language);
        setIsLoading(false);
        return audioUrl;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Text-to-speech failed");
        setError(error);
        setIsLoading(false);
        throw error;
      }
    },
    []
  );

  return {
    transcribe,
    textToSpeech,
    isLoading,
    error,
  };
}
