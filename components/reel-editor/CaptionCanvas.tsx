'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCaptionRenderer } from '@/lib/hooks/useCaptionRenderer';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { DEFAULT_SAFE_AREAS } from '@/types';
import styles from './CaptionCanvas.module.css';

interface CaptionCanvasProps {
  videoWidth?: number;
  videoHeight?: number;
  className?: string;
}

export function CaptionCanvas({
  videoWidth = 1080,
  videoHeight = 1920,
  className,
}: CaptionCanvasProps) {
  const t = useTranslations('captionCanvas');
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 540, height: 960 });
  const canvasRef = useCaptionRenderer(videoWidth, videoHeight);
  const { showSafeAreas, captions, selectedCaptionId } = useReelEditorStore();

  // Update canvas size to match container
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate safe area percentages
  const safeAreaStyle = {
    top: `${(DEFAULT_SAFE_AREAS.top / videoHeight) * 100}%`,
    left: `${(DEFAULT_SAFE_AREAS.left / videoWidth) * 100}%`,
    right: `${(DEFAULT_SAFE_AREAS.right / videoWidth) * 100}%`,
    bottom: `${(DEFAULT_SAFE_AREAS.bottom / videoHeight) * 100}%`,
  };

  // Check if selected caption is outside safe areas
  const selectedCaption = captions.find(c => c.id === selectedCaptionId);
  const isOutsideSafeArea = selectedCaption ? (
    selectedCaption.position.x < DEFAULT_SAFE_AREAS.left ||
    selectedCaption.position.x > videoWidth - DEFAULT_SAFE_AREAS.right ||
    selectedCaption.position.y < DEFAULT_SAFE_AREAS.top ||
    selectedCaption.position.y > videoHeight - DEFAULT_SAFE_AREAS.bottom
  ) : false;

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${className || ''}`}
        width={videoWidth}
        height={videoHeight}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
      {showSafeAreas && (
        <div className={styles.safeAreaOverlay}>
          <div className={styles.safeAreaBorder} style={safeAreaStyle} />
          <div className={styles.safeAreaLabel}>{t('safeArea')}</div>
        </div>
      )}
      {showSafeAreas && isOutsideSafeArea && (
        <div className={styles.warningIndicator}>
          {t('outsideSafeArea')}
        </div>
      )}
    </div>
  );
}
