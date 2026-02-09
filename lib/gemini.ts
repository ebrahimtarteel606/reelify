import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TranscriptSegment } from "./elevenlabs";
import type { QAPreferences } from "./qaStore";
import { metrics } from "./services/MetricsService";

export type GeminiTokenUsage = {
  model: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
};

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
    .replace(/[“”]/g, '"')
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
  repaired = repaired.replace(/(\w+)\s*:/g, '"$1":');
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
): Promise<{ clips: ClipCandidate[]; tokenUsage: GeminiTokenUsage | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  // Use gemini-3-flash-preview as default (fastest and working model)
  // Available models (2025): gemini-3-flash-preview, gemini-3-pro-preview, gemini-1.5-pro
  // Note: gemini-pro, gemini-2.5-flash, and gemini-1.5-flash are not available
  let modelName = process.env.GEMINI_MODEL;

  // Fix invalid model names - map to available alternatives
  if (
    !modelName ||
    // modelName === "gemini-2.5-flash" ||
    modelName === "gemini-pro" ||
    modelName === "gemini-1.5-flash"
  ) {
    // Default to gemini-3-flash-preview (fastest and working)
    modelName = "gemini-3-flash-preview";
    console.log(
      `[Gemini] Using default model: ${modelName} (fastest available)`
    );
  }

  console.log(`[Gemini] Using model: ${modelName}`);
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelName });

  // Use all segments - don't filter anything from transcription
  const transcript = segments
    .map(
      (segment) =>
        `[${segment.start.toFixed(2)} - ${segment.end.toFixed(2)}] ${
          segment.text
        }`
    )
    .join("\n");

  // Language-specific preference labels
  const preferenceLabels =
    outputLanguage === "en"
      ? {
          platform: "Target platform",
          duration: "Preferred duration",
          audience: "Target audience",
          tone: "Content tone",
          hookStyle: "Hook style",
          keyTopics: "Key topics",
          callToAction: "Call to action",
          seconds: "seconds",
        }
      : {
          platform: "المنصة المستهدفة",
          duration: "المدة المفضلة",
          audience: "الجمهور المستهدف",
          tone: "نبرة المحتوى",
          hookStyle: "أسلوب الخطّاف",
          keyTopics: "محاور رئيسية",
          callToAction: "دعوة للفعل",
          seconds: "ثانية",
        };

  const preferenceLines = [
    preferences?.platform
      ? `${preferenceLabels.platform}: ${preferences.platform}`
      : null,
    Number.isFinite(preferences?.preferredDuration)
      ? `${preferenceLabels.duration}: ${preferences?.preferredDuration} ${preferenceLabels.seconds}`
      : null,
    preferences?.audience
      ? `${preferenceLabels.audience}: ${preferences.audience}`
      : null,
    preferences?.tone ? `${preferenceLabels.tone}: ${preferences.tone}` : null,
    preferences?.hookStyle
      ? `${preferenceLabels.hookStyle}: ${preferences.hookStyle}`
      : null,
    preferences?.keyTopics
      ? `${preferenceLabels.keyTopics}: ${preferences.keyTopics}`
      : null,
    preferences?.callToAction
      ? `${preferenceLabels.callToAction}: ${preferences.callToAction}`
      : null,
  ].filter(Boolean);

  const userPreferencesLabel =
    outputLanguage === "en" ? "User preferences" : "تفضيلات المستخدم";
  const preferenceBlock =
    preferenceLines.length > 0
      ? `\n${userPreferencesLabel}:\n${preferenceLines.join("\n")}\n`
      : "";

  // Get platform-specific recommendations
  const platformRecommendations: Record<string, string> = {
    instagram:
      "Instagram Reels: Focus on visually engaging moments, trending audio compatibility, and strong first 3 seconds. Prefer 15-30 second hooks. Use hashtags relevant to Instagram trends.",
    tiktok:
      "TikTok: Prioritize viral potential, trending topics, and authentic moments. Strong hooks are critical. Prefer 15-60 second clips. Consider TikTok's algorithm preferences for engagement.",
    youtube:
      "YouTube Shorts: Focus on educational value, clear takeaways, and strong CTA. Prefer 30-60 second clips. Ensure content is suitable for YouTube's broader audience.",
    snapchat:
      "Snapchat Spotlight: Prioritize quick, attention-grabbing moments. Prefer 15-30 second clips. Focus on authentic, raw content that resonates with younger audiences.",
    facebook:
      "Facebook Reels: Focus on community engagement and shareable content. Prefer 30-60 second clips. Consider Facebook's diverse age demographics.",
    linkedin:
      "LinkedIn: Prioritize professional value, insights, and thought leadership. Prefer 30-90 second clips. Focus on educational or inspirational content suitable for professional networks.",
  };

  const platform = preferences?.platform || "instagram";

  // Check if user skipped questions (minimal preferences - only platform/duration or less)
  const hasMinimalPreferences =
    preferenceLines.length <= 2 &&
    !preferences?.audience &&
    !preferences?.tone &&
    !preferences?.hookStyle;

  // When preferences are minimal, consider all platforms for best results
  const platformRec = hasMinimalPreferences
    ? `Consider ALL major short-form video platforms (Instagram Reels, TikTok, YouTube Shorts, Snapchat Spotlight, Facebook Reels, LinkedIn) and select the best moments that would work across multiple platforms. Focus on universally engaging content with strong hooks, clear value, and broad appeal.`
    : platformRecommendations[platform] || platformRecommendations.instagram;

  const outputLangInstructions = `
      OUTPUT LANGUAGE RULE (CRITICAL):
      - Detect the transcript language automatically.
      - Generate ALL titles, tags, and categories in the SAME language as the transcript.
      - If the transcript is Arabic:
        - Use the SAME dialect/accent style as the speaker (e.g., Egyptian, Gulf, Levantine).
        - Do NOT translate, normalize, or Modern-Standardize the language.
      - If the transcript is English:
        - Use natural, catchy, platform-optimized English.
      - NEVER translate titles, tags, or categories into another language.
      - Language consistency is mandatory.
    `;

  // Optimized prompt asking for as many clips as possible with scores >= 65
  const prompt = `
      You are a professional short-form video editor${
        hasMinimalPreferences
          ? " with expertise across all major platforms"
          : ` specializing in ${platform} content`
      }.
      The following text is a timestamped transcript. Auto-detect its language AND dialect/accent style. Extract highlight segments of 30–90 seconds and rank best → worst.

      ${
        hasMinimalPreferences
          ? "PLATFORM-AGNOSTIC RECOMMENDATIONS (AI decides best approach):"
          : "PLATFORM-SPECIFIC RECOMMENDATIONS:"
      }
      ${platformRec}
      ${outputLangInstructions}

      Return ONLY valid JSON — no explanations.
      Format:
      [{"title":"...","start":0,"end":0,"category":"...","tags":["..."],"score":75}]

      CRITICAL:
      - Return ONLY segments with score >= 65.
      - Apply a DURATION-BASED UPPER LIMIT on the number of returned segments.
      - The limit is an upper bound, NOT a target.
      - If fewer segments meet the quality threshold, return fewer.
      - NEVER include low-quality segments to reach the limit.

      DURATION-BASED CAPS:
      - ≤ 5 minutes video: max 2 segments
      - 5–10 minutes video: max 3 segments
      - 10–20 minutes video: max 5 segments
      - 20–40 minutes video: max 7 segments
      - 40–60 minutes video: max 10 segments
      - 60+ minutes video: max 12 segments

      SELECTION RULE:
      - First extract ALL candidate segments with score >= 65.
      - Then sort by score (descending).
      - Return only the TOP N segments according to the duration-based cap.
      Sort descending by quality (best first, worst last).

      Selection priority:
      1) Strong hook in first 3–5 seconds${
        hasMinimalPreferences
          ? " (critical for all platforms)"
          : ` (critical for ${platform})`
      }.
      2) Clean sentence boundaries.
      3) Clear value/payoff.
      4) Smooth flow.
      5) ${
        hasMinimalPreferences
          ? "Universal engagement factors that work across platforms"
          : `${platform}-specific engagement factors`
      }.

      Scoring:
      - Score 0–100.
      - Internally rate hook (1–10) - especially important${
        hasMinimalPreferences ? " for all platforms" : ` for ${platform}`
      }.
      - Rank by: hook → overall quality → value → ${
        hasMinimalPreferences ? "universal appeal" : `${platform} optimization`
      }.

      ${preferenceBlock}
      Transcript:
      ${transcript}
  `.trim();

  const geminiStart = Date.now();
  console.log(
    `[Gemini] Starting clip generation (${segments.length} segments, ${transcript.length} chars)`
  );

  let result;
  let text;
  const fallbackModels = [
    "gemini-1.5-pro",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
  ];
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
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });
    text = result.response.text();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If model fails with 404, try fallback models in order
    if (
      error instanceof Error &&
      (error.message.includes("404") || error.message.includes("not found"))
    ) {
      console.warn(
        `[Gemini] Model ${currentModelName} not available, trying fallback models...`
      );

      for (const fallbackModelName of fallbackModels) {
        if (currentModelName === fallbackModelName) continue; // Skip if already tried
        try {
          console.log(`[Gemini] Trying fallback model: ${fallbackModelName}`);
          const fallbackClient = new GoogleGenerativeAI(apiKey);
          const fallbackModel = fallbackClient.getGenerativeModel({
            model: fallbackModelName,
          });
          result = await fallbackModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
          });
          text = result.response.text();
          currentModelName = fallbackModelName;
          console.log(
            `[Gemini] Successfully used fallback model: ${fallbackModelName}`
          );
          break;
        } catch (fallbackError) {
          console.warn(
            `[Gemini] Fallback model ${fallbackModelName} also failed, trying next...`
          );
          continue;
        }
      }

      // If all fallbacks failed, throw original error
      if (!text) {
        const finalError = `All Gemini models failed. Tried: ${currentModelName}, ${fallbackModels.join(
          ", "
        )}. Error: ${error.message}`;
        throw new Error(finalError);
      }
    } else {
      throw error;
    }
  }

  const geminiTime = Date.now() - geminiStart;
  console.log(`[Gemini] Generation completed in ${geminiTime}ms`);

  // Extract token usage information
  let tokenUsage: GeminiTokenUsage | null = null;
  if (result) {
    try {
      const usageMetadata = result.response.usageMetadata;
      const inputTokens = usageMetadata?.promptTokenCount || 0;
      const outputTokens = usageMetadata?.candidatesTokenCount || 0;

      const costUSD = metrics.calculateGeminiCost(
        currentModelName,
        inputTokens,
        outputTokens
      );

      tokenUsage = {
        model: currentModelName,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        cost_usd: costUSD,
      };

      console.log(
        `[Gemini] Token usage - Model: ${currentModelName}, Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${costUSD.toFixed(
          6
        )}`
      );
    } catch (metricsError) {
      console.error("[Gemini] Failed to extract token usage:", metricsError);
    }
  }

  const parsed = parseGeminiJson(text);
  console.log(`[Gemini] Parsed ${parsed.length} clip candidates from response`);

  // Log scores if available
  if (parsed.length > 0 && parsed[0].score !== undefined) {
    const scores = parsed
      .map((c: any) => c.score)
      .filter((s: any) => s !== undefined);
    console.log(
      `[Gemini] Score range: ${Math.min(...scores)} - ${Math.max(...scores)}`
    );
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
    const start = Number.isFinite(rawStart)
      ? snapStartToSegment(rawStart)
      : rawStart;
    const end = Number.isFinite(rawEnd) ? snapEndToSegment(rawEnd) : rawEnd;
    const safeEnd = end > start ? end : rawEnd;
    const score = Number.isFinite(Number(clip.score))
      ? Number(clip.score)
      : undefined;
    return {
      title: String(clip.title ?? "").trim(),
      start,
      end: safeEnd,
      category: String(clip.category ?? defaultCategory).trim(),
      tags: Array.isArray(clip.tags)
        ? clip.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
        : [],
      score,
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

  console.log(
    `[Gemini] Filtered clips: ${normalized.length} -> ${validClips.length} (score >= 65)`
  );

  // Return all valid clips ranked from best to worst (as returned by Gemini)
  // Gemini already ranks them, so we just return them in order
  const clips =
    validClips.length > 0 ? validClips : normalized.filter(isBasicValid);
  return { clips, tokenUsage };
}
