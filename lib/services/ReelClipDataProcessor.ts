import { ReelClipInput, Caption } from "@/types";
import { validateClipInput } from "@/lib/utils/validationUtils";

export class ReelClipDataProcessor {
  /**
   * Process and validate clip input data
   */
  static processClipData(clipData: ReelClipInput): {
    valid: boolean;
    error?: string;
    processedData?: ReelClipInput;
  } {
    const validation = validateClipInput(clipData);
    if (!validation.valid) {
      return validation;
    }

    // Normalize transcription segments if present
    let processedData: ReelClipInput;

    if (clipData.transcription && clipData.transcription.segments.length > 0) {
      const normalizedSegments = clipData.transcription.segments
        .filter((segment) => segment.start < segment.end && segment.text.trim().length > 0)
        .sort((a, b) => a.start - b.start);

      processedData = {
        ...clipData,
        transcription: {
          segments: normalizedSegments,
        },
      };
    } else {
      // No transcription, keep as-is
      processedData = clipData;
    }

    return { valid: true, processedData };
  }

  /**
   * Convert transcription segments to caption format
   */
  static segmentsToCaptions(
    segments: NonNullable<ReelClipInput["transcription"]>["segments"]
  ): Caption[] {
    return segments.map((segment, index) => ({
      id: `caption-${index}`,
      text: segment.text,
      startTime: segment.start,
      endTime: segment.end,
      position: { x: 540, y: 1500 }, // Default position (center-bottom for 9:16)
      style: {
        fontSize: 48,
        fontFamily: "Arial",
        color: "#FFFFFF",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        textAlign: "center",
        padding: { top: 10, right: 20, bottom: 10, left: 20 },
      },
      isVisible: true,
      language: segment.language,
    }));
  }

  /**
   * Detect text direction (RTL for Arabic, LTR for English)
   */
  static detectTextDirection(text: string): "rtl" | "ltr" {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? "rtl" : "ltr";
  }
}
