import { Caption, ExportSettings } from '@/types';

/**
 * Convert CSS color (hex or rgba) to FFmpeg color format
 * FFmpeg uses format: 0xRRGGBB or 0xRRGGBB@alpha
 */
function convertColorToFFmpeg(color: string): string {
  if (!color || color === 'transparent') {
    return '';
  }

  // Handle hex format (#RRGGBB or #RGB)
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    // Expand shorthand hex (#RGB -> #RRGGBB)
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    return `0x${hex.toUpperCase()}`;
  }

  // Handle rgba format: rgba(r, g, b, a)
  const rgbaMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0');
    const alpha = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    
    const hexColor = `0x${r}${g}${b}`.toUpperCase();
    
    if (alpha < 1) {
      return `${hexColor}@${alpha}`;
    }
    return hexColor;
  }

  // Handle rgb format: rgb(r, g, b)
  const rgbMatch = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `0x${r}${g}${b}`.toUpperCase();
  }

  // Return as-is for named colors (FFmpeg supports some like 'white', 'black')
  return color;
}

/**
 * Escape text for FFmpeg drawtext filter
 * FFmpeg requires escaping special characters in text
 * 
 * Note: Text inside single quotes only needs ' and \ escaped.
 * Colons inside quoted text don't need escaping.
 */
function escapeTextForFFmpeg(text: string): string {
  // FFmpeg drawtext filter escaping rules for text inside single quotes:
  // - Backslashes need to be escaped as \\
  // - Single quotes need special handling
  return text
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/'/g, "'\\''");    // Escape single quotes (end quote, escaped quote, start quote)
}

/**
 * Apply text transformation
 */
function applyTextTransform(
  text: string,
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
): string {
  if (!transform || transform === 'none') {
    return text;
  }

  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    default:
      return text;
  }
}

/**
 * Build FFmpeg drawtext filter for captions
 * If caption has keyword highlights, returns array of filters (one per segment)
 * Otherwise returns single filter
 */
export function buildCaptionFilter(
  caption: Caption,
  trimStart: number,
  videoWidth: number = 1080,
  videoHeight: number = 1920
): string {
  // Check if we have keyword highlights
  const hasKeywords = caption.style.keywordHighlights && caption.style.keywordHighlights.length > 0;

  if (hasKeywords) {
    return buildCaptionWithKeywordFilters(caption, trimStart, videoWidth, videoHeight);
  }

  return buildSimpleCaptionFilter(caption, trimStart, videoWidth, videoHeight);
}

/**
 * Build simple caption filter (no keyword highlighting)
 */
function buildSimpleCaptionFilter(
  caption: Caption,
  trimStart: number,
  videoWidth: number,
  videoHeight: number
): string {
  // Adjust caption timing relative to trim start
  const captionStart = Math.max(0, caption.startTime - trimStart);
  const captionEnd = Math.max(0, caption.endTime - trimStart);

  // Apply text transform
  let text = applyTextTransform(caption.text, caption.style.textTransform);

  // Escape text for FFmpeg using proper escaping
  const escapedText = escapeTextForFFmpeg(text);

  // Calculate position (FFmpeg uses top-left origin)
  const x = caption.position.x;
  const y = caption.position.y;

  // Convert colors to FFmpeg format
  const fontColor = convertColorToFFmpeg(caption.style.color);

  // Build filter options
  const options: string[] = [
    `text='${escapedText}'`,
    `fontsize=${caption.style.fontSize}`,
    `fontcolor=${fontColor}`,
    `x=${x}`,
    `y=${y}`,
    `enable='between(t,${captionStart},${captionEnd})'`,
  ];

  // Font weight - FFmpeg doesn't support fontweight directly in most builds
  // Would need a bold font file to be specified instead

  if (caption.style.textAlign) {
    options.push(`text_align=${caption.style.textAlign}`);
  }

  if (caption.style.backgroundColor && caption.style.backgroundColor !== 'transparent') {
    const bgColor = convertColorToFFmpeg(caption.style.backgroundColor);
    if (bgColor) {
      options.push(`box=1`);
      options.push(`boxcolor=${bgColor}`);
      // Add some padding around the text box
      options.push(`boxborderw=5`);
    }
  }

  if (caption.style.strokeColor && caption.style.strokeWidth) {
    const borderColor = convertColorToFFmpeg(caption.style.strokeColor);
    options.push(`borderw=${caption.style.strokeWidth}`);
    options.push(`bordercolor=${borderColor}`);
  }

  // Shadow support
  if (caption.style.shadow && (caption.style.shadow.blur > 0 || caption.style.shadow.offsetX !== 0 || caption.style.shadow.offsetY !== 0)) {
    const shadowColor = convertColorToFFmpeg(caption.style.shadow.color);
    options.push(`shadowcolor=${shadowColor}`);
    options.push(`shadowx=${caption.style.shadow.offsetX}`);
    options.push(`shadowy=${caption.style.shadow.offsetY}`);
  }

  // Opacity (alpha channel) - handled via fontcolor with alpha
  if (caption.style.opacity !== undefined && caption.style.opacity < 1) {
    // If fontcolor doesn't already have alpha, add it
    const colorIndex = options.findIndex(opt => opt.startsWith('fontcolor='));
    if (colorIndex !== -1 && !options[colorIndex].includes('@')) {
      options[colorIndex] = `fontcolor=${fontColor}@${caption.style.opacity}`;
    }
  }

  return `drawtext=${options.join(':')}`;
}

