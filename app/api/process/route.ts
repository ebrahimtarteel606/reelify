import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { transcribeAudioFromBuffer } from "../../../lib/elevenlabs";
import { generateClipCandidates, type OutputLanguage } from "../../../lib/gemini";
import { loadPreferences, type QAPreferences } from "../../../lib/qaStore";
import { metrics } from "../../../lib/services/MetricsService";
import { chargeCredits, getUserById } from "../../../lib/supabase";

export const runtime = "nodejs";

// Global maximum video duration: 2 hours (in seconds)
const MAX_VIDEO_DURATION_SECONDS = 2 * 60 * 60; // 7200s

// Accept FormData with audio file (client-side storage)
export async function POST(request: Request) {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  try {
    const startTime = Date.now();
    console.log(`[API] Starting process request (ID: ${requestId})`);

    // Parse FormData
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const preferencesStr = formData.get("preferences") as string | null;
    const userId = formData.get("user_id") as string | null;
    const sourceDurationStr = formData.get("source_duration_seconds") as string | null;

    // Get locale from cookie for output language
    const cookieStore = await cookies();
    const locale = cookieStore.get("NEXT_LOCALE")?.value;
    const outputLanguage: OutputLanguage = locale === "en" ? "en" : "ar";
    console.log(`[API] Output language: ${outputLanguage}`);

    if (!audioFile) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    // ── Credit system enforcement ────────────────────────────
    if (!userId) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const sourceDuration = sourceDurationStr ? Math.ceil(Number(sourceDurationStr)) : 0;
    if (!sourceDuration || sourceDuration <= 0) {
      return NextResponse.json(
        { error: "Missing or invalid source_duration_seconds" },
        { status: 400 }
      );
    }

    // Global max video length check (2 hours)
    if (sourceDuration > MAX_VIDEO_DURATION_SECONDS) {
      return NextResponse.json(
        { error: "Video too long: maximum allowed duration is 2 hours" },
        { status: 400 }
      );
    }

    // Validate user exists
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Unknown user" }, { status: 403 });
    }

    // Atomically check credits + charge
    const chargeResult = await chargeCredits(userId, sourceDuration);
    if (!chargeResult.ok) {
      console.log(`[API] Credit check failed for user ${userId}: ${chargeResult.error}`);
      return NextResponse.json({ error: chargeResult.error }, { status: 403 });
    }
    console.log(
      `[API] Credits charged: ${Math.ceil(
        sourceDuration / 60
      )} min (${sourceDuration}s) for user ${userId}`
    );

    // Parse preferences JSON
    let preferences: QAPreferences | undefined;
    if (preferencesStr) {
      try {
        preferences = JSON.parse(preferencesStr) as QAPreferences;
      } catch {
        // Invalid JSON, will use stored preferences instead
      }
    }

    // Convert File to Buffer (no file system needed!)
    const audioParseStart = Date.now();
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const audioParseTime = Date.now() - audioParseStart;
    const audioSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`[API] Audio received: ${audioSizeMB}MB (parse: ${audioParseTime}ms)`);

    // Load preferences in parallel with transcription (optimization)
    const preferencesPromise = (async () => {
      const stored = await loadPreferences();
      let mergedPreferences: QAPreferences | undefined;
      if (preferences && Object.keys(preferences).length > 0) {
        mergedPreferences = preferences;
      } else if (stored && Object.keys(stored).length > 0) {
        mergedPreferences = stored;
      } else {
        mergedPreferences = undefined;
      }
      return mergedPreferences;
    })();

    // Transcribe directly from Buffer (no temp file needed!)
    const transcriptionStart = Date.now();
    const segments = await transcribeAudioFromBuffer(audioBuffer);
    const transcriptionTime = Date.now() - transcriptionStart;
    const audioBenchmark = {
      parseMs: audioParseTime,
      transcribeMs: transcriptionTime,
      sizeMB: parseFloat(audioSizeMB),
      segments: segments.length,
    };
    console.log(
      `[API] Audio benchmark: parse=${audioBenchmark.parseMs}ms, transcribe=${audioBenchmark.transcribeMs}ms, size=${audioBenchmark.sizeMB}MB, segments=${audioBenchmark.segments}`
    );
    console.log(`[API] Transcription: ${transcriptionTime}ms (${segments.length} segments)`);

    if (segments.length === 0) {
      return NextResponse.json({ error: "Transcript was empty" }, { status: 400 });
    }

    // Get preferences (already loaded in parallel)
    const mergedPreferences = await preferencesPromise;
    console.log("[API] Preferences:", mergedPreferences);

    const geminiStart = Date.now();
    const { clips: clipCandidates, tokenUsage } = await generateClipCandidates(
      segments,
      mergedPreferences,
      outputLanguage
    );
    const geminiTime = Date.now() - geminiStart;
    console.log(`[API] Gemini analysis: ${geminiTime}ms (${clipCandidates.length} clips)`);

    // Calculate audio character count from transcription segments
    const audioCharacters = segments.reduce((sum, segment) => sum + segment.text.length, 0);

    // Track Gemini request with all required metrics
    if (tokenUsage) {
      await metrics.trackGemini({
        model: tokenUsage.model,
        audio_characters: audioCharacters,
        audio_duration_seconds: sourceDuration,
        tokens_input: tokenUsage.tokens_input,
        tokens_output: tokenUsage.tokens_output,
        cost_usd: tokenUsage.cost_usd,
        request_id: requestId,
      });
    }

    const totalTime = Date.now() - startTime;
    console.log(`[API] Total processing time: ${totalTime}ms`);

    if (clipCandidates.length === 0) {
      return NextResponse.json(
        { error: "Gemini did not return valid clip candidates" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      clips: clipCandidates,
      segments,
      benchmark: { audio: audioBenchmark },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";

    // Log detailed error internally, but do not expose provider/model names to clients
    console.error("[API] /api/process failed:", message);

    // ElevenLabs (or similar) quota exceeded – return 503 with code for client to show a clear message
    const isQuotaExceeded =
      typeof message === "string" &&
      (message.includes("quota_exceeded") || message.toLowerCase().includes("exceeds your api key"));
    if (isQuotaExceeded) {
      return NextResponse.json(
        {
          error: "Transcription service quota exceeded. Please try again later.",
          code: "TRANSCRIPTION_QUOTA_EXCEEDED",
        },
        { status: 503 }
      );
    }

    // For all other failures, return a generic message that hides internal technologies/models
    return NextResponse.json(
      { error: "Processing failed. Please try again later." },
      { status: 500 }
    );
  }
}
