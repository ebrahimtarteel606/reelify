import { create } from "zustand";
import { ReelClipInput, Caption, CaptionStyle, TrimPoints, TranscriptionState } from "@/types";
import { filterVisibleCaptions } from "@/lib/utils/reelEditorUtils";

// Minimal fallback when no style is set (no default style – user picks a template)
const getDefaultCaptionStyle = (): CaptionStyle => ({
  fontSize: 48,
  fontFamily: "Inter, \"Noto Sans Arabic\", system-ui, sans-serif",
  color: "#FFFFFF",
  textAlign: "center",
  padding: { top: 8, right: 16, bottom: 8, left: 16 },
  maxWidth: 800,
});

// Default caption position
const getDefaultCaptionPosition = () => ({ x: 540, y: 1500 });

interface ReelEditorState {
  // Current clip data
  currentClip: ReelClipInput | null;
  sourceVideoDuration: number;

  // Trim points
  trimPoints: TrimPoints;

  // Captions
  captions: Caption[];
  editedCaptions: Caption[];
  selectedCaptionId: string | null;
  selectedCaptionIds: string[]; // Multi-select for timeline (first id = primary for canvas)
  lastEditedCaptionStyle: Caption["style"] | null; // Track last edited caption style for new captions
  /** Height in video coords of the selected caption (set by CaptionCanvas for sidebar alignment buttons) */
  selectedCaptionHeightInVideo: number | null;

  // Playback state
  currentPlayheadTime: number;
  isPlaying: boolean;

  // Export state
  isExporting: boolean;
  exportProgress: number;

  // Transcription state
  transcriptionState: TranscriptionState;

  // UI state
  showSafeAreas: boolean;
  exportFormat: "landscape" | "zoom";
  /** Whether to include captions in export (toggle on page) */
  includeCaptionsForExport: boolean;
  isEditingTranscription: boolean;

  // Full-video transcription source (widest segment list) for extend trim and restore original
  fullTranscriptionSegments: Array<{
    text: string;
    start: number;
    end: number;
    language?: "ar" | "en";
    words?: Array<{ text: string; start: number; end: number }>;
  }>;
  hasUserEditedTranscription: boolean;

  // Actions
  setCurrentClip: (clip: ReelClipInput) => void;
  updateClipMetadata: (metadata: { title?: string; description?: string }) => void;
  setSourceVideoDuration: (duration: number) => void;
  setTrimPoints: (trimPoints: TrimPoints) => void;
  updateTrimStart: (startTime: number) => void;
  updateTrimEnd: (endTime: number) => void;
  setCaptions: (captions: Caption[]) => void;
  updateCaption: (id: string, updates: Partial<Caption>) => void;
  updateCaptionPosition: (id: string, position: { x: number; y: number }) => void;
  updateCaptionStyle: (id: string, style: Partial<Caption["style"]>) => void;
  /** Apply style only to the given caption IDs (no sync to others). For templates. */
  updateCaptionStyleForIds: (ids: string[], style: Partial<Caption["style"]>) => void;
  setSelectedCaptionId: (id: string | null) => void;
  setSelectedCaptionIds: (ids: string[]) => void;
  setSelectedCaptionHeightInVideo: (height: number | null) => void;
  updateCaptionStartEnd: (id: string, params: { startTime: number; endTime: number }) => void;
  splitCaptionAtPlayhead: (captionId: string) => void;
  mergeCaptions: (ids: string[]) => void;
  shiftCaptions: (ids: string[], deltaMs: number) => void;
  setCurrentPlayheadTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsExporting: (exporting: boolean) => void;
  setExportProgress: (progress: number) => void;
  setTranscriptionState: (state: TranscriptionState) => void;
  setShowSafeAreas: (show: boolean) => void;
  setExportFormat: (format: "landscape" | "zoom") => void;
  setIncludeCaptionsForExport: (value: boolean) => void;
  setIsEditingTranscription: (editing: boolean) => void;
  setFullTranscriptionSegments: (
    segments: Array<{
      text: string;
      start: number;
      end: number;
      language?: "ar" | "en";
    }>
  ) => void;
  setHasUserEditedTranscription: (value: boolean) => void;
  restoreOriginalTranscriptionForCurrentTrim: () => void;
  reset: () => void;
}

