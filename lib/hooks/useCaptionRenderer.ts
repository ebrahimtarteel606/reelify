"use client";

import { useEffect, useRef } from "react";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { ReelCaptionRenderer } from "@/lib/services/ReelCaptionRenderer";

export function useCaptionRenderer(videoWidth: number = 1080, videoHeight: number = 1920) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use selectors with individual values to ensure React detects changes
  const captions = useReelEditorStore((state) => state.captions);
  const currentPlayheadTime = useReelEditorStore((state) => state.currentPlayheadTime);
  const trimStart = useReelEditorStore((state) => state.trimPoints.startTime);
  const trimEnd = useReelEditorStore((state) => state.trimPoints.endTime);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Filter captions that are visible within trim range (always show all captions in trim range)
    const visibleCaptions = captions.filter(
      (c) => c.isVisible && c.startTime < trimEnd && c.endTime > trimStart
    );

    console.log("[CaptionRenderer] Rendering:", {
      totalCaptions: captions.length,
      visibleAtTime: visibleCaptions.length,
      currentTime: currentPlayheadTime.toFixed(2),
      trimRange: `${trimStart.toFixed(1)}s - ${trimEnd.toFixed(1)}s`,
      captionTimes: visibleCaptions.map((c) => `${c.startTime.toFixed(1)}-${c.endTime.toFixed(1)}`),
    });

    // Render captions
    ReelCaptionRenderer.renderCaptions(
      canvas,
      visibleCaptions,
      currentPlayheadTime,
      videoWidth,
      videoHeight
    );
  }, [captions, currentPlayheadTime, trimStart, trimEnd, videoWidth, videoHeight]);

  return canvasRef;
}
