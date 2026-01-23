import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TranscriptSegment } from "./elevenlabs";
import type { QAPreferences } from "./qaStore";

export type ClipCandidate = {
  title: string;
  start: number;
  end: number;
};

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
  preferences?: QAPreferences
): Promise<ClipCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelName });

  const transcript = segments
    .map(
      (segment) =>
        `[${segment.start.toFixed(2)} - ${segment.end.toFixed(2)}] ${segment.text}`
    )
    .join("\n");

  const preferenceLines = [
    preferences?.platform ? `المنصة المستهدفة: ${preferences.platform}` : null,
    Number.isFinite(preferences?.preferredDuration)
      ? `المدة المفضلة: ${preferences?.preferredDuration} ثانية`
      : null,
    preferences?.audience ? `الجمهور المستهدف: ${preferences.audience}` : null,
    preferences?.tone ? `نبرة المحتوى: ${preferences.tone}` : null,
    preferences?.hookStyle ? `أسلوب الخطّاف: ${preferences.hookStyle}` : null,
    preferences?.keyTopics ? `محاور رئيسية: ${preferences.keyTopics}` : null,
    preferences?.callToAction ? `دعوة للفعل: ${preferences.callToAction}` : null
  ].filter(Boolean);

  const preferenceBlock =
    preferenceLines.length > 0
      ? `\nتفضيلات المستخدم:\n${preferenceLines.join("\n")}\n`
      : "";

  const prompt = `
أنت محرر فيديو محترف متخصص في المقاطع القصيرة.
المحتوى التالي تفريغ عربي مع الطوابع الزمنية. اختر أفضل 3 مقاطع فقط بطول 30 إلى 90 ثانية.
أعد النتيجة بصيغة JSON فقط، بدون أي شرح إضافي.
الشكل المطلوب: [{"title":"...","start":0,"end":0}]
يجب أن تكون النتيجة 3 مقاطع بالضبط.

شروط العناوين:
- عربية فصيحة وطبيعية (لغة عربية معيارية).
- قصيرة وجذابة ومناسبة لريلز.
- لا تترجم إلى الإنجليزية.

${preferenceBlock}
النص المفروغ:
${transcript}
  `.trim();

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseGeminiJson(text);

  return parsed
    .map((clip) => ({
      title: String(clip.title ?? "").trim(),
      start: Number(clip.start),
      end: Number(clip.end)
    }))
    .filter(
      (clip) =>
        clip.title &&
        Number.isFinite(clip.start) &&
        Number.isFinite(clip.end) &&
        clip.end > clip.start
    )
    .slice(0, 3); // Limit to 3 clips
}
