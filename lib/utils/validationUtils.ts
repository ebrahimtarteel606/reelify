import { TrimPoints, ReelClipInput } from "@/types";

/**
 * Validate trim points
 */
export function validateTrimPoints(
  trimPoints: TrimPoints,
  videoDuration: number
): { valid: boolean; error?: string } {
  if (trimPoints.startTime < 0) {
    return { valid: false, error: "Start time cannot be negative" };
  }

  if (trimPoints.endTime > videoDuration) {
    return { valid: false, error: "End time cannot exceed video duration" };
  }

  if (trimPoints.startTime >= trimPoints.endTime) {
    return { valid: false, error: "Start time must be less than end time" };
  }

  const duration = trimPoints.endTime - trimPoints.startTime;
  if (duration < 0.1) {
    return { valid: false, error: "Trim duration must be at least 0.1 seconds" };
  }

  return { valid: true };
}

/**
 * Validate clip input data
 */
export function validateClipInput(clipData: ReelClipInput): { valid: boolean; error?: string } {
  if (!clipData.clipId) {
    return { valid: false, error: "Clip ID is required" };
  }

  if (!clipData.videoSourceUrl) {
    return { valid: false, error: "Video source URL is required" };
  }

  if (clipData.sourceVideoDuration <= 0) {
    return { valid: false, error: "Video duration must be greater than 0" };
  }

  const trimValidation = validateTrimPoints(
    { startTime: clipData.startTime, endTime: clipData.endTime },
    clipData.sourceVideoDuration
  );

  if (!trimValidation.valid) {
    return trimValidation;
  }

  return { valid: true };
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
