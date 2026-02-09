import { Caption } from "@/types";

/**
 * Calculate animation progress for a caption
 * Returns a value between 0 and 1 representing animation progress
 */
export function calculateAnimationProgress(caption: Caption, currentTime: number): number {
  if (!caption.style.animation || caption.style.animation.type === "none") {
    return 1; // No animation, fully visible
  }

  const { duration, delay } = caption.style.animation;
  const captionStartTime = caption.startTime;

  // Time elapsed since caption appeared
  const elapsed = currentTime - captionStartTime;

  // Check if we're in the delay period
  if (elapsed < delay) {
    return 0; // Not started yet
  }

  // Calculate progress within animation duration
  const animationElapsed = elapsed - delay;

  if (animationElapsed >= duration) {
    return 1; // Animation complete
  }

  // Raw progress (0 to 1)
  const rawProgress = animationElapsed / duration;

  // Apply easing
  return applyEasing(rawProgress, caption.style.animation.easing);
}

/**
 * Apply easing function to progress value
 */
function applyEasing(
  progress: number,
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut"
): number {
  switch (easing) {
    case "linear":
      return progress;

    case "easeIn":
      // Quadratic ease-in
      return progress * progress;

    case "easeOut":
      // Quadratic ease-out
      return progress * (2 - progress);

    case "easeInOut":
      // Quadratic ease-in-out
      return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

    default:
      return progress;
  }
}

/**
 * Get animation transform values based on type and progress
 */
export function getAnimationTransform(
  caption: Caption,
  progress: number
): {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
} {
  if (!caption.style.animation || caption.style.animation.type === "none") {
    return { opacity: 1, translateX: 0, translateY: 0, scale: 1 };
  }

  const { type } = caption.style.animation;

  switch (type) {
    case "fade":
      return {
        opacity: progress,
        translateX: 0,
        translateY: 0,
        scale: 1,
      };

    case "slideLeft":
      return {
        opacity: progress,
        translateX: -100 * (1 - progress), // Slide from left
        translateY: 0,
        scale: 1,
      };

    case "slideRight":
      return {
        opacity: progress,
        translateX: 100 * (1 - progress), // Slide from right
        translateY: 0,
        scale: 1,
      };

    case "slideTop":
      return {
        opacity: progress,
        translateX: 0,
        translateY: -50 * (1 - progress), // Slide from top
        scale: 1,
      };

    case "slideBottom":
      return {
        opacity: progress,
        translateX: 0,
        translateY: 50 * (1 - progress), // Slide from bottom
        scale: 1,
      };

    case "scale":
      return {
        opacity: progress,
        translateX: 0,
        translateY: 0,
        scale: 0.5 + 0.5 * progress, // Scale from 50% to 100%
      };

    case "typewriter":
      // Typewriter effect is handled differently in the renderer
      return {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
      };

    default:
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1 };
  }
}

/**
 * Calculate visible character count for typewriter effect
 */
export function getTypewriterCharCount(text: string, progress: number): number {
  return Math.floor(text.length * progress);
}