/**
 * Build caption filters with keyword highlighting
 * Creates multiple drawtext filters - one for each text segment
 */
function buildCaptionWithKeywordFilters(
  caption: Caption,
  trimStart: number,
  videoWidth: number,
  videoHeight: number
): string {
  // For FFmpeg, keyword highlighting is complex to implement properly
  // We'll render it as a single caption with the base style
  // True multi-colored text within a single caption requires complex filter graphs
  // For now, just render the caption normally
  // TODO: Implement advanced keyword highlighting in FFmpeg if needed
  return buildSimpleCaptionFilter(caption, trimStart, videoWidth, videoHeight);
}

/**
 * Build FFmpeg filter complex for all captions
 */
export function buildCaptionFilters(
  captions: Caption[],
  trimStart: number,
  videoWidth: number = 1080,
  videoHeight: number = 1920
): string {
  const filters = captions
    .filter((caption) => caption.isVisible)
    .map((caption) => buildCaptionFilter(caption, trimStart, videoWidth, videoHeight));

  return filters.join(',');
}

/**
 * Build FFmpeg export command arguments
 * 
 * @param startTime - Start time for trimming
 * @param duration - Duration of the output video
 * @param captions - Array of captions to overlay
 * @param settings - Export quality settings
 * @param inputFile - Input file name in FFmpeg virtual filesystem
 * @param outputFile - Output file name in FFmpeg virtual filesystem
 * @param useStreamCopy - If true and no captions, use stream copy for near-instant trimming
 */
export function buildFFmpegCommand(
  startTime: number,
  duration: number,
  captions: Caption[],
  settings: ExportSettings,
  inputFile: string = 'input.mp4',
  outputFile: string = 'output.mp4',
  useStreamCopy: boolean = false
): string[] {
  const visibleCaptions = captions.filter((caption) => caption.isVisible);
  const hasCaptions = visibleCaptions.length > 0;
  
  // Use stream copy when no captions are needed - this is much faster
  // Stream copy can only cut at keyframes, but for most videos this is acceptable
  const shouldUseStreamCopy = useStreamCopy && !hasCaptions;
  
  // Use INPUT SEEKING (-ss BEFORE -i) for fast seeking
  // This seeks in the input stream without decoding, making it much faster
  // The slight frame inaccuracy at keyframe boundaries is acceptable for most use cases
  const args: string[] = [
    '-ss',
    startTime.toString(),
    '-i',
    inputFile,
    '-t',
    duration.toString(),
  ];

  if (shouldUseStreamCopy) {
    // Stream copy mode - no re-encoding, nearly instant
    // With input seeking (-ss before -i), cuts may be at keyframes but this is fast
    args.push('-c', 'copy');
  } else {
    // Re-encoding mode - needed for filters (scale, captions)
    const [width, height] = settings.resolution.split('x').map(Number);
    const filterParts: string[] = [];
    
    // Add scale filter for resolution first
    filterParts.push(`scale=${width}:${height}`);
    
    // Add caption filters if any (chained after scale)
    if (hasCaptions) {
      const captionFilters = visibleCaptions
        .map((caption) => buildCaptionFilter(caption, startTime, width, height));
      
      if (captionFilters.length > 0) {
        filterParts.push(...captionFilters);
      }
    }

    if (filterParts.length > 0) {
      args.push('-vf', filterParts.join(','));
    }

    // Video codec settings
    args.push('-c:v', settings.videoCodec);
    args.push('-preset', settings.preset);
    args.push('-crf', settings.crf.toString());
    args.push('-r', settings.fps.toString());

    // Audio codec settings
    args.push('-c:a', settings.audioCodec);
    args.push('-b:a', settings.audioBitrate);
  }

  // Output file
  args.push(outputFile);

  return args;
}

/**
 * Get export settings based on quality preset
 * 
 * Note: Using faster presets (ultrafast/veryfast) for FFmpeg WASM performance.
 * FFmpeg WASM is ~10-20x slower than native, so we prioritize speed over compression.
 * Quality impact is minimal - mainly affects file size, not visual quality.
 */
export function getExportSettings(quality: 'low' | 'medium' | 'high' = 'medium'): ExportSettings {
  const presets = {
    low: {
      videoCodec: 'libx264',
      audioCodec: 'aac',
      videoBitrate: '1M',
      audioBitrate: '96k',
      resolution: '720x1280',
      fps: 24,
      preset: 'ultrafast',
      crf: 28,
    },
    medium: {
      videoCodec: 'libx264',
      audioCodec: 'aac',
      videoBitrate: '2M',
      audioBitrate: '128k',
      resolution: '1080x1920',
      fps: 30,
      preset: 'ultrafast',  // Changed from 'medium' for 5-10x faster encoding
      crf: 23,
    },
    high: {
      videoCodec: 'libx264',
      audioCodec: 'aac',
      videoBitrate: '4M',
      audioBitrate: '192k',
      resolution: '1080x1920',
      fps: 30,
      preset: 'veryfast',  // Changed from 'slow' for faster encoding
      crf: 20,  // Slightly adjusted for balance between quality and speed
    },
  };

  return presets[quality];
}
