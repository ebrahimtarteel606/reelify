import { create } from "zustand";
import {
  ReelClipInput,
  Caption,
  CaptionStyle,
  TrimPoints,
  TranscriptionState,
} from "@/types";
import { filterVisibleCaptions } from "@/lib/utils/reelEditorUtils";

// Default caption style
const getDefaultCaptionStyle = (): CaptionStyle => ({
  fontSize: 48,
  fontFamily: "Arial",
  color: "#FFFFFF",
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  textAlign: "center",
  padding: { top: 10, right: 20, bottom: 10, left: 20 },
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
  selectedCaptionId: string | null;
  lastEditedCaptionStyle: Caption["style"] | null; // Track last edited caption style for new captions

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
  }>;
  hasUserEditedTranscription: boolean;

  // Actions
  setCurrentClip: (clip: ReelClipInput) => void;
  updateClipMetadata: (metadata: {
    title?: string;
    description?: string;
  }) => void;
  setSourceVideoDuration: (duration: number) => void;
  setTrimPoints: (trimPoints: TrimPoints) => void;
  updateTrimStart: (startTime: number) => void;
  updateTrimEnd: (endTime: number) => void;
  setCaptions: (captions: Caption[]) => void;
  updateCaption: (id: string, updates: Partial<Caption>) => void;
  updateCaptionPosition: (
    id: string,
    position: { x: number; y: number },
  ) => void;
  updateCaptionStyle: (id: string, style: Partial<Caption["style"]>) => void;
  setSelectedCaptionId: (id: string | null) => void;
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
    }>,
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
  selectedCaptionId: null,
  lastEditedCaptionStyle: null,
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

    // Persist full transcription segments for extend-trim and restore-original
    const fullSegments =
      clip.transcription?.segments?.map((seg) => ({
        text: String(seg.text || "").trim(),
        start: Number(seg.start) || 0,
        end: Number(seg.end) || 0,
        language:
          seg.language ||
          ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as
            | "ar"
            | "en"),
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
        (segment) =>
          segment.start < clip.endTime && segment.end > clip.startTime,
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
        position: { ...captionPosition }, // Deep copy position
        style: {
          ...captionStyle,
          padding: captionStyle.padding
            ? { ...captionStyle.padding }
            : { top: 10, right: 20, bottom: 10, left: 20 },
          // Deep copy nested objects
          animation: captionStyle.animation
            ? { ...captionStyle.animation }
            : undefined,
          shadow: captionStyle.shadow ? { ...captionStyle.shadow } : undefined,
          keywordHighlights: captionStyle.keywordHighlights
            ? [...captionStyle.keywordHighlights]
            : undefined,
          fontSize: 48,
          fontFamily: "Arial",
          color: "#FFFFFF",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          textAlign: "center",
        },
        isVisible: true,
        language: segment.language,
      }));

      set({ captions });
    } else {
      // No transcription, start with empty captions
      console.log(
        "[Store] No transcription available, starting with empty captions",
      );
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
    const needsUpdate =
      newStartTime !== trimPoints.startTime ||
      newEndTime !== trimPoints.endTime;

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
                  ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as
                    | "ar"
                    | "en"),
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
          seg.language ||
          ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as
            | "ar"
            | "en"),
      }));
    }

    // Prefer wider segment list for fullTranscriptionSegments
    const fullMin = fullTranscriptionSegments.length
      ? Math.min(...fullTranscriptionSegments.map((s) => s.start))
      : Infinity;
    const fullMax = fullTranscriptionSegments.length
      ? Math.max(...fullTranscriptionSegments.map((s) => s.end))
      : -Infinity;
    const allMin =
      allSegments.length > 0
        ? Math.min(...allSegments.map((s) => s.start))
        : Infinity;
    const allMax =
      allSegments.length > 0
        ? Math.max(...allSegments.map((s) => s.end))
        : -Infinity;
    if (
      allSegments.length > 0 &&
      (allMin < fullMin ||
        allMax > fullMax ||
        fullTranscriptionSegments.length === 0)
    ) {
      set({ fullTranscriptionSegments: [...allSegments] });
    }

    const sourceSegments =
      get().fullTranscriptionSegments.length > 0
        ? get().fullTranscriptionSegments
        : allSegments;

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
    const existingPosition =
      captions.length > 0 ? captions[0].position : { x: 540, y: 1500 };

    const segmentsToCaptions = (
      segs: SegmentLike[],
      trim: TrimPoints,
      idPrefix: string,
    ): Caption[] =>
      segs
        .filter((s) => s.start < trim.endTime && s.end > trim.startTime)
        .map((segment, index) => ({
          id: `${idPrefix}-${index}`,
          text: segment.text,
          startTime: segment.start,
          endTime: segment.end,
          position: { ...existingPosition }, // Deep copy position
          style: {
            ...existingStyle,
            padding: existingStyle.padding
              ? { ...existingStyle.padding }
              : undefined,
            // Deep copy nested objects
            animation: existingStyle.animation
              ? { ...existingStyle.animation }
              : undefined,
            shadow: existingStyle.shadow
              ? { ...existingStyle.shadow }
              : undefined,
            keywordHighlights: existingStyle.keywordHighlights
              ? [...existingStyle.keywordHighlights]
              : undefined,
          },
          isVisible: true,
          language: segment.language || "ar",
        }));

    if (hasUserEditedTranscription && captions.length > 0) {
      // Preserve user edits: keep captions overlapping new trim, add source segments only for gaps
      const kept = captions
        .filter(
          (c) =>
            c.startTime < trimPoints.endTime &&
            c.endTime > trimPoints.startTime,
        )
        .map((c) => ({ ...c, isVisible: true }))
        .sort((a, b) => a.startTime - b.startTime);

      const gapCaptions: Caption[] = [];
      const trimStart = trimPoints.startTime;
      const trimEnd = trimPoints.endTime;

      if (kept.length === 0) {
        const fromSource = segmentsToCaptions(
          sourceSegments,
          trimPoints,
          `caption-gap-${trimStart.toFixed(1)}`,
        );
        gapCaptions.push(...fromSource);
      } else {
        const minStart = kept[0].startTime;
        if (trimStart < minStart && sourceSegments.length > 0) {
          const gapSegs = sourceSegments.filter(
            (s) => s.start < minStart && s.end > trimStart,
          );
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
            const gapSegs = sourceSegments.filter(
              (s) => s.start < startNext && s.end > endCur,
            );
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
          const gapSegs = sourceSegments.filter(
            (s) => s.start < trimEnd && s.end > maxEnd,
          );
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

      const merged = [...kept, ...gapCaptions].sort(
        (a, b) => a.startTime - b.startTime,
      );
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
        (s) => s.start < trimPoints.endTime && s.end > trimPoints.startTime,
      );
      const newCaptions: Caption[] = overlappingSegments.map(
        (segment, index) => ({
          id: `caption-${trimPoints.startTime.toFixed(1)}-${index}`,
          text: segment.text,
          startTime: segment.start,
          endTime: segment.end,
          position: existingPosition,
          style: existingStyle,
          isVisible: true,
          language: segment.language || "ar",
        }),
      );
      set({
        trimPoints: {
          startTime: trimPoints.startTime,
          endTime: trimPoints.endTime,
        },
        captions: newCaptions,
      });
    } else {
      // No transcription available - just filter existing captions
      console.warn(
        "[Store] No segments available, filtering existing captions only",
      );
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
      endTime: Math.min(
        sourceVideoDuration,
        Math.max(endTime, trimPoints.startTime + 0.1),
      ),
    };
    get().setTrimPoints(newTrimPoints);
  },

  setCaptions: (captions) => {
    const { trimPoints } = get();
    const filteredCaptions = filterVisibleCaptions(captions, trimPoints);
    set({ captions: filteredCaptions });
  },

  updateCaption: (id, updates) => {
    const { captions } = get();
    const updatedCaptions = captions.map((caption) =>
      caption.id === id ? { ...caption, ...updates } : caption,
    );
    // Don't re-filter when updating - just update the caption
    set({ captions: updatedCaptions });
  },

  updateCaptionPosition: (id, position) => {
    const { captions } = get();
    // Apply the same position to ALL captions to ensure consistency
    const updatedCaptions = captions.map((caption) => ({
      ...caption,
      position: { ...position }, // Apply same position to all captions
    }));
    set({ captions: updatedCaptions });
  },

  updateCaptionStyle: (id, style) => {
    const { captions, selectedCaptionId } = get();

    // Update the specific caption
    const updatedCaptions = captions.map((caption) =>
      caption.id === id
        ? { ...caption, style: { ...caption.style, ...style } }
        : caption,
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
            animation: newStyle.animation
              ? { ...newStyle.animation }
              : undefined,
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

  setSelectedCaptionId: (id) => {
    set({ selectedCaptionId: id });
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
    const { trimPoints, fullTranscriptionSegments, currentClip, captions } =
      get();
    const sourceSegments =
      fullTranscriptionSegments.length > 0
        ? fullTranscriptionSegments
        : (currentClip?.transcription?.segments?.map((seg) => ({
            text: String(seg.text || "").trim(),
            start: Number(seg.start) || 0,
            end: Number(seg.end) || 0,
            language:
              seg.language ||
              ((/[\u0600-\u06FF]/.test(String(seg.text)) ? "ar" : "en") as
                | "ar"
                | "en"),
          })) ?? []);
    if (sourceSegments.length === 0) return;
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
    const existingPosition =
      captions.length > 0 ? captions[0].position : { x: 540, y: 1500 };
    const overlapping = sourceSegments.filter(
      (s) => s.start < trimPoints.endTime && s.end > trimPoints.startTime,
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
    }));
    set({ captions: newCaptions, hasUserEditedTranscription: false });
  },

  reset: () => {
    set(initialState);
  },
}));
