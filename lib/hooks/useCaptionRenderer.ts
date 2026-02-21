"use client";

import { useEffect, useMemo, useRef } from "react";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { ReelCaptionRenderer } from "@/lib/services/ReelCaptionRenderer";

export function useCaptionRenderer(videoWidth: number = 1080, videoHeight: number = 1920) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captions = useReelEditorStore((state) => state.captions);
  const currentPlayheadTime = useReelEditorStore((state) => state.currentPlayheadTime);
  const trimStart = useReelEditorStore((state) => state.trimPoints.startTime);
  const trimEnd = useReelEditorStore((state) => state.trimPoints.endTime);

  // Only redraw when the caption visible at current time changes, or playhead/trim changes.
  // This avoids full canvas re-render on every keystroke when editing a different caption's style.
  const visibleCaption = useMemo(
    () =>
      captions.find(
        (c) =>
          c.isVisible &&
          currentPlayheadTime >= c.startTime &&
          currentPlayheadTime <= c.endTime
      ),
    [captions, currentPlayheadTime]
  );

  const renderKey = useMemo(
    () =>
      visibleCaption
        ? `${visibleCaption.id}-${visibleCaption.text}-${JSON.stringify(visibleCaption.style)}-${currentPlayheadTime.toFixed(3)}`
        : `none-${currentPlayheadTime.toFixed(3)}`,
    [visibleCaption, currentPlayheadTime]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = useReelEditorStore.getState();
    const visibleCaptions = state.captions.filter(
      (c) => c.isVisible && c.startTime < state.trimPoints.endTime && c.endTime > state.trimPoints.startTime
    );

    ReelCaptionRenderer.renderCaptions(
      canvas,
      visibleCaptions,
      state.currentPlayheadTime,
      videoWidth,
      videoHeight
    );
  }, [renderKey, trimStart, trimEnd, videoWidth, videoHeight]);

  return canvasRef;
}
