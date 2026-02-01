export interface ReelClipInput {
  clipId: string;
  videoSourceUrl: string; // URL to the FULL source video file (up to 30 min)
  sourceVideoDuration: number; // Full video duration in seconds
  startTime: number; // Initial start trim point in seconds (from AI pipeline)
  endTime: number; // Initial end trim point in seconds (from AI pipeline)
  transcription?: {
    segments: Array<{
      text: string;
      start: number; // Timestamp in seconds (relative to full video)
      end: number; // Timestamp in seconds (relative to full video)
      language: 'ar' | 'en'; // Arabic or English
    }>;
  };
  metadata?: {
    title?: string;
    description?: string;
  };
}

export interface TranscriptionState {
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
}

export interface CaptionStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  color: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  
  // NEW: Animation
  animation?: {
    type: 'none' | 'fade' | 'slideLeft' | 'slideRight' | 'slideTop' | 'slideBottom' | 'typewriter' | 'scale';
    duration: number; // in seconds
    delay: number; // delay before animation starts
    easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  };
  
  // NEW: Shadow
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
  
  // NEW: Capitalization
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  
  // NEW: Keyword Highlighting
  keywordHighlights?: Array<{
    text: string; // The keyword/phrase to highlight
    color?: string; // Different color for keyword
    backgroundColor?: string;
    fontWeight?: string;
  }>;
}

export interface Caption {
  id: string;
  text: string;
  startTime: number; // Relative to full video
  endTime: number; // Relative to full video
  position: { x: number; y: number };
  style: CaptionStyle;
  isVisible: boolean; // Whether caption is within trim region
  language?: 'ar' | 'en';
}

export interface ReelExportResult {
  clipId: string;
  videoBlob: Blob; // MP4 video file
  videoUrl: string; // Object URL for the blob
  duration: number; // Final duration in seconds
  fileSize: number; // Size in bytes
  exportSettings: {
    startTime: number;
    endTime: number;
    captionStyles: CaptionStyle[];
  };
}

export interface ReelEditorCallbacks {
  onExportSuccess?: (result: ReelExportResult) => void;
  onExportError?: (error: Error) => void;
  onClipLoaded?: (clipId: string) => void;
}

export interface ReelEditorProps extends ReelEditorCallbacks {
  clipData: ReelClipInput;
  theme?: 'light' | 'dark';
  aspectRatio?: '9:16' | '16:9' | '1:1';
  exportQuality?: 'low' | 'medium' | 'high';
}

export interface TrimPoints {
  startTime: number;
  endTime: number;
}

export type ExportFormat = 'portrait' | 'landscape' | 'zoom';
export type ReframingMode = 'none' | 'face' | 'speaker' | 'motion' | 'smart';

export interface ReframingOptions {
  mode: ReframingMode;
  enabled: boolean;
}

export interface ExportFormatOptions {
  format: ExportFormat;
  reframing: ReframingOptions;
}

export interface ExportSettings {
  videoCodec: string;
  audioCodec: string;
  videoBitrate: string;
  audioBitrate: string;
  resolution: string;
  fps: number;
  preset: string;
  crf: number;
  exportWithAnimations?: boolean; // Default: false
  formatOptions?: ExportFormatOptions; // Format and reframing options
}

export interface SafeAreas {
  top: number; // pixels from top
  bottom: number; // pixels from bottom
  left: number; // pixels from left
  right: number; // pixels from right
}

export const DEFAULT_SAFE_AREAS: SafeAreas = {
  top: 100,
  bottom: 100,
  left: 50,
  right: 50,
};
