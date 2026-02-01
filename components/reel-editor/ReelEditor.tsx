'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ReelEditorProps } from '@/types';
import { useReelEditorStore } from '@/lib/store/useReelEditorStore';
import { ReelClipDataProcessor } from '@/lib/services/ReelClipDataProcessor';
import { ElevenLabsService } from '@/lib/services/ElevenLabsService';
import { VideoPlayer } from './VideoPlayer';
import { CaptionCanvas } from './CaptionCanvas';
import { Timeline } from './Timeline';
import { TranscriptionLoader } from './TranscriptionLoader';
import { TranscriptionEditor } from './TranscriptionEditor';
import { ExportButton } from './ExportButton';
import styles from './ReelEditor.module.css';

export function ReelEditor({
  clipData,
  title,
  theme = 'light',
  aspectRatio = '9:16',
  exportQuality = 'medium',
  onClipLoaded,
  onExportSuccess,
  onExportError,
}: ReelEditorProps) {
  const t = useTranslations('editor');
  const { setCurrentClip, updateClipMetadata, currentClip, transcriptionState, setTranscriptionState, exportFormat, setExportFormat } = useReelEditorStore();
  const [processedClipData, setProcessedClipData] = useState<typeof clipData | null>(null);

  // Sync title prop to store so export/publish use latest title without re-initializing clip
  useEffect(() => {
    if (title !== undefined) {
      updateClipMetadata({ title });
    }
  }, [title, updateClipMetadata]);

  // Initialize clip data
  useEffect(() => {
    // Process and validate clip data
    const processed = ReelClipDataProcessor.processClipData(clipData);
    if (processed.valid && processed.processedData) {
      setProcessedClipData(processed.processedData);
      
      // Check if transcription is missing or empty
      const needsTranscription = 
        !processed.processedData.transcription || 
        processed.processedData.transcription.segments.length === 0;
      
      if (needsTranscription) {
        // Trigger auto-transcription
        handleTranscription(processed.processedData);
      } else {
        // Load clip with existing transcription
        setCurrentClip(processed.processedData);
        onClipLoaded?.(processed.processedData.clipId);
      }
    } else {
      onExportError?.(new Error(processed.error || 'Invalid clip data'));
    }
  }, [clipData]);

  const handleTranscription = async (clip: typeof clipData) => {
    setTranscriptionState({ status: 'loading' });

    try {
      const result = await ElevenLabsService.transcribeAudio(
        clip.videoSourceUrl
        // Language will be auto-detected
      );

      // Update clip data with transcription
      const updatedClip = {
        ...clip,
        transcription: {
          segments: result.segments,
        },
      };

      setProcessedClipData(updatedClip);
      setCurrentClip(updatedClip);
      setTranscriptionState({ status: 'success' });
      onClipLoaded?.(updatedClip.clipId);
    } catch (error) {
      console.error('Transcription error:', error);
      setTranscriptionState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to transcribe video',
      });
    }
  };

  const handleRetry = () => {
    if (processedClipData) {
      handleTranscription(processedClipData);
    }
  };

  const handleSkip = () => {
    if (processedClipData) {
      // Continue without captions
      setCurrentClip(processedClipData);
      setTranscriptionState({ status: 'success' });
      onClipLoaded?.(processedClipData.clipId);
    }
  };

  // Show transcription loader if transcribing
  if (transcriptionState.status === 'loading' || transcriptionState.status === 'error') {
    return (
      <>
        <div className={`${styles.container} ${styles[theme]}`}>
          <div className={styles.editor}>
            <div className={styles.loadingMessage}>{t('preparingEditor')}</div>
          </div>
        </div>
        <TranscriptionLoader
          state={transcriptionState}
          onRetry={handleRetry}
          onSkip={handleSkip}
        />
      </>
    );
  }

  if (!currentClip) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('loadingEditor')}</div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${styles[theme]}`}>
      <div className={styles.editor}>
        <div className={styles.videoSection}>
          <div className={styles.videoContainer}>
            <div 
              className={styles.videoPlayerWrapper}
              data-format={exportFormat}
            >
              <VideoPlayer videoUrl={currentClip.videoSourceUrl} format={exportFormat} />
              <CaptionCanvas 
                videoWidth={1080} 
                videoHeight={1920}
              />
            </div>
            <div className={styles.formatToggle}>
              <button
                className={styles.toggleSwitch}
                onClick={() => setExportFormat(exportFormat === 'zoom' ? 'landscape' : 'zoom')}
                role="switch"
                aria-checked={exportFormat === 'landscape'}
                aria-label={`${t('format')}: ${exportFormat === 'zoom' ? t('zoom') : t('landscape')}`}
              >
                <span className={styles.toggleTrack}>
                  <span className={styles.toggleTextZoom}>{t('zoom')}</span>
                  <span className={styles.toggleTextLandscape}>{t('landscape')}</span>
                  <span className={`${styles.toggleSlider} ${exportFormat === 'landscape' ? styles.toggleSliderActive : ''}`} />
                </span>
              </button>
            </div>
          </div>
          <Timeline />
        </div>
        
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>{t('transcription')}</h2>
            <ExportButton 
              onExportSuccess={onExportSuccess}
              onExportError={onExportError}
              quality={exportQuality}
            />
          </div>
          
          <div className={styles.sidebarContent}>
            <TranscriptionEditor />
          </div>
        </div>
      </div>
    </div>
  );
}
