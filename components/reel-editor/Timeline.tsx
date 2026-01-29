'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { useTranslations } from 'next-intl';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { secondsToTimecode } from '@/lib/utils/timecodeUtils';
import styles from './Timeline.module.css';

export function Timeline() {
  const t = useTranslations('timeline');
  const {
    sourceVideoDuration,
    trimPoints,
    currentPlayheadTime,
    updateTrimStart,
    updateTrimEnd,
  } = useReelEditorStore();

  // Track which slider is being dragged to prevent interference
  // Use ref for immediate synchronous updates
  const draggingSliderRef = useRef<'start' | 'end' | null>(null);
  const [draggingSlider, setDraggingSlider] = useState<'start' | 'end' | null>(null);

  // Use trim points directly without auto-correction
  const safeTrimPoints = trimPoints;


  // Handle global pointer events to prevent slider interference
  useEffect(() => {
    const handlePointerUp = () => {
      draggingSliderRef.current = null;
      setDraggingSlider(null);
    };

    if (draggingSlider) {
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
      return () => {
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);
      };
    }
  }, [draggingSlider]);


  // Handle start marker drag
  const handleStartMarkerChange = useCallback(
    (values: number[]) => {
      // Only process if we're dragging the start slider
      if (draggingSliderRef.current === 'start' || draggingSliderRef.current === null) {
        const newStart = values[0];
        // Just update the start, no coupling with end
        if (newStart >= 0 && newStart <= sourceVideoDuration) {
          updateTrimStart(newStart);
        }
      }
    },
    [sourceVideoDuration, updateTrimStart]
  );

  // Handle end marker drag
  const handleEndMarkerChange = useCallback(
    (values: number[]) => {
      // Only process if we're dragging the end slider
      if (draggingSliderRef.current === 'end' || draggingSliderRef.current === null) {
        const newEnd = values[0];
        // Just update the end, no coupling with start
        if (newEnd >= 0 && newEnd <= sourceVideoDuration) {
          updateTrimEnd(newEnd);
        }
      }
    },
    [sourceVideoDuration, updateTrimEnd]
  );

  // Calculate positions as percentages using safe trim points
  const getStartPosition = () => (safeTrimPoints.startTime / sourceVideoDuration) * 100;
  const getEndPosition = () => (safeTrimPoints.endTime / sourceVideoDuration) * 100;
  const getPlayheadPosition = () => (currentPlayheadTime / sourceVideoDuration) * 100;

  const trimRegionStyle = {
    left: `${getStartPosition()}%`,
    width: `${getEndPosition() - getStartPosition()}%`,
  };

  const playheadStyle = {
    left: `${getPlayheadPosition()}%`,
  };

  const trimDuration = safeTrimPoints.endTime - safeTrimPoints.startTime;

  const STEP = 1;
  const minDuration = 0.1;

  const handleStartMinus = () => {
    const newStart = Math.min(
      safeTrimPoints.startTime + STEP,
      safeTrimPoints.endTime - minDuration
    );
    updateTrimStart(newStart);
  };
  const handleStartPlus = () => {
    const newStart = Math.max(0, safeTrimPoints.startTime - STEP);
    updateTrimStart(newStart);
  };
  const handleEndMinus = () => {
    const newEnd = Math.max(
      safeTrimPoints.endTime - STEP,
      safeTrimPoints.startTime + minDuration
    );
    updateTrimEnd(newEnd);
  };
  const handleEndPlus = () => {
    const newEnd = Math.min(sourceVideoDuration, safeTrimPoints.endTime + STEP);
    updateTrimEnd(newEnd);
  };

  if (sourceVideoDuration === 0) {
    return <div className={styles.container}>{t('loadingTimeline')}</div>;
  }

  return (
    <div className={styles.container}>
      {/* Time labels at top */}
      <div className={styles.timeLabels}>
        <span className={styles.timeLabel}>00:00.000</span>
        <span className={styles.timeLabel}>{secondsToTimecode(sourceVideoDuration)}</span>
      </div>

      {/* Main timeline track */}
      <div className={styles.trackContainer}>
        <div className={styles.track}>
          {/* Full video track background */}
          <div className={styles.fullTrack} />
          
          {/* Trimmed region highlight */}
          <div className={styles.trimRegion} style={trimRegionStyle} />
          
          {/* Playhead indicator (visual only, not draggable) */}
          <div className={styles.playheadIndicator} style={playheadStyle}>
            <div className={styles.playheadLine} />
            <div className={styles.playheadHead} />
          </div>
          
          {/* End marker slider - spans full width (rendered first for correct visual layering) */}
          <Slider.Root
            className={styles.endMarkerSlider}
            value={[safeTrimPoints.endTime]}
            onValueChange={handleEndMarkerChange}
            min={0}
            max={sourceVideoDuration}
            step={0.1}
          >
            <Slider.Track className={styles.markerTrack}>
              <Slider.Range className={styles.markerRange} />
            </Slider.Track>
            <Slider.Thumb 
              className={`${styles.markerThumb} ${styles.endMarker}`} 
              aria-label={t('endMarker')}
              onPointerDown={() => {
                draggingSliderRef.current = 'end';
                setDraggingSlider('end');
              }}
            >
              <div className={styles.markerLine} />
              <div className={styles.markerLabel}>{t('endMarker')}</div>
            </Slider.Thumb>
          </Slider.Root>

          {/* Start marker slider - spans full width (rendered second for higher z-index) */}
          <Slider.Root
            className={styles.startMarkerSlider}
            value={[safeTrimPoints.startTime]}
            onValueChange={handleStartMarkerChange}
            min={0}
            max={sourceVideoDuration}
            step={0.1}
          >
            <Slider.Track className={styles.markerTrack}>
              <Slider.Range className={styles.markerRange} />
            </Slider.Track>
            <Slider.Thumb 
              className={`${styles.markerThumb} ${styles.startMarker}`} 
              aria-label={t('startMarker')}
              onPointerDown={() => {
                draggingSliderRef.current = 'start';
                setDraggingSlider('start');
              }}
            >
              <div className={styles.markerLine} />
              <div className={styles.markerLabel}>{t('startMarker')}</div>
            </Slider.Thumb>
          </Slider.Root>


        </div>
      </div>

      {/* ±1s trim controls */}
      <div className={styles.trimControls}>
        <div className={styles.trimControlGroup}>
          <span className={styles.trimControlLabel}>{t('start')}</span>
          <div className={styles.trimControlButtons}>
            <button
              type="button"
              onClick={handleStartPlus}
              disabled={safeTrimPoints.startTime <= 0}
              className={styles.trimBtn}
              title={t('startBefore')}
              aria-label={t('startBefore')}
            >
              +1s
            </button>
            <button
              type="button"
              onClick={handleStartMinus}
              disabled={safeTrimPoints.startTime >= safeTrimPoints.endTime - minDuration}
              className={styles.trimBtn}
              title={t('startAfter')}
              aria-label={t('startAfter')}
            >
              −1s
            </button>
          </div>
        </div>
        <div className={styles.trimControlGroup}>
          <span className={styles.trimControlLabel}>{t('end')}</span>
          <div className={styles.trimControlButtons}>
            <button
              type="button"
              onClick={handleEndMinus}
              disabled={safeTrimPoints.endTime <= safeTrimPoints.startTime + minDuration}
              className={styles.trimBtn}
              title={t('endBefore')}
              aria-label={t('endBefore')}
            >
              −1s
            </button>
            <button
              type="button"
              onClick={handleEndPlus}
              disabled={safeTrimPoints.endTime >= sourceVideoDuration}
              className={styles.trimBtn}
              title={t('endAfter')}
              aria-label={t('endAfter')}
            >
              +1s
            </button>
          </div>
        </div>
      </div>

      {/* Info display */}
      <div className={styles.infoDisplay}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('start')}:</span>
          <span className={styles.infoValue}>{secondsToTimecode(safeTrimPoints.startTime)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('end')}:</span>
          <span className={styles.infoValue}>{secondsToTimecode(safeTrimPoints.endTime)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('duration')}:</span>
          <span className={styles.infoValue}>{secondsToTimecode(trimDuration)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('current')}:</span>
          <span className={styles.infoValue}>{secondsToTimecode(currentPlayheadTime)}</span>
        </div>
      </div>
    </div>
  );
}
