'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { TranscriptionState } from '@/types';
import styles from './TranscriptionLoader.module.css';

interface TranscriptionLoaderProps {
  state: TranscriptionState;
  onRetry?: () => void;
  onSkip?: () => void;
}

export function TranscriptionLoader({ state, onRetry, onSkip }: TranscriptionLoaderProps) {
  const t = useTranslations('transcriptionLoader');

  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <h3 className={styles.title}>{t('transcribing')}</h3>
          <p className={styles.message}>
            {t('transcribingMessage')}
          </p>
          {onSkip && (
            <button onClick={onSkip} className={styles.skipButton}>
              {t('skipButton')}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>⚠️</div>
          <h3 className={styles.title}>{t('failed')}</h3>
          <p className={styles.errorMessage}>
            {state.error || t('errorDefault')}
          </p>
          <div className={styles.buttonGroup}>
            {onRetry && (
              <button onClick={onRetry} className={styles.retryButton}>
                {t('retryButton')}
              </button>
            )}
            {onSkip && (
              <button onClick={onSkip} className={styles.skipButton}>
                {t('continueWithout')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
