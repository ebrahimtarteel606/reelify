import { TrimPoints } from "@/types";
import { validateTrimPoints, clamp } from "@/lib/utils/validationUtils";

export class ReelTrimController {
  /**
   * Validate and update trim points
   */
  static updateTrimPoints(
    currentTrimPoints: TrimPoints,
    newStartTime?: number,
    newEndTime?: number,
    videoDuration: number = 0
  ): { valid: boolean; trimPoints?: TrimPoints; error?: string } {
    const trimPoints: TrimPoints = {
      startTime: newStartTime ?? currentTrimPoints.startTime,
      endTime: newEndTime ?? currentTrimPoints.endTime,
    };

    // Clamp values to video bounds
    trimPoints.startTime = clamp(trimPoints.startTime, 0, videoDuration);
    trimPoints.endTime = clamp(trimPoints.endTime, 0, videoDuration);

    // Validate
    const validation = validateTrimPoints(trimPoints, videoDuration);
    if (!validation.valid) {
      return validation;
    }

    return { valid: true, trimPoints };
  }

  /**
   * Get trimmed duration
   */
  static getTrimmedDuration(trimPoints: TrimPoints): number {
    return trimPoints.endTime - trimPoints.startTime;
  }

  /**
   * Check if time is within trim region
   */
  static isTimeInTrimRegion(time: number, trimPoints: TrimPoints): boolean {
    return time >= trimPoints.startTime && time <= trimPoints.endTime;
  }

  /**
   * Snap time to trim boundaries
   */
  static snapToTrimBoundary(time: number, trimPoints: TrimPoints, threshold: number = 0.5): number {
    if (Math.abs(time - trimPoints.startTime) < threshold) {
      return trimPoints.startTime;
    }
    if (Math.abs(time - trimPoints.endTime) < threshold) {
      return trimPoints.endTime;
    }
    return time;
  }
}