const initialState = {
  currentClip: null,
  sourceVideoDuration: 0,
  trimPoints: { startTime: 0, endTime: 0 },
  captions: [],
  editedCaptions: [],
  selectedCaptionId: null,
  selectedCaptionIds: [],
  lastEditedCaptionStyle: null,
  selectedCaptionHeightInVideo: null,
  currentPlayheadTime: 0,
  isPlaying: false,
  isExporting: false,
  exportProgress: 0,
  transcriptionState: { status: "idle" as const },
  showSafeAreas: false,
  exportFormat: "zoom" as const,
  includeCaptionsForExport: true,
  isEditingTranscription: false,
  fullTranscriptionSegments: [],
  hasUserEditedTranscription: false,
};

export const useReelEditorStore = create<ReelEditorState>((set, get) => ({
  ...initialState,

  setCurrentClip: (clip) => {
    console.log("[Store] setCurrentClip called:", {
      clipId: clip.clipId,
      clipRange: `${clip.startTime.toFixed(1)}s - ${clip.endTime.toFixed(1)}s`,
      hasTranscription: !!clip.transcription,
      transcriptionSegments: clip.transcription?.segments.length || 0,
      sourceVideoDuration: clip.sourceVideoDuration,
    });

    // Persist full transcription segments for extend-trim and restore-original (include words for karaoke)
    const fullSegments =
      clip.transcription?.segments?.map((seg) => ({
        text: String(seg.text || "").trim(),
        start: Number(seg.start) || 0,
        end: Number(seg.end) || 0,
        language:
          seg.language || ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as "ar" | "en"),
        words: seg.words,
      })) ?? [];

    // IMPORTANT: Store the clip with ALL transcription segments intact
    // Do NOT filter segments here - we need the full transcription for expanding trim boundaries
    set({
      currentClip: clip,
      sourceVideoDuration: clip.sourceVideoDuration,
      trimPoints: {
        startTime: clip.startTime,
        endTime: clip.endTime,
      },
      currentPlayheadTime: clip.startTime,
      fullTranscriptionSegments: fullSegments,
      editedCaptions: [],
      hasUserEditedTranscription: false,
    });

    // Initialize captions from transcription (if available)
    // Only filter captions for initial display, but keep ALL segments in clip.transcription
    if (clip.transcription && clip.transcription.segments.length > 0) {
      console.log("[Store] Initializing captions from transcription:", {
        totalSegments: clip.transcription.segments.length,
        segmentTimeRange: `${clip.transcription.segments[0].start.toFixed(1)}s - ${clip.transcription.segments[clip.transcription.segments.length - 1].end.toFixed(1)}s`,
        clipRange: `${clip.startTime.toFixed(1)}s - ${clip.endTime.toFixed(1)}s`,
      });

      // Filter to get segments that overlap with the INITIAL trim points
      const overlappingSegments = clip.transcription.segments.filter(
        (segment) => segment.start < clip.endTime && segment.end > clip.startTime
      );

      console.log("[Store] Creating initial captions:", {
        totalSegments: clip.transcription.segments.length,
        overlappingSegments: overlappingSegments.length,
      });

      // Use last edited style if available, otherwise use default
      const { lastEditedCaptionStyle } = get();
      const defaultStyle = getDefaultCaptionStyle();
      const captionStyle = lastEditedCaptionStyle || defaultStyle;
      const captionPosition = getDefaultCaptionPosition();

      const captions: Caption[] = overlappingSegments.map((segment, index) => ({
        id: `caption-${index}`,
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        position: { ...captionPosition },
        style: {
          ...captionStyle,
          padding: captionStyle.padding
            ? { ...captionStyle.padding }
            : getDefaultCaptionStyle().padding!,
          animation: captionStyle.animation ? { ...captionStyle.animation } : undefined,
          shadow: captionStyle.shadow ? { ...captionStyle.shadow } : undefined,
          keywordHighlights: captionStyle.keywordHighlights
            ? [...captionStyle.keywordHighlights]
            : undefined,
        },
        isVisible: true,
        language: segment.language,
        wordTimestamps: segment.words,
      }));

      set({ captions });
    } else {
      // No transcription, start with empty captions
      console.log("[Store] No transcription available, starting with empty captions");
      set({ captions: [] });
    }
  },

  updateClipMetadata: (metadata) => {
    const { currentClip } = get();
    if (!currentClip) return;
    set({
      currentClip: {
        ...currentClip,
        metadata: {
          ...currentClip.metadata,
          ...metadata,
        },
      },
    });
  },

  setSourceVideoDuration: (duration) => {
    const { trimPoints } = get();
    // Only update duration, preserve trim points if they're valid
    // Only clamp trim points if they exceed the actual video duration
    let newStartTime = trimPoints.startTime;
    let newEndTime = trimPoints.endTime;

    // Clamp start time to valid range [0, duration]
    if (newStartTime < 0) {
      newStartTime = 0;
    } else if (newStartTime > duration) {
      newStartTime = Math.max(0, duration - 0.1);
    }

    // Clamp end time to valid range [startTime + 0.1, duration]
    if (newEndTime <= newStartTime) {
      newEndTime = Math.min(duration, newStartTime + 0.1);
    } else if (newEndTime > duration) {
      newEndTime = duration;
    }

    // Only update trim points if they were actually changed
    const needsUpdate = newStartTime !== trimPoints.startTime || newEndTime !== trimPoints.endTime;

    if (needsUpdate) {
      const newTrimPoints = {
        startTime: newStartTime,
        endTime: newEndTime,
      };
      set({
        sourceVideoDuration: duration,
        trimPoints: newTrimPoints,
      });
      // Filter captions based on new trim points
      const { captions } = get();
      const filteredCaptions = filterVisibleCaptions(captions, newTrimPoints);
      set({ captions: filteredCaptions });
    } else {
      // Just update duration, keep trim points as-is
      set({ sourceVideoDuration: duration });
    }
  },

  setTrimPoints: (trimPoints) => {
    const {
      captions,
      editedCaptions,
      currentClip,
      fullTranscriptionSegments,
      hasUserEditedTranscription,
    } = get();

    console.log("[Store] setTrimPoints called:", {
      startTime: trimPoints.startTime,
      endTime: trimPoints.endTime,
      hasTranscription: !!currentClip?.transcription,
      currentCaptionsCount: captions.length,
      hasUserEditedTranscription,
      sourceVideoDuration: get().sourceVideoDuration,
    });

    type SegmentLike = {
      text: string;
      start: number;
      end: number;
      language?: "ar" | "en";
      words?: Array<{ text: string; start: number; end: number }>;
    };

    let allSegments: SegmentLike[] = [];

    // First try sessionStorage, then localStorage (full video transcription)
    if (typeof window !== "undefined") {
      try {
        let raw = window.sessionStorage.getItem("reelify_segments");
        let source = "sessionStorage";
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
              .filter((seg: SegmentLike) => seg.text.length > 0);
            if (source === "localStorage") {
              window.sessionStorage.setItem("reelify_segments", raw);
            }
          }
        }
      } catch (error) {
        console.warn("[Store] Failed to read segments from storage:", error);
      }
    }

    if (allSegments.length === 0 && currentClip?.transcription?.segments) {
      allSegments = currentClip.transcription.segments.map((seg) => ({
        text: String(seg.text || "").trim(),
        start: Number(seg.start) || 0,
        end: Number(seg.end) || 0,
        language:
          seg.language || ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as "ar" | "en"),
      }));
    }

    // Prefer wider segment list for fullTranscriptionSegments
    const fullMin = fullTranscriptionSegments.length
      ? Math.min(...fullTranscriptionSegments.map((s) => s.start))
      : Infinity;
    const fullMax = fullTranscriptionSegments.length
      ? Math.max(...fullTranscriptionSegments.map((s) => s.end))
      : -Infinity;
    const allMin = allSegments.length > 0 ? Math.min(...allSegments.map((s) => s.start)) : Infinity;
    const allMax = allSegments.length > 0 ? Math.max(...allSegments.map((s) => s.end)) : -Infinity;
    if (
      allSegments.length > 0 &&
      (allMin < fullMin || allMax > fullMax || fullTranscriptionSegments.length === 0)
    ) {
      set({ fullTranscriptionSegments: [...allSegments] });
    }

    const sourceSegments =
      get().fullTranscriptionSegments.length > 0 ? get().fullTranscriptionSegments : allSegments;

    const defaultStyle = getDefaultCaptionStyle();
    const existingStyle =
      captions.length > 0 ? captions[0].style : defaultStyle;
    const existingPosition = captions.length > 0 ? captions[0].position : getDefaultCaptionPosition();

    const segmentsToCaptions = (
      segs: SegmentLike[],
      trim: TrimPoints,
      idPrefix: string
    ): Caption[] =>
      segs
        .filter((s) => s.start < trim.endTime && s.end > trim.startTime)
        .map((segment, index) => ({
          id: `${idPrefix}-${index}`,
          text: segment.text,
          startTime: segment.start,
          endTime: segment.end,
          position: { ...existingPosition },
          style: {
            ...existingStyle,
            padding: existingStyle.padding ? { ...existingStyle.padding } : undefined,
            animation: existingStyle.animation ? { ...existingStyle.animation } : undefined,
            shadow: existingStyle.shadow ? { ...existingStyle.shadow } : undefined,
            keywordHighlights: existingStyle.keywordHighlights
              ? [...existingStyle.keywordHighlights]
              : undefined,
          },
          isVisible: true,
          language: segment.language || "ar",
          wordTimestamps: segment.words,
        }));

    const editSource = editedCaptions.length > 0 ? editedCaptions : captions;

    if (hasUserEditedTranscription && editSource.length > 0) {
      // Preserve user edits: keep captions overlapping new trim, add source segments only for gaps
      const kept = editSource
        .filter((c) => c.startTime < trimPoints.endTime && c.endTime > trimPoints.startTime)
        .map((c) => ({ ...c, isVisible: true }))
        .sort((a, b) => a.startTime - b.startTime);

      const gapCaptions: Caption[] = [];
      const trimStart = trimPoints.startTime;
      const trimEnd = trimPoints.endTime;

      if (kept.length === 0) {
        const fromSource = segmentsToCaptions(
          sourceSegments,
          trimPoints,
          `caption-gap-${trimStart.toFixed(1)}`
        );
        gapCaptions.push(...fromSource);
      } else {
        const minStart = kept[0].startTime;
        if (trimStart < minStart && sourceSegments.length > 0) {
          const gapSegs = sourceSegments.filter((s) => s.start < minStart && s.end > trimStart);
          gapSegs.forEach((seg, i) => {
            gapCaptions.push({
              id: `caption-gap-start-${i}`,
              text: seg.text,
              startTime: seg.start,
              endTime: seg.end,
              position: existingPosition,
              style: existingStyle,
              isVisible: true,
              language: seg.language || "ar",
            });
          });
        }
        for (let i = 0; i < kept.length - 1; i++) {
          const endCur = kept[i].endTime;
          const startNext = kept[i + 1].startTime;
          if (endCur < startNext - 0.01 && sourceSegments.length > 0) {
            const gapSegs = sourceSegments.filter((s) => s.start < startNext && s.end > endCur);
            gapSegs.forEach((seg, j) => {
              gapCaptions.push({
                id: `caption-gap-mid-${i}-${j}`,
                text: seg.text,
                startTime: seg.start,
                endTime: seg.end,
                position: existingPosition,
                style: existingStyle,
                isVisible: true,
                language: seg.language || "ar",
              });
            });
          }
        }
        const maxEnd = kept[kept.length - 1].endTime;
        if (maxEnd < trimEnd && sourceSegments.length > 0) {
          const gapSegs = sourceSegments.filter((s) => s.start < trimEnd && s.end > maxEnd);
          gapSegs.forEach((seg, i) => {
            gapCaptions.push({
              id: `caption-gap-end-${i}`,
              text: seg.text,
              startTime: seg.start,
              endTime: seg.end,
              position: existingPosition,
              style: existingStyle,
              isVisible: true,
              language: seg.language || "ar",
            });
          });
        }
      }

      const merged = [...kept, ...gapCaptions].sort((a, b) => a.startTime - b.startTime);
      const withIds = merged.map((c, i) => ({
        ...c,
        id: `caption-${trimStart.toFixed(1)}-${i}`,
      }));
      set({
        trimPoints: {
          startTime: trimPoints.startTime,
          endTime: trimPoints.endTime,
        },
        captions: withIds,
      });
      return;
    }

    if (sourceSegments.length > 0) {
      const overlappingSegments = sourceSegments.filter(
        (s) => s.start < trimPoints.endTime && s.end > trimPoints.startTime
      );
      const newCaptions: Caption[] = overlappingSegments.map((segment, index) => ({
        id: `caption-${trimPoints.startTime.toFixed(1)}-${index}`,
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        position: existingPosition,
        style: existingStyle,
        isVisible: true,
        language: segment.language || "ar",
        wordTimestamps: segment.words,
      }));
      set({
        trimPoints: {
          startTime: trimPoints.startTime,
          endTime: trimPoints.endTime,
        },
        captions: newCaptions,
      });
    } else {
      // No transcription available - just filter existing captions
      console.warn("[Store] No segments available, filtering existing captions only");
      const filteredCaptions = filterVisibleCaptions(captions, trimPoints);
      console.log("[Store] Filtered captions:", {
        originalCount: captions.length,
        filteredCount: filteredCaptions.length,
        visibleCount: filteredCaptions.filter((c) => c.isVisible).length,
      });

      // Update store with new trim points and filtered captions
      set({
        trimPoints: { ...trimPoints },
        captions: [...filteredCaptions],
      });
    }
  },

  updateTrimStart: (startTime) => {
    const { trimPoints } = get();
    const newTrimPoints = {
      ...trimPoints,
      startTime: Math.max(0, Math.min(startTime, trimPoints.endTime - 0.1)),
    };
    get().setTrimPoints(newTrimPoints);
  },

  updateTrimEnd: (endTime) => {
    const { trimPoints, sourceVideoDuration } = get();
    const newTrimPoints = {
      ...trimPoints,
      endTime: Math.min(sourceVideoDuration, Math.max(endTime, trimPoints.startTime + 0.1)),
    };
    get().setTrimPoints(newTrimPoints);
  },

  setCaptions: (captions) => {
    const { trimPoints } = get();
    const filteredCaptions = filterVisibleCaptions(captions, trimPoints);
    set({ captions: filteredCaptions, editedCaptions: captions });
  },

  updateCaption: (id, updates) => {
    const { captions } = get();
    const updatedCaptions = captions.map((caption) =>
      caption.id === id ? { ...caption, ...updates } : caption
    );
    // Don't re-filter when updating - just update the caption
    set({ captions: updatedCaptions });
  },

  updateCaptionPosition: (id, position) => {
    const { captions } = get();
    const updatedCaptions = captions.map((caption) =>
      caption.id === id ? { ...caption, position: { ...position } } : caption
    );
    set({ captions: updatedCaptions });
  },

  updateCaptionStyle: (id, style) => {
    const { captions, selectedCaptionId } = get();

    // Update the specific caption
    const updatedCaptions = captions.map((caption) =>
      caption.id === id ? { ...caption, style: { ...caption.style, ...style } } : caption
    );
    // Track the last edited caption style for new captions
    const editedCaption = updatedCaptions.find((c) => c.id === id);
    if (editedCaption) {
      const newStyle = editedCaption.style;
      // Apply the same style to ALL other captions to ensure consistency
      // IMPORTANT: Preserve each caption's position - only update style properties
      const allUpdatedCaptions = updatedCaptions.map((caption) => {
        if (caption.id === id) {
          return caption; // Already updated
        }
        // Apply the same style to all other captions, but preserve their individual positions
        return {
          ...caption,
          position: { ...caption.position }, // Preserve individual position
          style: {
            ...newStyle,
            // Deep copy nested objects
            padding: newStyle.padding ? { ...newStyle.padding } : undefined,
            animation: newStyle.animation ? { ...newStyle.animation } : undefined,
            shadow: newStyle.shadow ? { ...newStyle.shadow } : undefined,
            keywordHighlights: newStyle.keywordHighlights
              ? [...newStyle.keywordHighlights]
              : undefined,
            // Ensure maxWidth and customHeight are applied consistently
            maxWidth: newStyle.maxWidth,
            customHeight: newStyle.customHeight,
          },
        };
      });

      // CRITICAL: Preserve selectedCaptionId - don't clear it when updating styles
      // The selected caption should still exist since we're just updating styles, not removing captions
      set({
        captions: allUpdatedCaptions,
        lastEditedCaptionStyle: newStyle,
        // Explicitly preserve selectedCaptionId - don't change it
        selectedCaptionId: selectedCaptionId,
      });
    } else {
      set({ captions: updatedCaptions });
    }
  },

  updateCaptionStyleForIds: (ids, style) => {
    const { captions } = get();
    const idSet = new Set(ids);
    const updatedCaptions = captions.map((caption) =>
      idSet.has(caption.id)
        ? { ...caption, style: { ...caption.style, ...style } }
        : caption
    );
    set({ captions: updatedCaptions });
  },

  setSelectedCaptionId: (id) => {
    set({
      selectedCaptionId: id,
      selectedCaptionIds: id ? [id] : [],
    });
  },

  setSelectedCaptionIds: (ids) => {
    set({
      selectedCaptionIds: ids,
      selectedCaptionId: ids.length > 0 ? ids[0] : null,
    });
  },

  setSelectedCaptionHeightInVideo: (height) => {
    set({ selectedCaptionHeightInVideo: height });
  },

  updateCaptionStartEnd: (id, { startTime, endTime }) => {
    const { captions, trimPoints } = get();
    const minDuration = 0.1;
    const clampedStart = Math.max(
      trimPoints.startTime,
      Math.min(startTime, trimPoints.endTime - minDuration)
    );
    const clampedEnd = Math.min(
      trimPoints.endTime,
      Math.max(endTime, clampedStart + minDuration)
    );
    const updatedCaptions = captions.map((c) =>
      c.id === id ? { ...c, startTime: clampedStart, endTime: clampedEnd } : c
    );
    set({ captions: updatedCaptions });
  },

  splitCaptionAtPlayhead: (captionId) => {
    const { captions, currentPlayheadTime } = get();
    const cap = captions.find((c) => c.id === captionId);
    if (!cap || currentPlayheadTime <= cap.startTime || currentPlayheadTime >= cap.endTime) return;
    const words = cap.text.trim().split(/\s+/);
    if (words.length < 2) return;
    const duration = cap.endTime - cap.startTime;
    const ratio = (currentPlayheadTime - cap.startTime) / duration;
    const splitIndex = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
    const text1 = words.slice(0, splitIndex).join(" ");
    const text2 = words.slice(splitIndex).join(" ");
    const midTime = cap.startTime + (duration * splitIndex) / words.length;
    const newId1 = `${cap.id}-a`;
    const newId2 = `${cap.id}-b`;
    const newCaptions: Caption[] = [
      { ...cap, id: newId1, text: text1, endTime: midTime },
      { ...cap, id: newId2, text: text2, startTime: midTime },
    ];
    const updatedCaptions = captions
      .filter((c) => c.id !== captionId)
      .concat(newCaptions)
      .sort((a, b) => a.startTime - b.startTime);
    set({
      captions: updatedCaptions,
      selectedCaptionId: newId1,
      selectedCaptionIds: [newId1],
    });
  },

  mergeCaptions: (ids) => {
    if (ids.length < 2) return;
    const { captions } = get();
    const toMerge = ids
      .map((id) => captions.find((c) => c.id === id))
      .filter((c): c is Caption => !!c)
      .sort((a, b) => a.startTime - b.startTime);
    if (toMerge.length < 2) return;
    const first = toMerge[0];
    const last = toMerge[toMerge.length - 1];
    const merged: Caption = {
      ...first,
      id: `merged-${first.id}-${Date.now()}`,
      text: toMerge.map((c) => c.text).join(" "),
      startTime: first.startTime,
      endTime: last.endTime,
    };
    const updatedCaptions = captions
      .filter((c) => !ids.includes(c.id))
      .concat(merged)
      .sort((a, b) => a.startTime - b.startTime);
    set({
      captions: updatedCaptions,
      selectedCaptionId: merged.id,
      selectedCaptionIds: [merged.id],
    });
  },

  shiftCaptions: (ids, deltaMs) => {
    const { captions, trimPoints } = get();
    const delta = deltaMs / 1000;
    const updatedCaptions = captions.map((c) => {
      if (!ids.includes(c.id)) return c;
      const duration = c.endTime - c.startTime;
      const newStart = Math.max(
        trimPoints.startTime,
        Math.min(c.startTime + delta, trimPoints.endTime - duration)
      );
      const newEnd = Math.min(trimPoints.endTime, newStart + duration);
      return { ...c, startTime: newStart, endTime: newEnd };
    });
    set({ captions: updatedCaptions });
  },

  setCurrentPlayheadTime: (time) => {
    set({ currentPlayheadTime: Math.max(0, time) });
  },

  setIsPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  setIsExporting: (exporting) => {
    set({ isExporting: exporting });
  },

  setExportProgress: (progress) => {
    set({ exportProgress: Math.max(0, Math.min(100, progress)) });
  },

  setTranscriptionState: (state) => {
    set({ transcriptionState: state });
  },

  setShowSafeAreas: (show) => {
    set({ showSafeAreas: show });
  },

  setExportFormat: (format) => {
    set({ exportFormat: format });
  },

  setIncludeCaptionsForExport: (value) => {
    set({ includeCaptionsForExport: value });
  },

  setIsEditingTranscription: (editing) => {
    set({ isEditingTranscription: editing });
  },

  setFullTranscriptionSegments: (segments) => {
    set({ fullTranscriptionSegments: segments });
  },

  setHasUserEditedTranscription: (value) => {
    set({ hasUserEditedTranscription: value });
  },

  restoreOriginalTranscriptionForCurrentTrim: () => {
    const { trimPoints, fullTranscriptionSegments, currentClip, captions } = get();
    const sourceSegments =
      fullTranscriptionSegments.length > 0
        ? fullTranscriptionSegments
        : (currentClip?.transcription?.segments?.map((seg) => ({
            text: String(seg.text || "").trim(),
            start: Number(seg.start) || 0,
            end: Number(seg.end) || 0,
            language:
              seg.language ||
              ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as "ar" | "en"),
            words: seg.words,
          })) ?? []);
    if (sourceSegments.length === 0) return;
    const defaultStyle = getDefaultCaptionStyle();
    const existingStyle =
      captions.length > 0 ? captions[0].style : defaultStyle;
    const existingPosition = captions.length > 0 ? captions[0].position : getDefaultCaptionPosition();
    const overlapping = sourceSegments.filter(
      (s) => s.start < trimPoints.endTime && s.end > trimPoints.startTime
    );
    const newCaptions: Caption[] = overlapping.map((segment, index) => ({
      id: `caption-restore-${index}`,
      text: segment.text,
      startTime: segment.start,
      endTime: segment.end,
      position: existingPosition,
      style: existingStyle,
      isVisible: true,
      language: segment.language || "ar",
      wordTimestamps: segment.words,
    }));
    set({
      captions: newCaptions,
      editedCaptions: [],
      hasUserEditedTranscription: false,
    });
  },

  reset: () => {
    set(initialState);
  },
}));
