import { Caption, TrimPoints } from "@/types";

/**
 * Filter captions that are visible within trim region
 * A caption is visible if it overlaps with the trim region (not just if it's completely contained)
 */
export function filterVisibleCaptions(captions: Caption[], trimPoints: TrimPoints): Caption[] {
  return captions.map((caption) => ({
    ...caption,
    isVisible: caption.startTime < trimPoints.endTime && caption.endTime > trimPoints.startTime,
  }));
}

/**
 * Adjust caption timing relative to new trim start
 */
export function adjustCaptionTiming(
  captions: Caption[],
  oldStartTime: number,
  newStartTime: number
): Caption[] {
  const timeOffset = newStartTime - oldStartTime;
  return captions.map((caption) => ({
    ...caption,
    startTime: caption.startTime + timeOffset,
    endTime: caption.endTime + timeOffset,
  }));
}

/**
 * Calculate trimmed duration
 */
export function getTrimmedDuration(trimPoints: TrimPoints): number {
  return trimPoints.endTime - trimPoints.startTime;
}

/**
 * Check if time is within trim region
 */
export function isTimeInTrimRegion(time: number, trimPoints: TrimPoints): boolean {
  return time >= trimPoints.startTime && time <= trimPoints.endTime;
}

/**
 * Clamp time to video bounds
 */
export function clampTime(time: number, videoDuration: number): number {
  return Math.max(0, Math.min(time, videoDuration));
}
