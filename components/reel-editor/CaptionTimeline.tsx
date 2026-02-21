"use client";

import React, { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { secondsToTimecode } from "@/lib/utils/timecodeUtils";
import styles from "./CaptionTimeline.module.css";

const ROW_HEIGHT = 56;
const MIN_DURATION = 0.1;

export function CaptionTimeline() {
  const t = useTranslations("captionTimeline");
  const parentRef = useRef<HTMLDivElement>(null);
  const {
    captions,
    trimPoints,
    currentPlayheadTime,
    selectedCaptionIds,
    setSelectedCaptionIds,
    updateCaptionStartEnd,
    splitCaptionAtPlayhead,
    mergeCaptions,
    shiftCaptions,
  } = useReelEditorStore();

  const sortedCaptions = React.useMemo(
    () => [...captions].sort((a, b) => a.startTime - b.startTime),
    [captions]
  );

  const virtualizer = useVirtualizer({
    count: sortedCaptions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const trimDuration = trimPoints.endTime - trimPoints.startTime;

  const handleRowClick = useCallback(
    (e: React.MouseEvent, captionId: string) => {
      if (e.ctrlKey || e.metaKey) {
        const ids = selectedCaptionIds.includes(captionId)
          ? selectedCaptionIds.filter((id) => id !== captionId)
          : [...selectedCaptionIds, captionId];
        setSelectedCaptionIds(ids);
      } else {
        setSelectedCaptionIds([captionId]);
      }
    },
    [selectedCaptionIds, setSelectedCaptionIds]
  );

  const handleStartChange = useCallback(
    (captionId: string, startTime: number) => {
      const cap = captions.find((c) => c.id === captionId);
      if (!cap) return;
      const end = cap.endTime;
      const newStart = Math.max(
        trimPoints.startTime,
        Math.min(startTime, end - MIN_DURATION)
      );
      updateCaptionStartEnd(captionId, { startTime: newStart, endTime: end });
    },
    [captions, trimPoints.startTime, updateCaptionStartEnd]
  );

  const handleEndChange = useCallback(
    (captionId: string, endTime: number) => {
      const cap = captions.find((c) => c.id === captionId);
      if (!cap) return;
      const start = cap.startTime;
      const newEnd = Math.min(
        trimPoints.endTime,
        Math.max(endTime, start + MIN_DURATION)
      );
      updateCaptionStartEnd(captionId, { startTime: start, endTime: newEnd });
    },
    [captions, trimPoints.endTime, updateCaptionStartEnd]
  );

  const handleSplit = useCallback(() => {
    const id = selectedCaptionIds[0] ?? null;
    if (id) splitCaptionAtPlayhead(id);
  }, [selectedCaptionIds, splitCaptionAtPlayhead]);

  const handleMerge = useCallback(() => {
    if (selectedCaptionIds.length >= 2) mergeCaptions(selectedCaptionIds);
  }, [selectedCaptionIds, mergeCaptions]);

  const handleShift = useCallback(
    (deltaMs: number) => {
      if (selectedCaptionIds.length > 0) shiftCaptions(selectedCaptionIds, deltaMs);
    },
    [selectedCaptionIds, shiftCaptions]
  );

  const canSplit =
    selectedCaptionIds.length === 1 &&
    (() => {
      const cap = captions.find((c) => c.id === selectedCaptionIds[0]);
      return (
        cap &&
        currentPlayheadTime > cap.startTime &&
        currentPlayheadTime < cap.endTime &&
        cap.text.trim().split(/\s+/).length >= 2
      );
    })();

  const canMerge = selectedCaptionIds.length >= 2;

  if (sortedCaptions.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t("noCaptions")}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>{t("captionTimeline")}</span>
        <p className={styles.description} role="status">{t("description")}</p>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={handleSplit}
            disabled={!canSplit}
            title={t("splitAtPlayhead")}
            aria-label={t("splitAtPlayhead")}
          >
            {t("split")}
          </button>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={handleMerge}
            disabled={!canMerge}
            title={t("mergeSelected")}
            aria-label={t("mergeSelected")}
          >
            {t("merge")}
          </button>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={() => handleShift(100)}
            disabled={selectedCaptionIds.length === 0}
            title={t("shiftForward")}
            aria-label={t("shiftForward")}
          >
            +100ms
          </button>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={() => handleShift(-100)}
            disabled={selectedCaptionIds.length === 0}
            title={t("shiftBack")}
            aria-label={t("shiftBack")}
          >
            −100ms
          </button>
        </div>
      </div>

      <div className={styles.timeRuler}>
        <span className={styles.timeRulerStart}>
          {secondsToTimecode(trimPoints.startTime)}
        </span>
        <span className={styles.timeRulerEnd}>
          {secondsToTimecode(trimPoints.endTime)}
        </span>
      </div>

      <div ref={parentRef} className={styles.list}>
        <div
          className={styles.listInner}
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const cap = sortedCaptions[virtualRow.index];
            const left =
              trimDuration > 0
                ? ((cap.startTime - trimPoints.startTime) / trimDuration) * 100
                : 0;
            const width =
              trimDuration > 0
                ? ((cap.endTime - cap.startTime) / trimDuration) * 100
                : 100;
            const isSelected = selectedCaptionIds.includes(cap.id);

            return (
              <div
                key={cap.id}
                className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={(e) => handleRowClick(e, cap.id)}
              >
                <div className={styles.rowTrack}>
                  <div
                    className={styles.rowBar}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                    }}
                  />
                </div>
                <div className={styles.rowSliders}>
                  <input
                    type="range"
                    min={trimPoints.startTime}
                    max={trimPoints.endTime}
                    step={0.05}
                    value={cap.startTime}
                    onChange={(e) =>
                      handleStartChange(cap.id, Number.parseFloat(e.target.value))
                    }
                    onClick={(e) => e.stopPropagation()}
                    className={styles.edgeInput}
                    aria-label={t("startTime")}
                  />
                  <input
                    type="range"
                    min={trimPoints.startTime}
                    max={trimPoints.endTime}
                    step={0.05}
                    value={cap.endTime}
                    onChange={(e) =>
                      handleEndChange(cap.id, Number.parseFloat(e.target.value))
                    }
                    onClick={(e) => e.stopPropagation()}
                    className={styles.edgeInput}
                    aria-label={t("endTime")}
                  />
                </div>
                <div className={styles.rowText} title={cap.text}>
                  {cap.text.length > 40 ? `${cap.text.slice(0, 40)}…` : cap.text}
                </div>
                <div className={styles.rowTimes}>
                  <span>{secondsToTimecode(cap.startTime)}</span>
                  <span>–</span>
                  <span>{secondsToTimecode(cap.endTime)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
