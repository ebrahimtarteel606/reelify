import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TranscriptSegment } from "./elevenlabs";
import type { QAPreferences } from "./qaStore";

export type ClipCandidate = {
  title: string;
  start: number;
  end: number;
  category: string;
  tags: string[];
  score?: number; // Quality score from 0-100
};

// Supported output languages for titles/tags
export type OutputLanguage = "ar" | "en";

const cleanJsonText = (raw: string) => {
  return raw
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
};

const extractJsonChunk = (text: string) => {
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1);
  }
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1);
  }
  return text;
};

const attemptJsonRepair = (text: string) => {
  let repaired = text.trim();
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  repaired = repaired.replace(/(\w+)\s*:/g, "\"$1\":");
  return repaired;
};

const parseGeminiJson = (raw: string): ClipCandidate[] => {
  const cleaned = cleanJsonText(raw);
  const extracted = extractJsonChunk(cleaned);

  const tryParse = (value: string) => {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.clips)) {
      return parsed.clips;
    }
    return [];
  };

  try {
    return tryParse(extracted);
  } catch {
    try {
      return tryParse(attemptJsonRepair(extracted));
    } catch {
      return [];
    }
  }
};

export async function generateClipCandidates(
  segments: TranscriptSegment[],
  preferences?: QAPreferences,
  outputLanguage: OutputLanguage = "ar"
): Promise<ClipCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  // Use gemini-3-flash-preview as default (fastest and working model)
  // Available models (2025): gemini-3-flash-preview, gemini-3-pro-preview, gemini-1.5-pro
  // Note: gemini-pro, gemini-2.5-flash, and gemini-1.5-flash are not available
  let modelName = process.env.GEMINI_MODEL;
  
  // Fix invalid model names - map to available alternatives
  if (!modelName || modelName === "gemini-2.5-flash" || modelName === "gemini-pro" || modelName === "gemini-1.5-flash") {
    // Default to gemini-3-flash-preview (fastest and working)
    modelName = "gemini-3-flash-preview";
    console.log(`[Gemini] Using default model: ${modelName} (fastest available)`);
  }
  
  console.log(`[Gemini] Using model: ${modelName}`);
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelName });

  // Use all segments - don't filter anything from transcription
  const transcript = segments
    .map(
      (segment) =>
        `[${segment.start.toFixed(2)} - ${segment.end.toFixed(2)}] ${segment.text}`
    )
    .join("\n");

  // Language-specific preference labels
  const preferenceLabels = outputLanguage === "en" 
    ? {
        platform: "Target platform",
        duration: "Preferred duration",
        audience: "Target audience",
        tone: "Content tone",
        hookStyle: "Hook style",
        keyTopics: "Key topics",
        callToAction: "Call to action",
        seconds: "seconds"
      }
    : {
        platform: "المنصة المستهدفة",
        duration: "المدة المفضلة",
        audience: "الجمهور المستهدف",
        tone: "نبرة المحتوى",
        hookStyle: "أسلوب الخطّاف",
        keyTopics: "محاور رئيسية",
        callToAction: "دعوة للفعل",
        seconds: "ثانية"
      };

  const preferenceLines = [
    preferences?.platform ? `${preferenceLabels.platform}: ${preferences.platform}` : null,
    Number.isFinite(preferences?.preferredDuration)
      ? `${preferenceLabels.duration}: ${preferences?.preferredDuration} ${preferenceLabels.seconds}`
      : null,
    preferences?.audience ? `${preferenceLabels.audience}: ${preferences.audience}` : null,
    preferences?.tone ? `${preferenceLabels.tone}: ${preferences.tone}` : null,
    preferences?.hookStyle ? `${preferenceLabels.hookStyle}: ${preferences.hookStyle}` : null,
    preferences?.keyTopics ? `${preferenceLabels.keyTopics}: ${preferences.keyTopics}` : null,
    preferences?.callToAction ? `${preferenceLabels.callToAction}: ${preferences.callToAction}` : null
  ].filter(Boolean);

  const userPreferencesLabel = outputLanguage === "en" ? "User preferences" : "تفضيلات المستخدم";
  const preferenceBlock =
    preferenceLines.length > 0
      ? `\n${userPreferencesLabel}:\n${preferenceLines.join("\n")}\n`
      : "";

  // Get platform-specific recommendations
  const platformRecommendations: Record<string, string> = {
    instagram: "Instagram Reels: Focus on visually engaging moments, trending audio compatibility, and strong first 3 seconds. Prefer 15-30 second hooks. Use hashtags relevant to Instagram trends.",
    tiktok: "TikTok: Prioritize viral potential, trending topics, and authentic moments. Strong hooks are critical. Prefer 15-60 second clips. Consider TikTok's algorithm preferences for engagement.",
    youtube: "YouTube Shorts: Focus on educational value, clear takeaways, and strong CTA. Prefer 30-60 second clips. Ensure content is suitable for YouTube's broader audience.",
    snapchat: "Snapchat Spotlight: Prioritize quick, attention-grabbing moments. Prefer 15-30 second clips. Focus on authentic, raw content that resonates with younger audiences.",
    facebook: "Facebook Reels: Focus on community engagement and shareable content. Prefer 30-60 second clips. Consider Facebook's diverse age demographics.",
    linkedin: "LinkedIn: Prioritize professional value, insights, and thought leadership. Prefer 30-90 second clips. Focus on educational or inspirational content suitable for professional networks."
  };

  const platform = preferences?.platform || "instagram";
  const platformRec = platformRecommendations[platform] || platformRecommendations.instagram;

  // Language-specific instructions for titles and tags
  const outputLangInstructions = outputLanguage === "en"
    ? `
OUTPUT LANGUAGE: English
- Generate ALL titles, tags, and categories in ENGLISH.
- Even if the transcript is in Arabic or another language, the output MUST be in English.
- Use catchy, engaging English titles optimized for ${platform}.
- Tags should be English keywords relevant to ${platform} discovery.
`
    : `
OUTPUT LANGUAGE: Arabic
- Generate ALL titles, tags, and categories in ARABIC.
- Use SAME dialect/accent style as the transcript (e.g., Egyptian, Gulf, Levantine).
- Keep titles natural, catchy, and reel-style optimized for ${platform}.
- Do not translate or normalize style - match the speaker's dialect.
`;

  // Optimized prompt asking for as many clips as possible with scores >= 65
  const prompt = `
You are a professional short-form video editor specializing in ${platform} content.
The following text is a timestamped transcript. Auto-detect its language AND dialect/accent style. Extract highlight segments of 30–90 seconds and rank best → worst.

PLATFORM-SPECIFIC RECOMMENDATIONS:
${platformRec}
${outputLangInstructions}

Return ONLY valid JSON — no explanations.
Format:
[{"title":"...","start":0,"end":0,"category":"...","tags":["..."],"score":75}]

CRITICAL: Return ALL viable segments with score >= 65. Do NOT limit the number.
Extract EVERY segment from the transcript that meets the quality threshold (score >= 65).
There is NO maximum limit - return as many as you find.
Sort descending by quality (best first, worst last).

Selection priority:
1) Strong hook in first 3–5 seconds (critical for ${platform}).
2) Clean sentence boundaries.
3) Clear value/payoff.
4) Smooth flow.
5) ${platform}-specific engagement factors.

Scoring:
- Score 0–100.
- Internally rate hook (1–10) - especially important for ${platform}.
- Rank by: hook → overall quality → value → ${platform} optimization.

${preferenceBlock}
Transcript:
${transcript}
  `.trim();

  const geminiStart = Date.now();
  console.log(`[Gemini] Starting clip generation (${segments.length} segments, ${transcript.length} chars)`);
  
  let result;
  let text;
  const fallbackModels = ["gemini-1.5-pro", "gemini-3-flash-preview", "gemini-3-pro-preview"];
  let currentModelName = modelName;
  
  // Configure generation to maximize outputs and speed
  const generationConfig = {
    temperature: 0.5, // Lower temperature for faster, more consistent results
    topP: 0.9,
    topK: 32,
    maxOutputTokens: 16384, // Maximum tokens to allow many clips in response
  };
  
  try {
    result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    text = result.response.text();
  } catch (error: unknown) {
    // If model fails with 404, try fallback models in order
    if (error instanceof Error && (error.message.includes("404") || error.message.includes("not found"))) {
      console.warn(`[Gemini] Model ${currentModelName} not available, trying fallback models...`);
      
      for (const fallbackModelName of fallbackModels) {
        if (currentModelName === fallbackModelName) continue; // Skip if already tried
        try {
          console.log(`[Gemini] Trying fallback model: ${fallbackModelName}`);
          const fallbackClient = new GoogleGenerativeAI(apiKey);
          const fallbackModel = fallbackClient.getGenerativeModel({ model: fallbackModelName });
          result = await fallbackModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig,
          });
          text = result.response.text();
          console.log(`[Gemini] Successfully used fallback model: ${fallbackModelName}`);
          break;
        } catch (fallbackError) {
          console.warn(`[Gemini] Fallback model ${fallbackModelName} also failed, trying next...`);
          continue;
        }
      }
      
      // If all fallbacks failed, throw original error
      if (!text) {
        throw new Error(`All Gemini models failed. Tried: ${currentModelName}, ${fallbackModels.join(", ")}. Error: ${error.message}`);
      }
    } else {
      throw error;
    }
  }
  
  const geminiTime = Date.now() - geminiStart;
  console.log(`[Gemini] Generation completed in ${geminiTime}ms`);
  
  const parsed = parseGeminiJson(text);
  console.log(`[Gemini] Parsed ${parsed.length} clip candidates from response`);
  
  // Log scores if available
  if (parsed.length > 0 && parsed[0].score !== undefined) {
    const scores = parsed.map((c: any) => c.score).filter((s: any) => s !== undefined);
    console.log(`[Gemini] Score range: ${Math.min(...scores)} - ${Math.max(...scores)}`);
  }

  const snapStartToSegment = (time: number) => {
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const seg = segments[i];
      if (seg.start <= time) {
        if (time - seg.start <= 3) {
          return seg.start;
        }
        break;
      }
    }
    return time;
  };

  const snapEndToSegment = (time: number) => {
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      if (seg.end >= time) {
        if (seg.end - time <= 3) {
          return seg.end;
        }
        break;
      }
    }
    return time;
  };

  const defaultCategory = outputLanguage === "en" ? "General" : "عام";
  const normalized = parsed.map((clip) => {
    const rawStart = Number(clip.start);
    const rawEnd = Number(clip.end);
    const start = Number.isFinite(rawStart) ? snapStartToSegment(rawStart) : rawStart;
    const end = Number.isFinite(rawEnd) ? snapEndToSegment(rawEnd) : rawEnd;
    const safeEnd = end > start ? end : rawEnd;
    const score = Number.isFinite(Number(clip.score)) ? Number(clip.score) : undefined;
    return {
      title: String(clip.title ?? "").trim(),
      start,
      end: safeEnd,
      category: String(clip.category ?? defaultCategory).trim(),
      tags: Array.isArray(clip.tags)
        ? clip.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
        : [],
      score
    };
  });

  const isBasicValid = (clip: ClipCandidate) =>
    clip.title &&
    Number.isFinite(clip.start) &&
    Number.isFinite(clip.end) &&
    clip.end > clip.start;

  const isDurationValid = (clip: ClipCandidate) => {
    const duration = clip.end - clip.start;
    return duration >= 30 && duration <= 90;
  };

  const hasGoodScore = (clip: ClipCandidate) => {
    // Filter out clips with score < 65 (if score is provided)
    if (clip.score !== undefined) {
      return clip.score >= 65;
    }
    // If no score provided, include the clip (backward compatibility)
    return true;
  };

  // Filter clips: valid duration, good score (>= 50), and basic validation
  const validClips = normalized.filter(
    (clip) => isBasicValid(clip) && isDurationValid(clip) && hasGoodScore(clip)
  );

  console.log(`[Gemini] Filtered clips: ${normalized.length} -> ${validClips.length} (score >= 65)`);

  // Return all valid clips ranked from best to worst (as returned by Gemini)
  // Gemini already ranks them, so we just return them in order
  return validClips.length > 0 ? validClips : normalized.filter(isBasicValid);
}
