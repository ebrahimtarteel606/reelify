"use client";

import { useCallback } from "react";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { ReelTrimController } from "@/lib/services/ReelTrimController";
import { clampTime } from "@/lib/utils/reelEditorUtils";

export function useTrimPoints() {
  const { trimPoints, sourceVideoDuration, updateTrimStart, updateTrimEnd, setTrimPoints } =
    useReelEditorStore();

  const updateStart = useCallback(
    (startTime: number) => {
      const clamped = clampTime(startTime, sourceVideoDuration);
      updateTrimStart(clamped);
    },
    [sourceVideoDuration, updateTrimStart]
  );

  const updateEnd = useCallback(
    (endTime: number) => {
      const clamped = clampTime(endTime, sourceVideoDuration);
      updateTrimEnd(clamped);
    },
    [sourceVideoDuration, updateTrimEnd]
  );

  const updateBoth = useCallback(
    (startTime: number, endTime: number) => {
      const validation = ReelTrimController.updateTrimPoints(
        trimPoints,
        startTime,
        endTime,
        sourceVideoDuration
      );
      if (validation.valid && validation.trimPoints) {
        setTrimPoints(validation.trimPoints);
      }
    },
    [trimPoints, sourceVideoDuration, setTrimPoints]
  );

  const getTrimmedDuration = useCallback(() => {
    return ReelTrimController.getTrimmedDuration(trimPoints);
  }, [trimPoints]);

  const isTimeInTrimRegion = useCallback(
    (time: number) => {
      return ReelTrimController.isTimeInTrimRegion(time, trimPoints);
    },
    [trimPoints]
  );

  return {
    trimPoints,
    updateStart,
    updateEnd,
    updateBoth,
    getTrimmedDuration,
    isTimeInTrimRegion,
  };
}
