import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TranscriptSegment } from "./elevenlabs";
import type { QAPreferences } from "./qaStore";

export type ClipCandidate = {
  title: string;
  start: number;
  end: number;
  category: string;
  tags: string[];
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

  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
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
الشكل المطلوب: [{"title":"...","start":0,"end":0,"category":"...","tags":["...","..."]}]
يجب أن تكون النتيجة 3 مقاطع بالضبط.

شروط العناوين:
- عربية فصيحة وطبيعية (لغة عربية معيارية).
- قصيرة وجذابة ومناسبة لريلز.
- لا تترجم إلى الإنجليزية.

معايير اختيار المقاطع (الترتيب حسب الأهمية):
1) خطّاف قوي في أول 3-5 ثوانٍ (سؤال جذاب، وعد واضح، رقم قوي، أو مفاجأة).
2) بداية ونهاية بجملة مكتملة (تجنب القطع وسط الكلام).
3) قيمة أو نتيجة واضحة خلال المقطع (فائدة، فكرة قوية، أو لحظة مؤثرة).
4) وضوح وسلاسة السرد (بدون تشويش أو قفزات مفاجئة).

التقييم الداخلي:
- قيّم كل مقطع بدرجة من 1 إلى 10 لخطّاف البداية (Hook Score).
- اختر أعلى 3 مقاطع حسب درجة الخطّاف ثم الجودة العامة.

التصنيف (category):
اختر تصنيفاً واحداً لكل مقطع من: تعليمي، ترفيهي، تحفيزي، إخباري، ديني، رياضي، تقني، اجتماعي

الوسوم (tags):
أضف 3-5 وسوم عربية مناسبة لكل مقطع تصف المحتوى.

${preferenceBlock}
النص المفروغ:
${transcript}
  `.trim();

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseGeminiJson(text);

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

  const normalized = parsed.map((clip) => {
    const rawStart = Number(clip.start);
    const rawEnd = Number(clip.end);
    const start = Number.isFinite(rawStart) ? snapStartToSegment(rawStart) : rawStart;
    const end = Number.isFinite(rawEnd) ? snapEndToSegment(rawEnd) : rawEnd;
    const safeEnd = end > start ? end : rawEnd;
    return {
      title: String(clip.title ?? "").trim(),
      start,
      end: safeEnd,
      category: String(clip.category ?? "عام").trim(),
      tags: Array.isArray(clip.tags)
        ? clip.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
        : []
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

  const withDuration = normalized.filter((clip) => isBasicValid(clip) && isDurationValid(clip));
  const fallback = normalized.filter(isBasicValid);

  return (withDuration.length >= 3 ? withDuration : fallback).slice(0, 3);
}
