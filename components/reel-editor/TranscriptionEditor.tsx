"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import styles from "./TranscriptionEditor.module.css";

export function TranscriptionEditor() {
  const t = useTranslations("transcriptionEditor");
  // Use selectors with individual values to ensure React detects changes
  const captions = useReelEditorStore((state) => state.captions);
  const currentClip = useReelEditorStore((state) => state.currentClip);
  const trimStart = useReelEditorStore((state) => state.trimPoints.startTime);
  const trimEnd = useReelEditorStore((state) => state.trimPoints.endTime);
  const setCaptions = useReelEditorStore((state) => state.setCaptions);
  const setIsEditingTranscription = useReelEditorStore((state) => state.setIsEditingTranscription);
  const hasUserEditedTranscription = useReelEditorStore(
    (state) => state.hasUserEditedTranscription
  );
  const setHasUserEditedTranscription = useReelEditorStore(
    (state) => state.setHasUserEditedTranscription
  );
  const restoreOriginalTranscriptionForCurrentTrim = useReelEditorStore(
    (state) => state.restoreOriginalTranscriptionForCurrentTrim
  );
  const [isEditing, setIsEditing] = useState(false);

  // Sync store when leaving edit mode or unmounting so other controls stay in sync
  useEffect(() => {
    return () => {
      setIsEditingTranscription(false);
    };
  }, [setIsEditingTranscription]);

  // Get a key that changes when trim points change (for forcing recalculation)
  const trimKey = useReelEditorStore(
    (state) => `${state.trimPoints.startTime.toFixed(2)}-${state.trimPoints.endTime.toFixed(2)}`
  );

  // Calculate transcription text from visible captions (memoized for performance)
  // This recalculates whenever captions, trim points, or trimKey changes
  const transcriptionText = useMemo(() => {
    console.log("[TranscriptionEditor] Recalculating transcription text:", {
      captionsCount: captions.length,
      trimRange: `${trimStart.toFixed(2)}s - ${trimEnd.toFixed(2)}s`,
      trimKey,
      hasClipTranscription: !!currentClip?.transcription,
      clipTranscriptionSegments: currentClip?.transcription?.segments.length || 0,
    });

    // If we have captions, use them directly (they're already filtered by the store)
    if (captions.length > 0) {
      // Filter captions that overlap with current trim range
      const visibleCaptions = captions
        .filter(
          (caption) =>
            caption.isVisible && caption.startTime < trimEnd && caption.endTime > trimStart
        )
        .sort((a, b) => a.startTime - b.startTime);

      const text = visibleCaptions.map((c) => c.text).join(" ");

      console.log("[TranscriptionEditor] Generated text from captions:", {
        totalCaptions: captions.length,
        visibleCaptions: visibleCaptions.length,
        textLength: text.length,
        textPreview: text.substring(0, 80) + (text.length > 80 ? "..." : ""),
      });

      return text;
    }

    // Fallback: try to get segments from sessionStorage or currentClip
    console.log("[TranscriptionEditor] No captions, trying segments fallback");
    let allSegments: Array<{
      text: string;
      start: number;
      end: number;
      language?: "ar" | "en";
    }> = [];

    // Try sessionStorage first, then localStorage (cross-tab)
    if (typeof window !== "undefined") {
      try {
        let raw = window.sessionStorage.getItem("reelify_segments");
        let source = "sessionStorage";

        // Fallback to localStorage
        if (!raw) {
          raw = window.localStorage.getItem("reelify_segments");
          source = "localStorage";
        }

        if (raw) {
          const data = JSON.parse(raw);
          if (Array.isArray(data) && data.length > 0) {
            allSegments = data
              .map((seg: any) => ({
                text: String(seg.text || "").trim(),
                start: Number(seg.start) || 0,
                end: Number(seg.end) || 0,
                language:
                  seg.language ||
                  ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as "ar" | "en"),
              }))
              .filter((seg) => seg.text.length > 0);
            console.log(
              `[TranscriptionEditor] Loaded segments from ${source}:`,
              allSegments.length
            );
          }
        }
      } catch (error) {
        console.warn("[TranscriptionEditor] Failed to read segments from storage:", error);
      }
    }

    // Fallback to currentClip transcription
    if (allSegments.length === 0 && currentClip?.transcription?.segments) {
      allSegments = currentClip.transcription.segments;
      console.log("[TranscriptionEditor] Loaded segments from currentClip:", allSegments.length);
    }

    // Filter segments by trim range
    if (allSegments.length > 0) {
      const visibleSegments = allSegments
        .filter((seg) => seg.start < trimEnd && seg.end > trimStart)
        .sort((a, b) => a.start - b.start);

      const text = visibleSegments.map((seg) => seg.text).join(" ");

      console.log("[TranscriptionEditor] Generated text from segments:", {
        totalSegments: allSegments.length,
        visibleSegments: visibleSegments.length,
        textLength: text.length,
        textPreview: text.substring(0, 80) + (text.length > 80 ? "..." : ""),
      });

      return text;
    }

    console.log("[TranscriptionEditor] No transcription available");
    return "";
  }, [captions, currentClip, trimStart, trimEnd, trimKey]);

  // Also listen for sessionStorage changes to get full transcription
  useEffect(() => {
    // Force recalculation when sessionStorage changes (in case segments are updated)
    const handleStorageChange = () => {
      // This will trigger useMemo to recalculate
      console.log("[TranscriptionEditor] sessionStorage changed, will recalculate on next render");
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorageChange);
      return () => window.removeEventListener("storage", handleStorageChange);
    }
  }, []);

  // Local state for editing
  const [editingText, setEditingText] = useState(transcriptionText);

  // Update editing text when transcription text changes (if not currently editing)
  useEffect(() => {
    if (!isEditing) {
      setEditingText(transcriptionText);
    }
  }, [transcriptionText, isEditing]);

  const handleSave = () => {
    if (!editingText.trim()) {
      alert(t("emptyError"));
      return;
    }

    // Detect language from text
    const detectLanguage = (text: string): "ar" | "en" => {
      const arabicRegex = /[\u0600-\u06FF]/;
      return arabicRegex.test(text) ? "ar" : "en";
    };

    const detectedLanguage = detectLanguage(editingText);

    // Split text into sentences or by punctuation
    const sentences = editingText
      .split(/([.!?،؛]+)/)
      .filter((s) => s.trim().length > 0)
      .reduce((acc: string[], curr, idx, arr) => {
        if (curr.match(/[.!?،؛]+/) && acc.length > 0) {
          acc[acc.length - 1] += curr;
        } else if (!curr.match(/[.!?،؛]+/)) {
          acc.push(curr.trim());
        }
        return acc;
      }, []);

    // Calculate timing based on TRIM POINTS (not full video duration)
    const totalDuration = trimEnd - trimStart;
    const segmentDuration = totalDuration / Math.max(sentences.length, 1);

    // Preserve existing caption styles if available
    const existingStyle =
      captions.length > 0
        ? captions[0].style
        : {
            fontSize: 48,
            fontFamily: "Arial",
            color: "#FFFFFF",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            textAlign: "center" as const,
            padding: { top: 10, right: 20, bottom: 10, left: 20 },
          };

    const existingPosition = captions.length > 0 ? captions[0].position : { x: 540, y: 1500 };

    // Create new captions from edited text within trim range
    // IMPORTANT: Create deep copies of style and position to avoid reference sharing
    const newCaptions = sentences.map((text, index) => {
      const startTime = trimStart + index * segmentDuration;
      const endTime = startTime + segmentDuration;

      return {
        id: `caption-${index}`,
        text: text.trim(),
        startTime,
        endTime,
        position: { ...existingPosition }, // Deep copy position
        style: {
          ...existingStyle,
          // Deep copy nested objects
          padding: existingStyle.padding ? { ...existingStyle.padding } : undefined,
          animation: existingStyle.animation ? { ...existingStyle.animation } : undefined,
          shadow: existingStyle.shadow ? { ...existingStyle.shadow } : undefined,
          keywordHighlights: existingStyle.keywordHighlights
            ? [...existingStyle.keywordHighlights]
            : undefined,
        },
        isVisible: true,
        language: detectedLanguage, // Use detected language
      };
    });

    setCaptions(newCaptions);
    setHasUserEditedTranscription(true);
    setIsEditing(false);
    setIsEditingTranscription(false);
  };

  const handleRestoreOriginal = () => {
    restoreOriginalTranscriptionForCurrentTrim();
  };

  const handleCancel = () => {
    // Restore original text from current transcription
    setEditingText(transcriptionText);
    setIsEditing(false);
    setIsEditingTranscription(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t("fullTranscription")}</h3>
        {!isEditing ? (
          <div className={styles.headerButtons}>
            <button
              onClick={() => {
                setIsEditing(true);
                setIsEditingTranscription(true);
              }}
              className={styles.editButton}
            >
              {t("editText")}
            </button>
            {hasUserEditedTranscription && (
              <button
                onClick={handleRestoreOriginal}
                className={styles.restoreButton}
                type="button"
              >
                {t("restoreOriginal")}
              </button>
            )}
          </div>
        ) : (
          <div className={styles.buttonGroup}>
            <button onClick={handleSave} className={styles.saveButton}>
              {t("save")}
            </button>
            <button onClick={handleCancel} className={styles.cancelButton}>
              {t("cancel")}
            </button>
          </div>
        )}
      </div>

      {isEditing && (
        <p className={styles.editingHint} role="status" aria-live="polite">
          <span className={styles.editingHintIcon} aria-hidden>
            ℹ️
          </span>
          {t("editingHint")}
        </p>
      )}

      <div className={styles.textBoxContainer}>
        {isEditing ? (
          <textarea
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            className={styles.textarea}
            placeholder={t("placeholder")}
            rows={10}
            dir="auto"
          />
        ) : (
          <div
            key={`transcription-${trimStart.toFixed(2)}-${trimEnd.toFixed(2)}`}
            className={styles.textDisplay}
            dir="auto"
          >
            {transcriptionText || t("noTranscription")}
          </div>
        )}
      </div>

      <div className={styles.info}>
        <p className={styles.infoText}>
          {
            captions.filter((c) => c.isVisible && c.startTime < trimEnd && c.endTime > trimStart)
              .length
          }{" "}
          {t("visibleSegments")} • {transcriptionText.split(" ").filter((w) => w.length > 0).length}{" "}
          {t("words")}
          {captions.length > 0 && captions[0].language && (
            <span>
              {" "}
              • {t("language")}:{" "}
              {captions[0].language === "ar" ? t("languageArabic") : t("languageEnglish")}
            </span>
          )}
        </p>
        <p
          className={styles.infoText}
          style={{ marginTop: "4px", fontSize: "11px", color: "#666" }}
        >
          {t("trimRange")}: {trimStart.toFixed(1)}s - {trimEnd.toFixed(1)}s
        </p>
      </div>
    </div>
  );
}
