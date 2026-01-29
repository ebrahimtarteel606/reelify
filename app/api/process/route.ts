import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { transcribeAudioFromBuffer } from "../../../lib/elevenlabs";
import { generateClipCandidates, type OutputLanguage } from "../../../lib/gemini";
import { loadPreferences, type QAPreferences } from "../../../lib/qaStore";

export const runtime = "nodejs";

// Accept FormData with audio file (client-side storage)
export async function POST(request: Request) {
  try {
    const startTime = Date.now();
    console.log("[API] Starting process request");

    // Parse FormData
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const preferencesStr = formData.get("preferences") as string | null;

    // Get locale from cookie for output language
    const cookieStore = await cookies();
    const locale = cookieStore.get("NEXT_LOCALE")?.value;
    const outputLanguage: OutputLanguage = locale === "en" ? "en" : "ar";
    console.log(`[API] Output language: ${outputLanguage}`);

    if (!audioFile) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

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
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const audioSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`[API] Audio received: ${audioSizeMB}MB`);

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
    console.log(`[API] Transcription: ${transcriptionTime}ms (${segments.length} segments)`);
    
    if (segments.length === 0) {
      return NextResponse.json(
        { error: "Transcript was empty" },
        { status: 400 },
      );
    }

    // Get preferences (already loaded in parallel)
    const mergedPreferences = await preferencesPromise;
    console.log("[API] Preferences:", mergedPreferences);
    
    const geminiStart = Date.now();
    const clipCandidates = await generateClipCandidates(
      segments,
      mergedPreferences,
      outputLanguage,
    );
    const geminiTime = Date.now() - geminiStart;
    console.log(`[API] Gemini analysis: ${geminiTime}ms (${clipCandidates.length} clips)`);
    
    const totalTime = Date.now() - startTime;
    console.log(`[API] Total processing time: ${totalTime}ms`);
    if (clipCandidates.length === 0) {
      return NextResponse.json(
        { error: "Gemini did not return valid clip candidates" },
        { status: 400 },
      );
    }
    return NextResponse.json({ clips: clipCandidates, segments });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Processing failed";
    const clientErrorMessages = [
      "Missing ELEVENLABS_API_KEY",
      "Missing GEMINI_API_KEY",
      "Missing audio file",
    ];
    const status = clientErrorMessages.includes(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
