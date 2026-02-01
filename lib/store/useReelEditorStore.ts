import { create } from "zustand";
import {
  ReelClipInput,
  Caption,
  TrimPoints,
  TranscriptionState,
} from "@/types";
import { filterVisibleCaptions } from "@/lib/utils/reelEditorUtils";

interface ReelEditorState {
  // Current clip data
  currentClip: ReelClipInput | null;
  sourceVideoDuration: number;

  // Trim points
  trimPoints: TrimPoints;

  // Captions
  captions: Caption[];
  selectedCaptionId: string | null;

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
  exportFormat: 'landscape' | 'zoom';

  // Actions
  setCurrentClip: (clip: ReelClipInput) => void;
  updateClipMetadata: (metadata: { title?: string; description?: string }) => void;
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
  setExportFormat: (format: 'landscape' | 'zoom') => void;
  reset: () => void;
}

const initialState = {
  currentClip: null,
  sourceVideoDuration: 0,
  trimPoints: { startTime: 0, endTime: 0 },
  captions: [],
  selectedCaptionId: null,
  currentPlayheadTime: 0,
  isPlaying: false,
  isExporting: false,
  exportProgress: 0,
  transcriptionState: { status: "idle" as const },
  showSafeAreas: false,
  exportFormat: 'zoom' as const,
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

      const captions: Caption[] = overlappingSegments.map((segment, index) => ({
        id: `caption-${index}`,
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        position: { x: 540, y: 1500 }, // Default position (center-bottom for 9:16)
        style: {
          fontSize: 48,
          fontFamily: "Arial",
          color: "#FFFFFF",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          textAlign: "center",
          padding: { top: 10, right: 20, bottom: 10, left: 20 },
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
    const { captions, currentClip } = get();

    console.log("[Store] setTrimPoints called:", {
      startTime: trimPoints.startTime,
      endTime: trimPoints.endTime,
      hasTranscription: !!currentClip?.transcription,
      currentCaptionsCount: captions.length,
      sourceVideoDuration: get().sourceVideoDuration,
    });

    // ALWAYS try to get ALL segments from full video transcription
    // Priority: sessionStorage > currentClip.transcription
    let allSegments: Array<{
      text: string;
      start: number;
      end: number;
      language?: "ar" | "en";
    }> = [];

    // First try sessionStorage, then localStorage (full video transcription)
    if (typeof window !== "undefined") {
      try {
        let raw = window.sessionStorage.getItem("reelify_segments");
        let source = "sessionStorage";

        // Fallback to localStorage (cross-tab)
        if (!raw) {
          raw = window.localStorage.getItem("reelify_segments");
          source = "localStorage";
        }

        console.log(
          `[Store] Raw ${source} data:`,
          raw ? `Found ${raw.length} chars` : "null",
        );

        if (raw) {
          const data = JSON.parse(raw);
          console.log(`[Store] Parsed ${source} data:`, {
            isArray: Array.isArray(data),
            length: Array.isArray(data) ? data.length : 0,
          });
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
              .filter((seg) => seg.text.length > 0);
            console.log(`[Store] Loaded segments from ${source}:`, {
              count: allSegments.length,
              timeRange:
                allSegments.length > 0
                  ? `${allSegments[0].start.toFixed(1)}s - ${allSegments[allSegments.length - 1].end.toFixed(1)}s`
                  : "N/A",
              firstSegment: allSegments[0]
                ? `${allSegments[0].start.toFixed(1)}-${allSegments[0].end.toFixed(1)}: ${allSegments[0].text.substring(0, 30)}`
                : "N/A",
              lastSegment:
                allSegments.length > 0
                  ? `${allSegments[allSegments.length - 1].start.toFixed(1)}-${allSegments[allSegments.length - 1].end.toFixed(1)}: ${allSegments[allSegments.length - 1].text.substring(0, 30)}`
                  : "N/A",
            });

            // Ensure both storages have the data
            if (source === "localStorage") {
              window.sessionStorage.setItem("reelify_segments", raw);
            }
          }
        } else {
          console.warn(
            "[Store] No segments found in sessionStorage or localStorage",
          );
        }
      } catch (error) {
        console.warn("[Store] Failed to read segments from storage:", error);
      }
    }

    // Fallback to currentClip transcription (should also have full video transcription)
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
      console.log(
        "[Store] Loaded segments from currentClip.transcription:",
        allSegments.length,
      );
    }

    // If we have segments, ALWAYS regenerate captions based on new trim range
    if (allSegments.length > 0) {
      // Filter segments that overlap with the NEW trim range
      // Use overlap detection: segment overlaps if it starts before trim end AND ends after trim start
      const overlappingSegments = allSegments.filter(
        (segment) =>
          segment.start < trimPoints.endTime &&
          segment.end > trimPoints.startTime,
      );

      console.log("[Store] Regenerating captions from full transcription:", {
        totalAvailableSegments: allSegments.length,
        overlappingSegments: overlappingSegments.length,
        newTrimRange: `${trimPoints.startTime.toFixed(2)}s - ${trimPoints.endTime.toFixed(2)}s`,
        segmentTimeRanges: overlappingSegments
          .slice(0, 5)
          .map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)}`),
        segmentTexts: overlappingSegments
          .slice(0, 3)
          .map((s) => s.text.substring(0, 40) + "..."),
      });

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

      const existingPosition =
        captions.length > 0 ? captions[0].position : { x: 540, y: 1500 };

      // Create new captions from overlapping segments
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

      console.log("[Store] Created captions:", {
        count: newCaptions.length,
        firstCaption: newCaptions[0]
          ? {
              text: newCaptions[0].text.substring(0, 40),
              start: newCaptions[0].startTime,
              end: newCaptions[0].endTime,
            }
          : null,
        lastCaption: newCaptions.at(-1)
          ? {
              text: newCaptions.at(-1)!.text.substring(0, 40),
              start: newCaptions.at(-1)!.startTime,
              end: newCaptions.at(-1)!.endTime,
            }
          : null,
      });

      // Update store with new trim points and captions
      // Create new object references to ensure React detects changes
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
    get().updateCaption(id, { position });
  },

  updateCaptionStyle: (id, style) => {
    const { captions } = get();
    const updatedCaptions = captions.map((caption) =>
      caption.id === id
        ? { ...caption, style: { ...caption.style, ...style } }
        : caption,
    );
    set({ captions: updatedCaptions });
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

  reset: () => {
    set(initialState);
  },
}));
