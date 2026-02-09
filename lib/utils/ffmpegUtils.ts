import { Caption, ExportSettings, ExportFormatOptions, ReframingMode } from "@/types";

/**
 * Convert CSS color (hex or rgba) to FFmpeg color format
 * FFmpeg uses format: 0xRRGGBB or 0xRRGGBB@alpha
 */
function convertColorToFFmpeg(color: string): string {
  if (!color || color === "transparent") {
    return "";
  }

  // Handle hex format (#RRGGBB or #RGB)
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    // Expand shorthand hex (#RGB -> #RRGGBB)
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return `0x${hex.toUpperCase()}`;
  }

  // Handle rgba format: rgba(r, g, b, a)
  const rgbaMatch = color.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i
  );
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(rgbaMatch[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(rgbaMatch[3], 10).toString(16).padStart(2, "0");
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
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, "0");
    return `0x${r}${g}${b}`.toUpperCase();
  }

  // Return as-is for named colors (FFmpeg supports some like 'white', 'black')
  return color;
}

/**
 * Escape text for FFmpeg drawtext filter
 * CRITICAL: FFmpeg drawtext needs double-escaping for special characters
 * because the filter parser strips one level of escaping
 */
function escapeTextForFFmpeg(text: string): string {
  // FFmpeg drawtext filter escaping rules:
  // 1. Backslashes must be quadruple-escaped: \\\\ becomes \\, which becomes \ in output
  // 2. Newlines need to be \\n (double backslash n) to survive filter parsing
  // 3. Other special chars need double escaping too

  return text
    .replace(/\\/g, "\\\\\\\\") // Backslash: \\\\ (4x) -> \\ -> \
    .replace(/'/g, "\\\\'") // Single quote: \\'
    .replace(/:/g, "\\\\:") // Colon: \\:
    .replace(/%/g, "\\\\%") // Percent: \\%
    .replace(/\[/g, "\\\\[") // Opening bracket: \\[
    .replace(/\]/g, "\\\\]") // Closing bracket: \\]
    .replace(/,/g, "\\\\,") // Comma: \\,
    .replace(/;/g, "\\\\;") // Semicolon: \\;
    .replace(/=/g, "\\\\=") // Equals: \\=
    .replace(/\n/g, "\\\\n"); // Newline: \\n -> \n in FFmpeg
}

/**
 * Apply text transformation
 */
function applyTextTransform(
  text: string,
  transform?: "none" | "uppercase" | "lowercase" | "capitalize"
): string {
  if (!transform || transform === "none") {
    return text;
  }

  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
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
  console.log(`[buildCaptionFilter] Building filter for caption "${caption.id}":`, {
    text: caption.text.substring(0, 50),
    isVisible: caption.isVisible,
    startTime: caption.startTime,
    endTime: caption.endTime,
    trimStart,
    videoSize: { width: videoWidth, height: videoHeight },
  });

  // Check if we have keyword highlights
  const hasKeywords = caption.style.keywordHighlights && caption.style.keywordHighlights.length > 0;

  if (hasKeywords) {
    return buildCaptionWithKeywordFilters(caption, trimStart, videoWidth, videoHeight);
  }

  return buildSimpleCaptionFilter(caption, trimStart, videoWidth, videoHeight);
}

/**
 * Split text into segments by script (Arabic vs Latin)
 * Returns array of {text: string, isArabic: boolean}
 */
function splitTextByScript(text: string): Array<{ text: string; isArabic: boolean }> {
  const segments: Array<{ text: string; isArabic: boolean }> = [];
  let currentSegment = "";
  let currentIsArabic: boolean | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isArabic = /[\u0600-\u06FF]/.test(char);
    const isLatin = /[a-zA-Z0-9]/.test(char);

    // Determine script for this character
    let charScript: boolean | null = null;
    if (isArabic) {
      charScript = true;
    } else if (isLatin) {
      charScript = false;
    } else {
      // Punctuation/spaces - preserve them with the current segment
      // This ensures spaces are included in width calculations
      charScript = currentIsArabic !== null ? currentIsArabic : false;
    }

    // Start new segment if script changes (but preserve spaces/punctuation with segments)
    if (currentIsArabic !== null && currentIsArabic !== charScript) {
      // Only create new segment if current segment has content
      if (currentSegment.length > 0) {
        segments.push({ text: currentSegment, isArabic: currentIsArabic });
      }
      currentSegment = char;
      currentIsArabic = charScript;
    } else {
      currentSegment += char;
      currentIsArabic = charScript;
    }
  }

  // Add final segment (preserve even if it's just spaces/punctuation)
  if (currentSegment.length > 0 && currentIsArabic !== null) {
    segments.push({ text: currentSegment, isArabic: currentIsArabic });
  }

  return segments.length > 0 ? segments : [{ text, isArabic: false }];
}

/**
 * Wrap text into multiple lines based on max width for FFmpeg export
 * Returns text with \n line breaks
 * Uses more accurate width estimation based on character types
 */
function wrapTextForFFmpeg(
  text: string,
  fontSize: number,
  fontFamily: string,
  maxWidth: number
): string {
  // Use canvas measureText for accurate width calculation (same as preview)
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      // Create a temporary canvas for text measurement
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // CRITICAL: Use same font settings as preview (ReelCaptionRenderer)
        // This ensures wrapping matches exactly
        // Note: We use the caption's fontFamily for measurement, even for mixed content
        // The actual font files used in FFmpeg will be different (arabic.ttf vs default.ttf)
        // but the measurement should match the preview
        ctx.font = `normal normal ${fontSize}px ${fontFamily}`;

        // Use the same wrapping algorithm as ReelCaptionRenderer
        // This wraps at word boundaries, preserving mixed Arabic/English words together
        const words = text.split(" ");
        const lines: string[] = [];
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const metrics = ctx.measureText(testLine);

          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }

        if (currentLine) {
          lines.push(currentLine);
        }

        const result = lines.length > 0 ? lines.join("\n") : text;
        console.log(`[wrapTextForFFmpeg] Wrapped text into ${lines.length} lines`);

        return result;
      }
    } catch (err) {
      console.warn(
        "[wrapTextForFFmpeg] Failed to use canvas measureText, falling back to estimation:",
        err
      );
    }
  }

  // Fallback: Estimate character width (for server-side or if canvas fails)
  const getCharWidth = (char: string): number => {
    if (char === " ") return fontSize * 0.3;
    // Arabic characters are generally wider
    const isArabic = /[\u0600-\u06FF]/.test(char);
    if (isArabic) return fontSize * 0.7;
    const narrow = /[ilt1|]/i.test(char);
    const wide = /[mwMW]/i.test(char);
    if (narrow) return fontSize * 0.3;
    if (wide) return fontSize * 0.8;
    return fontSize * 0.6;
  };

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    let estimatedWidth = 0;
    for (let i = 0; i < testLine.length; i++) {
      estimatedWidth += getCharWidth(testLine[i]);
    }

    if (estimatedWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const result = lines.length > 0 ? lines.join("\n") : text;
  console.log(`[wrapTextForFFmpeg] Fallback wrapped text into ${lines.length} lines`);

  return result;
}

/**
 * Build simple caption filter (no keyword highlighting)
 * For multi-line text, returns multiple drawtext filters (one per line)
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

  // Skip captions that don't overlap with trim range (endTime <= startTime means no overlap)
  if (captionEnd <= captionStart) {
    console.warn(
      `[buildSimpleCaptionFilter] Skipping caption ${caption.id} - outside trim range:`,
      {
        captionStart: caption.startTime,
        captionEnd: caption.endTime,
        trimStart,
        calculatedStart: captionStart,
        calculatedEnd: captionEnd,
      }
    );
    return ""; // Return empty filter string - will be filtered out
  }

  // Additional validation: ensure caption has text before processing
  if (!caption.text || caption.text.trim().length === 0) {
    console.warn(`[buildSimpleCaptionFilter] Skipping caption ${caption.id} - empty text`);
    return "";
  }

  // Apply text transform
  let text = applyTextTransform(caption.text, caption.style.textTransform);

  // Calculate max width for text wrapping (80% of video width with padding)
  // CRITICAL: Use same calculation as preview (ReelCaptionRenderer)
  const padding = caption.style.padding || {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  const maxTextWidth = videoWidth * 0.8 - padding.left - padding.right;

  // CRITICAL: Wrap text FIRST (like preview), then split into segments per line
  // This ensures wrapping matches the preview exactly
  const wrappedText = wrapTextForFFmpeg(
    text,
    caption.style.fontSize,
    caption.style.fontFamily,
    maxTextWidth
  );
  const lines = wrappedText.split("\n");

  console.log(`[buildSimpleCaptionFilter] Caption text: ${lines.length} lines`);
  console.log(
    `[buildSimpleCaptionFilter] Lines:`,
    lines.map((line, i) => `${i + 1}: "${line.substring(0, 30)}..."`)
  );

  // Calculate position (FFmpeg uses top-left origin for x, y coordinates)
  // Scale caption position from design resolution (1080x1920) to actual video resolution
  const designWidth = 1080;
  const designHeight = 1920;

  // Scale position proportionally
  const scaledX = Math.round((caption.position.x / designWidth) * videoWidth);
  const scaledY = Math.round((caption.position.y / designHeight) * videoHeight);

  // Line height calculation (matches ReelCaptionRenderer)
  const lineHeight = caption.style.fontSize * 1.2;
  const totalTextHeight = lines.length * lineHeight;

  // For text alignment, we need to adjust x position manually since text_align is not supported
  // FFmpeg drawtext uses (x, y) as the LEFT edge of the text by default
  // Our preview canvas uses textAlign='center' which centers text at x position
  // To simulate center alignment in drawtext, we need to offset x to the left by half the text width

  // Calculate accurate text width for the longest line
  let maxLineWidth = 0;
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = `normal normal ${caption.style.fontSize}px ${caption.style.fontFamily}`;
        maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      }
    } catch (err) {
      console.warn(
        "[buildSimpleCaptionFilter] Failed to measure text width, using estimation:",
        err
      );
    }
  }

  // Fallback to estimation if canvas not available
  if (maxLineWidth === 0) {
    const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), "");
    maxLineWidth = longestLine.length * caption.style.fontSize * 0.5;
  }

  // Detect if text contains Arabic/RTL characters
  const hasArabic = /[\u0600-\u06FF]/.test(text);

  if (hasArabic) {
    console.log(
      `[buildSimpleCaptionFilter] Caption contains Arabic text - will use font file and text shaping`
    );
  }

  // Convert colors to FFmpeg format
  const fontColor = convertColorToFFmpeg(caption.style.color);

  // Build filter options
  // Note: FFmpeg WASM has libfribidi and libass support for RTL text shaping
  const fontFamily = caption.style.fontFamily || "Arial";

  // Use MULTIPLE drawtext filters (one per line)
  // CRITICAL: Box on WIDEST line (for proper centering), drawn FIRST so all text appears on top

  const filters: string[] = [];

  // Calculate starting Y position to center the entire text block
  const startY = scaledY - totalTextHeight / 2 + caption.style.fontSize * 0.8;

  // Find the widest line index for box placement (ensures centered box)
  // For mixed content lines, calculate total width of all segments
  let widestLineIndex = 0;
  let widestLineWidth = 0;

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        lines.forEach((line, idx) => {
          const lineHasArabic = /[\u0600-\u06FF]/.test(line);
          const lineHasLatin = /[a-zA-Z0-9]/.test(line);
          let lineWidth = 0;

          // CRITICAL: Use same font for measurement as wrapping (caption.style.fontFamily)
          // This ensures width calculations match the wrapping logic exactly
          // The actual font files used in FFmpeg will be different, but measurement should match preview
          const fontName = caption.style.fontFamily || "Arial";
          ctx.font = `normal normal ${caption.style.fontSize}px ${fontName}`;

          // For mixed content, measure the entire line as one string (like preview does)
          // This ensures width matches the wrapping calculation
          if (lineHasArabic && lineHasLatin) {
            // Measure entire line - wrapping already happened, so this matches preview
            const metrics = ctx.measureText(line);
            lineWidth = metrics.width;
          } else {
            // Pure Arabic or pure English - measure as single string
            const metrics = ctx.measureText(line);
            lineWidth = metrics.width;

            // For Arabic, add 10% buffer to account for text shaping differences in FFmpeg
            if (lineHasArabic) {
              lineWidth = lineWidth * 1.1;
            }
          }

          if (lineWidth > widestLineWidth) {
            widestLineWidth = lineWidth;
            widestLineIndex = idx;
          }
        });

        console.log(
          `[buildSimpleCaptionFilter] Measured widest line ${
            widestLineIndex + 1
          }: ${Math.round(widestLineWidth)}px`
        );
      }
    } catch (err) {
      // Fallback: use line with most characters, with character width estimation
      lines.forEach((line, idx) => {
        const lineHasArabic = /[\u0600-\u06FF]/.test(line);
        const lineHasLatin = /[a-zA-Z0-9]/.test(line);
        let estimatedWidth = 0;

        // For mixed content, estimate width of all segments
        if (lineHasArabic && lineHasLatin) {
          const segments = splitTextByScript(line);
          segments.forEach((seg) => {
            estimatedWidth += seg.text.length * caption.style.fontSize * (seg.isArabic ? 0.7 : 0.6);
          });
        } else {
          estimatedWidth = line.length * caption.style.fontSize * 0.6;
        }

        if (estimatedWidth > widestLineWidth) {
          widestLineWidth = estimatedWidth;
          widestLineIndex = idx;
        }
      });
    }
  }

  // Calculate box padding - CRITICAL for equal left/right margins and proper vertical spacing
  // boxborderw adds padding on ALL SIDES equally
  // Strategy: Calculate separate horizontal and vertical needs, then use appropriate value

  // Horizontal padding: ensure equal left/right margins
  // For Arabic text, be slightly more generous to account for text shaping differences
  const horizontalPadding = hasArabic ? 25 : 20;

  // Vertical padding: ensure text doesn't touch box edges, especially at bottom
  // We'll use large padding but offset text upward to create more bottom space
  let verticalPadding = 140; // Default margin (increased for better bottom spacing)

  if (lines.length > 1) {
    // Calculate distance from widest line to furthest line (top or bottom)
    const linesToTop = widestLineIndex;
    const linesToBottom = lines.length - 1 - widestLineIndex;
    const maxLines = Math.max(linesToTop, linesToBottom);

    // Vertical padding: distance to furthest line + extra margin
    // Add extra padding for bottom breathing room (increased)
    verticalPadding = Math.ceil(maxLines * lineHeight + 140);
  }

  // For single line, ensure minimum bottom padding
  // Font descenders (like ى، ج, p, g, y) need space at the bottom
  if (lines.length === 1 && hasArabic) {
    verticalPadding = Math.max(verticalPadding, 145); // Extra space for Arabic descenders
  } else if (lines.length === 1) {
    // For single English line, also increase bottom padding for descenders
    verticalPadding = Math.max(verticalPadding, 140);
  }

  // Use the SMALLER of horizontal and vertical padding to keep box reasonable
  // But ensure minimum padding of 90px for proper spacing (increased)
  // Increased cap to 220px to allow more bottom padding
  const boxPadding = Math.max(90, Math.min(horizontalPadding, verticalPadding, 220)); // Cap at 220px

  // Calculate vertical offset to shift text upward within the box
  // This creates more visual space at the bottom while keeping top padding smaller
  // Offset by ~45% of padding to create asymmetric spacing (increased to reduce top padding)
  const textVerticalOffset = Math.round(boxPadding * 0.45); // Shift text up by 45% of padding

  console.log(`[buildSimpleCaptionFilter] Caption setup:`, {
    text: `${lines[0].substring(0, 20)}...`,
    lines: lines.length,
    widestLine: widestLineIndex + 1,
    maxLineWidth: Math.round(maxLineWidth),
    lineHeight: Math.round(lineHeight),
    totalHeight: Math.round(totalTextHeight),
    boxPadding,
    hasArabic,
    position: { x: scaledX, y: scaledY },
  });

  // Helper function to create drawtext filters for a line (may return multiple filters for mixed content)
  const createLineFilters = (
    lineText: string,
    lineIndex: number,
    includeBox: boolean
  ): string[] => {
    const lineHasArabic = /[\u0600-\u06FF]/.test(lineText);
    const lineHasLatin = /[a-zA-Z0-9]/.test(lineText);

    // CRITICAL: For mixed content, use segmentation
    // Arabic segments MUST use text_shaping=1 for proper character connection
    // English segments MUST use default.ttf (Roboto) without text_shaping
    // Single filter approach doesn't work: text_shaping=0 breaks Arabic, text_shaping=1 breaks English
    if (lineHasArabic && lineHasLatin) {
      return createMixedLineFilters(lineText, lineIndex, includeBox, widestLineWidth, videoWidth);
    }

    // For pure Arabic or pure English, use single filter
    const singleFilter = createSingleLineFilter(lineText, lineIndex, includeBox);
    // Convert to array if needed (single filter returns string, box filter returns array)
    return Array.isArray(singleFilter) ? singleFilter : [singleFilter];
  };

  // Helper function to create filters for mixed Arabic+English line
  const createMixedLineFilters = (
    lineText: string,
    lineIndex: number,
    includeBox: boolean,
    referenceWidth?: number,
    videoWidth?: number
  ): string[] => {
    const segments = splitTextByScript(lineText);
    const filters: string[] = [];

    // Calculate starting position for the line
    // Shift text upward within the box to create more bottom padding visually
    // textVerticalOffset is calculated above (30% of boxPadding)
    const baseLineY = Math.round(startY + lineIndex * lineHeight);
    const lineY = baseLineY - (includeBox ? textVerticalOffset : 0);

    // Calculate total width of all segments for centering
    let totalWidth = 0;
    const segmentWidths: number[] = [];
    const segmentData: Array<{
      text: string;
      width: number;
      isArabic: boolean;
    }> = [];

    // CRITICAL: Measure the ENTIRE line first (like preview does)
    // Then measure segments with their ACTUAL fonts to get accurate positioning
    // This ensures wrapping matches preview, and segment positioning is accurate
    let measuredLineWidth = 0;
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // First, measure the entire line with the wrapping font (for validation)
          const wrappingFont = caption.style.fontFamily || "Arial";
          ctx.font = `normal normal ${caption.style.fontSize}px ${wrappingFont}`;
          measuredLineWidth = ctx.measureText(lineText).width;

          // Now measure each segment with fonts that approximate the actual FFmpeg fonts
          // Arabic: Use a font that approximates Noto Sans Arabic
          // English: Use Roboto or the caption's fontFamily
          segments.forEach((seg) => {
            // For measurement, use fonts that approximate what FFmpeg will render
            // This gives us more accurate width calculations for positioning
            let measureFont: string;
            if (seg.isArabic) {
              // Approximate Noto Sans Arabic with a generic sans-serif
              // The actual width might differ slightly, but should be close
              measureFont = "sans-serif";
            } else {
              // Use the caption's fontFamily for English (likely Roboto or similar)
              measureFont = caption.style.fontFamily || "Arial";
            }

            ctx.font = `normal normal ${caption.style.fontSize}px ${measureFont}`;
            const width = ctx.measureText(seg.text).width;
            segmentWidths.push(width);
            segmentData.push({ text: seg.text, width, isArabic: seg.isArabic });
            totalWidth += width;
          });

          // CRITICAL: Normalize segment widths to match the measured line width
          // This ensures segments align correctly and match the wrapping calculation
          if (
            measuredLineWidth > 0 &&
            totalWidth > 0 &&
            Math.abs(measuredLineWidth - totalWidth) > 1
          ) {
            // There's a difference - scale segment widths proportionally
            const scaleFactor = measuredLineWidth / totalWidth;
            segmentWidths.forEach((width, idx) => {
              segmentWidths[idx] = width * scaleFactor;
              segmentData[idx].width = width * scaleFactor;
            });
            totalWidth = measuredLineWidth;

            console.log(`[createMixedLineFilters] Normalized segment widths:`, {
              lineText: lineText.substring(0, 50),
              originalTotal: Math.round(totalWidth / scaleFactor),
              normalizedTotal: Math.round(totalWidth),
              scaleFactor: scaleFactor.toFixed(3),
              segments: segments.length,
            });
          } else {
            console.log(`[createMixedLineFilters] Line measurement:`, {
              lineText: lineText.substring(0, 50),
              measuredLineWidth: Math.round(measuredLineWidth),
              totalSegmentWidth: Math.round(totalWidth),
              difference: Math.round(Math.abs(measuredLineWidth - totalWidth)),
              segments: segments.length,
            });
          }
        }
      } catch (err) {
        console.warn("[createMixedLineFilters] Canvas measurement failed, using estimation:", err);
        // Fallback estimation
        segments.forEach((seg) => {
          const width = seg.text.length * caption.style.fontSize * (seg.isArabic ? 0.7 : 0.6);
          segmentWidths.push(width);
          segmentData.push({ text: seg.text, width, isArabic: seg.isArabic });
          totalWidth += width;
        });
      }
    } else {
      // Fallback estimation
      segments.forEach((seg) => {
        const width = seg.text.length * caption.style.fontSize * (seg.isArabic ? 0.7 : 0.6);
        segmentWidths.push(width);
        segmentData.push({ text: seg.text, width, isArabic: seg.isArabic });
        totalWidth += width;
      });
    }

    // Use the measured line width for alignment (matches wrapping calculation)
    // This ensures the line is positioned correctly relative to the wrapping
    if (measuredLineWidth > 0) {
      totalWidth = measuredLineWidth;
    }

    // Create background box filter FIRST (drawn before text) if requested
    // CRITICAL: Box must be created BEFORE segments to appear as background
    if (
      includeBox &&
      caption.style.backgroundColor &&
      caption.style.backgroundColor !== "transparent"
    ) {
      let bgColor = convertColorToFFmpeg(caption.style.backgroundColor);
      if (bgColor) {
        bgColor = bgColor.replace("0X", "0x");
        // Match preview styling exactly: bgWidth = textWidth + padding.left + padding.right
        // Box centered at caption position (scaledX), matching preview
        // Calculate box width matching preview
        const textWidth = totalWidth;
        const boxWidth = textWidth + padding.left + padding.right;

        // Box X position: Centered at caption position (matching preview exactly)
        // Preview uses: bgX = position.x - bgWidth / 2
        // FFmpeg's x parameter is the left edge, so: x = scaledX - boxWidth / 2
        const boxX = Math.round(scaledX - boxWidth / 2);

        // Box Y position should be at the base position (not shifted)
        // The text segments will be shifted upward, creating more visual bottom padding
        const boxY = Math.round(startY + lineIndex * lineHeight);

        // Use the actual line text for box sizing (FFmpeg sizes box based on text)
        // The box will be sized based on this text width + boxborderw padding
        const boxText = lineText || " ";

        const boxOptions = [
          `text='${boxText.replace(/'/g, "'\\''")}'`, // Use actual line text
          `fontsize=${caption.style.fontSize}`,
          `fontcolor=${fontColor}`, // Same color as text (will be covered by text segments above)
          `x=${boxX}`, // Left edge of box (centered at caption position, matching preview)
          `y=${boxY}`, // Box Y position
          `enable='between(t,${captionStart},${captionEnd})'`,
          `fontfile=default.ttf`, // Use default font for box sizing
          `text_shaping=0`, // No shaping needed for box
          `box=1`, // Enable box
          `boxcolor=${bgColor}`, // Box background color
          `boxborderw=${boxPadding}`, // Box padding (matches preview padding)
        ];
        filters.push(`drawtext=${boxOptions.join(":")}`);
        console.log(
          `[buildSimpleCaptionFilter] Line ${
            lineIndex + 1
          }: Background box created for mixed content (width: ${Math.round(
            boxWidth
          )}px, x=${boxX}, videoWidth=${videoWidth})`
        );
      } else {
        console.warn(
          `[buildSimpleCaptionFilter] Line ${lineIndex + 1}: Failed to convert background color: ${
            caption.style.backgroundColor
          }`
        );
      }
    } else {
      console.log(
        `[buildSimpleCaptionFilter] Line ${
          lineIndex + 1
        }: No box (includeBox=${includeBox}, backgroundColor=${caption.style.backgroundColor})`
      );
    }

    // CRITICAL: Determine visual order of segments using browser's BiDi algorithm
    // The preview renders the entire line as one unit, maintaining natural bidirectional flow
    // We need to determine the visual order of segments, then position them accordingly
    let visualOrder: Array<{ index: number; visualX: number }> = [];

    if (typeof window !== "undefined" && typeof document !== "undefined") {
      try {
        // Create a temporary element to get visual positions from browser's BiDi rendering
        const tempDiv = document.createElement("div");
        tempDiv.style.position = "absolute";
        tempDiv.style.visibility = "hidden";
        tempDiv.style.whiteSpace = "nowrap";
        tempDiv.style.direction = "auto"; // Let browser determine direction
        tempDiv.style.fontSize = `${caption.style.fontSize}px`;
        tempDiv.style.fontFamily = caption.style.fontFamily || "Arial";
        tempDiv.textContent = lineText;
        document.body.appendChild(tempDiv);

        // Use Range API to get visual positions of each segment
        // The browser's BiDi algorithm will determine the visual order
        const range = document.createRange();
        const textNode = tempDiv.firstChild;

        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          let charIndex = 0;

          segmentData.forEach((segment, segIndex) => {
            const startChar = charIndex;
            const endChar = charIndex + segment.text.length;

            try {
              // Set range to cover this segment
              range.setStart(textNode, startChar);
              range.setEnd(textNode, endChar);

              // Get bounding rectangle (visual position)
              const rect = range.getBoundingClientRect();
              const containerRect = tempDiv.getBoundingClientRect();

              // Calculate relative X position (from left edge of container)
              const visualX = rect.left - containerRect.left;

              visualOrder.push({ index: segIndex, visualX });
            } catch (err) {
              // Fallback: use sequential order with estimated position
              console.warn(
                `[createMixedLineFilters] Range API failed for segment ${segIndex}:`,
                err
              );
              visualOrder.push({ index: segIndex, visualX: segIndex * 100 });
            }

            charIndex = endChar;
          });
        } else {
          // Fallback: sequential order if text node not found
          console.warn("[createMixedLineFilters] Text node not found, using sequential order");
          visualOrder = segmentData.map((_, idx) => ({
            index: idx,
            visualX: idx * 100,
          }));
        }

        document.body.removeChild(tempDiv);

        // Sort by visual X position to get visual order
        visualOrder.sort((a, b) => a.visualX - b.visualX);

        console.log(
          `[createMixedLineFilters] Visual order determined:`,
          visualOrder.map((v) => ({
            index: v.index,
            text: segmentData[v.index].text.substring(0, 20),
            visualX: Math.round(v.visualX),
          }))
        );
      } catch (err) {
        console.warn(
          "[createMixedLineFilters] Failed to determine visual order, using sequential:",
          err
        );
        // Fallback to sequential order
        visualOrder = segmentData.map((_, idx) => ({
          index: idx,
          visualX: idx * 100,
        }));
      }
    } else {
      // Fallback: sequential order
      visualOrder = segmentData.map((_, idx) => ({
        index: idx,
        visualX: idx * 100,
      }));
    }

    // Calculate starting position for the line
    // We'll position segments based on their relative visual positions
    let baseX: number;
    if (includeBox && referenceWidth && referenceWidth > totalWidth) {
      // Center the actual content within the reference width (for widest line with box)
      const offset = (referenceWidth - totalWidth) / 2;
      baseX = Math.round(scaledX - referenceWidth / 2 + offset);
    } else {
      // Center based on measured line width (matches wrapping calculation)
      baseX = Math.round(scaledX - totalWidth / 2);
    }

    // If we successfully determined visual order, use relative positioning
    // Otherwise, fall back to sequential positioning
    const useVisualOrder = visualOrder.length > 0 && visualOrder[0].visualX !== 0;

    if (useVisualOrder && visualOrder.length === segmentData.length) {
      // Calculate the offset of the first segment in visual order
      const firstVisualX = visualOrder[0].visualX;
      const firstSegmentIndex = visualOrder[0].index;
      const firstSegmentWidth =
        segmentWidths[firstSegmentIndex] ||
        segmentData[firstSegmentIndex].text.length * caption.style.fontSize * 0.6;

      // Adjust baseX to account for the visual offset
      // The first segment should be positioned at baseX + (firstVisualX - 0)
      baseX = baseX - firstVisualX;
    }

    // Position segments in visual order (as determined by browser's BiDi algorithm)
    visualOrder.forEach((visualItem, visualIndex) => {
      const segIndex = visualItem.index;
      const segment = segmentData[segIndex];
      const segmentWidth =
        segmentWidths[segIndex] || segment.text.length * caption.style.fontSize * 0.6;

      // Calculate X position based on visual order
      let currentX: number;
      if (useVisualOrder && visualOrder.length === segmentData.length) {
        // Use the visual X position relative to the base
        currentX = Math.round(baseX + visualItem.visualX);
      } else {
        // Fallback: sequential positioning
        if (visualIndex === 0) {
          currentX = baseX;
        } else {
          const prevVisualItem = visualOrder[visualIndex - 1];
          const prevSegIndex = prevVisualItem.index;
          const prevSegmentWidth =
            segmentWidths[prevSegIndex] ||
            segmentData[prevSegIndex].text.length * caption.style.fontSize * 0.6;
          currentX = baseX;
          // Calculate cumulative width up to this point in visual order
          for (let i = 0; i < visualIndex; i++) {
            const prevIdx = visualOrder[i].index;
            currentX += Math.round(
              segmentWidths[prevIdx] ||
                segmentData[prevIdx].text.length * caption.style.fontSize * 0.6
            );
          }
        }
      }
      // Escape text for FFmpeg drawtext filter
      // CRITICAL: Proper escaping is essential for Arabic characters to render correctly
      // FFmpeg needs single quotes escaped as '\\'' and backslashes as '\\\\'
      const escapedText = segment.text
        .replace(/\\/g, "\\\\") // Escape backslashes first
        .replace(/'/g, "'\\''"); // Escape single quotes for shell safety

      // Calculate font size - reduce English font size to better match Arabic weight
      // Roboto Regular appears significantly bolder than Noto Sans Arabic Regular
      // Reduce English by ~5-6% to make weights more similar
      const segmentFontSize = segment.isArabic
        ? caption.style.fontSize
        : Math.round(caption.style.fontSize * 0.94); // Reduce English by 6% to better match Arabic weight

      const segmentOptions: string[] = [
        `text='${escapedText}'`,
        `fontsize=${segmentFontSize}`,
        `fontcolor=${fontColor}`,
        `x=${currentX}`,
        `y=${lineY}`,
        `enable='between(t,${captionStart},${captionEnd})'`,
      ];

      console.log(
        `[createMixedLineFilters] Positioning segment ${segIndex + 1} (visual pos ${
          visualIndex + 1
        }) at x=${currentX}, text="${segment.text.substring(0, 20)}..."`
      );

      // CRITICAL: Use correct font for each script
      // Arabic segments: arabic.ttf (Noto Sans Arabic)
      // English segments: default.ttf (Roboto) without text_shaping (REQUIRED for proper rendering)
      // Note: Using arabic.ttf for English causes boxes, so we must use default.ttf
      // Font size is adjusted above to reduce styling difference
      // IMPORTANT: FFmpeg WASM may not support text_shaping properly, so we try without it first
      // Arabic characters should still render (just won't connect) if font file is correct
      if (segment.isArabic) {
        segmentOptions.push("fontfile=arabic.ttf");
        // Try WITHOUT text_shaping first - FFmpeg WASM may not support it, causing empty boxes
        // If text_shaping is needed, it can be enabled, but it often breaks rendering in WASM
        // segmentOptions.push('text_shaping=1'); // Disabled - causes empty boxes in FFmpeg WASM
        console.log(
          `[createMixedLineFilters] Segment ${segIndex + 1}: Arabic "${segment.text.substring(
            0,
            20
          )}..." - using arabic.ttf WITHOUT text_shaping (WASM compatibility), fontsize=${segmentFontSize}`
        );
      } else {
        segmentOptions.push("fontfile=default.ttf");
        // NO text_shaping for English - it breaks rendering
        console.log(
          `[createMixedLineFilters] Segment ${segIndex + 1}: English "${segment.text.substring(
            0,
            20
          )}..." - using default.ttf, fontsize=${segmentFontSize} (reduced from ${
            caption.style.fontSize
          } to match Arabic weight)`
        );
      }

      // NO box on individual segments - box is drawn separately above

      const filterString = `drawtext=${segmentOptions.join(":")}`;
      filters.push(filterString);
    });

    console.log(
      `[buildSimpleCaptionFilter] Line ${lineIndex + 1}: Mixed content split into ${
        segments.length
      } segments, total width: ${Math.round(totalWidth)}px`
    );
    return filters;
  };

  // Helper function to create a single line's drawtext filter (for pure Arabic or pure English)
  // Returns string when no box, array when box is present (box filter + text filter)
  const createSingleLineFilter = (
    lineText: string,
    lineIndex: number,
    includeBox: boolean
  ): string | string[] => {
    // Calculate Y position for this specific line
    // Shift text upward within the box to create more bottom padding visually
    const baseLineY = Math.round(startY + lineIndex * lineHeight);
    const lineY = baseLineY - (includeBox ? textVerticalOffset : 0);

    // Calculate X position for this line
    let lineX = scaledX;
    let lineWidth = 0;

    if (typeof window !== "undefined" && typeof document !== "undefined") {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Use same font matching logic as widest line measurement
          const fontName = hasArabic ? "sans-serif" : caption.style.fontFamily;
          ctx.font = `normal normal ${caption.style.fontSize}px ${fontName}`;

          const metrics = ctx.measureText(lineText);
          lineWidth = metrics.width;

          // For Arabic, apply same 10% buffer
          if (hasArabic) {
            lineWidth = lineWidth * 1.1;
          }

          // CRITICAL: For the line WITH the box, center it based on the WIDEST line
          // This ensures the box is always centered with equal left/right margins
          // The box extends boxborderw pixels on ALL sides, so:
          // - Text at: scaledX - (widestLineWidth / 2)
          // - Box left edge: text_x - boxborderw
          // - Box right edge: text_x + widestLineWidth + boxborderw
          // - Box center: text_x + (widestLineWidth / 2) = scaledX ✓
          if (includeBox) {
            lineX = Math.round(scaledX - widestLineWidth / 2);
          } else {
            // For lines without box, center based on their own width
            lineX = Math.round(scaledX - lineWidth / 2);
          }
        } else {
          // Canvas context failed, use estimation
          lineWidth = lineText.length * caption.style.fontSize * 0.5;
          if (includeBox) {
            lineX = Math.round(scaledX - widestLineWidth / 2);
          } else {
            lineX = Math.round(scaledX - lineWidth / 2);
          }
        }
      } catch (err) {
        // Error during measurement, use estimation
        console.warn(
          `[buildSimpleCaptionFilter] Canvas measurement failed, using estimation:`,
          err
        );
        lineWidth = lineText.length * caption.style.fontSize * 0.5;
        if (includeBox) {
          lineX = Math.round(scaledX - widestLineWidth / 2);
        } else {
          lineX = Math.round(scaledX - lineWidth / 2);
        }
      }
    } else {
      // No window/document, use estimation
      lineWidth = lineText.length * caption.style.fontSize * 0.5;
      if (includeBox) {
        lineX = Math.round(scaledX - widestLineWidth / 2);
      } else {
        lineX = Math.round(scaledX - lineWidth / 2);
      }
    }

    // Log box positioning details for debugging
    if (includeBox) {
      const boxLeftEdge = lineX - boxPadding;
      const boxRightEdge = lineX + widestLineWidth + boxPadding;
      const boxTotalWidth = boxRightEdge - boxLeftEdge;
      const boxCenter = boxLeftEdge + boxTotalWidth / 2;
      const marginLeft = boxLeftEdge;
      const marginRight = videoWidth - boxRightEdge;

      console.log(`[buildSimpleCaptionFilter] Line ${lineIndex + 1} (WITH BOX):`, {
        textX: lineX,
        textWidth: Math.round(widestLineWidth),
        boxPadding,
        boxLeftEdge,
        boxRightEdge,
        boxCenter: Math.round(boxCenter),
        targetCenter: scaledX,
        marginLeft: Math.round(marginLeft),
        marginRight: Math.round(marginRight),
        marginDiff: Math.round(Math.abs(marginLeft - marginRight)),
      });
    } else {
      console.log(
        `[buildSimpleCaptionFilter] Line ${
          lineIndex + 1
        }: x=${lineX}, y=${lineY}, width=${Math.round(
          lineWidth
        )}, text="${lineText.substring(0, 20)}..."`
      );
    }

    // Escape text for FFmpeg drawtext filter
    // CRITICAL: Proper escaping is essential for Arabic characters to render correctly
    // FFmpeg needs single quotes escaped as '\\'' and backslashes as '\\\\'
    const escapedLine = lineText
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/'/g, "'\\''"); // Escape single quotes for shell safety

    // Build options for this line
    const lineOptions: string[] = [
      `text='${escapedLine}'`,
      `fontsize=${caption.style.fontSize}`,
      `fontcolor=${fontColor}`,
      `x=${lineX}`,
      `y=${lineY}`,
      `enable='between(t,${captionStart},${captionEnd})'`,
    ];

    // Add font file (REQUIRED for FFmpeg WASM drawtext)
    // CRITICAL: Detect what THIS SPECIFIC LINE contains
    const lineHasArabic = /[\u0600-\u06FF]/.test(lineText);
    const lineHasLatin = /[a-zA-Z0-9]/.test(lineText);

    console.log(`[buildSimpleCaptionFilter] Line ${lineIndex + 1} analysis:`, {
      text: lineText,
      hasArabic: lineHasArabic,
      hasLatin: lineHasLatin,
      length: lineText.length,
    });

    // Font selection strategy:
    // 1. Pure Arabic line: use arabic.ttf WITHOUT text_shaping (FFmpeg WASM compatibility)
    // 2. Pure English line: use default.ttf (Roboto) without text_shaping
    // 3. Mixed Arabic+English line: Split into segments (handled separately)
    // IMPORTANT: FFmpeg WASM may not support text_shaping properly, causing empty boxes
    // We disable text_shaping to ensure Arabic characters render (they just won't connect)
    if (lineHasArabic && !lineHasLatin) {
      // Pure Arabic line - use arabic.ttf WITHOUT text_shaping for WASM compatibility
      // Characters will render but won't connect (better than empty boxes)
      lineOptions.push("fontfile=arabic.ttf");
      // text_shaping=1 disabled - causes empty boxes in FFmpeg WASM
      console.log(
        `[buildSimpleCaptionFilter] Line ${
          lineIndex + 1
        }: Pure Arabic, arabic.ttf WITHOUT text_shaping (WASM compatibility)`
      );
    } else if (lineHasLatin && !lineHasArabic) {
      // Pure English line - use default.ttf (Roboto) for proper Latin rendering
      lineOptions.push("fontfile=default.ttf");
      console.log(
        `[buildSimpleCaptionFilter] Line ${lineIndex + 1}: Pure English, default.ttf (Roboto)`
      );
    } else if (lineHasArabic && lineHasLatin) {
      // Mixed Arabic+English line - use arabic.ttf WITHOUT text_shaping
      // Noto Sans Arabic supports both Arabic and Latin scripts
      // Without text_shaping, both scripts should render correctly
      lineOptions.push("fontfile=arabic.ttf");
      // NO text_shaping - it breaks rendering in FFmpeg WASM
      console.log(
        `[buildSimpleCaptionFilter] Line ${
          lineIndex + 1
        }: Mixed Arabic+English, arabic.ttf WITHOUT text_shaping - both scripts should render`
      );
    } else {
      // No script detected - default to arabic.ttf if caption has Arabic, otherwise default.ttf
      if (hasArabic) {
        lineOptions.push("fontfile=arabic.ttf");
        console.log(
          `[buildSimpleCaptionFilter] Line ${
            lineIndex + 1
          }: No script detected, using arabic.ttf (caption has Arabic)`
        );
      } else {
        lineOptions.push("fontfile=default.ttf");
        console.log(
          `[buildSimpleCaptionFilter] Line ${lineIndex + 1}: No script detected, using default.ttf`
        );
      }
    }

    // Add box if requested
    // For single line filters, create a separate box filter to have fixed 80% width
    if (
      includeBox &&
      caption.style.backgroundColor &&
      caption.style.backgroundColor !== "transparent"
    ) {
      let bgColor = convertColorToFFmpeg(caption.style.backgroundColor);
      if (bgColor) {
        bgColor = bgColor.replace("0X", "0x");

        // Match preview styling exactly: bgWidth = textWidth + padding.left + padding.right
        // Box centered at caption position (scaledX), matching preview
        // Calculate box width matching preview
        const textWidth = lineWidth;
        const boxWidth = textWidth + padding.left + padding.right;

        // Box X position: Centered at caption position (matching preview exactly)
        // Preview uses: bgX = position.x - bgWidth / 2
        // FFmpeg's x parameter is the left edge, so: x = scaledX - boxWidth / 2
        const boxX = Math.round(scaledX - boxWidth / 2);

        // Box Y position should be at base position (not shifted with text)
        const boxY = Math.round(startY + lineIndex * lineHeight);

        // Use the actual line text for box sizing (FFmpeg sizes box based on text)
        // The box will be sized based on this text width + boxborderw padding
        const boxText = lineText || " ";

        const boxOptions = [
          `text='${boxText.replace(/'/g, "'\\''")}'`, // Use actual line text
          `fontsize=${caption.style.fontSize}`,
          `fontcolor=${fontColor}`, // Same color as text (will be covered by text segments above)
          `x=${boxX}`, // Left edge of box (centered at caption position, matching preview)
          `y=${boxY}`, // Box Y position
          `enable='between(t,${captionStart},${captionEnd})'`,
          `fontfile=default.ttf`, // Use default font for box sizing
          `text_shaping=0`, // No shaping needed for box
          `box=1`, // Enable box
          `boxcolor=${bgColor}`, // Box background color
          `boxborderw=${boxPadding}`, // Box padding (matches preview padding)
        ];

        // Return box filter + text filter (box first) as array
        return [`drawtext=${boxOptions.join(":")}`, `drawtext=${lineOptions.join(":")}`];
      }
    }

    // No box - return single text filter as string (will be converted to array by caller)
    return `drawtext=${lineOptions.join(":")}`;
  };

  // CRITICAL DRAWING ORDER:
  // 1. WIDEST line WITH box (drawn first = bottom layer = background)
  // 2. All other lines WITHOUT box (drawn on top)
  // This ensures the box is properly centered around the entire caption

  if (lines.length === 0) {
    console.error(`[buildSimpleCaptionFilter] ERROR: No lines to render for caption ${caption.id}`);
    return "";
  }

  // Add widest line with box FIRST (bottom layer)
  // createLineFilters returns an array (may be multiple filters for mixed content)
  const widestLineFilters = createLineFilters(lines[widestLineIndex], widestLineIndex, true);
  widestLineFilters.forEach((filter, idx) => {
    console.log(
      `[buildSimpleCaptionFilter] Widest line ${widestLineIndex + 1} filter ${
        idx + 1
      }/${widestLineFilters.length} (with box): ${filter.substring(0, 100)}...`
    );
    filters.push(filter);
  });

  // Add all other lines without box (on top)
  for (let i = 0; i < lines.length; i++) {
    if (i === widestLineIndex) continue; // Skip widest line (already added)

    const lineFilters = createLineFilters(lines[i], i, false);
    lineFilters.forEach((filter, idx) => {
      console.log(
        `[buildSimpleCaptionFilter] Line ${i + 1} filter ${idx + 1}/${
          lineFilters.length
        }: ${filter.substring(0, 80)}...`
      );
      filters.push(filter);
    });
  }

  const finalFilter = filters.join(",");

  console.log(
    `[buildSimpleCaptionFilter] ✅ Built ${
      filters.length
    } filters (box on widest line ${widestLineIndex + 1}, drawn first)`
  );
  console.log(`[buildSimpleCaptionFilter] Final filter length: ${finalFilter.length} chars`);
  console.log(`[buildSimpleCaptionFilter] Filter preview: ${finalFilter.substring(0, 200)}...`);

  if (!finalFilter || finalFilter.length === 0) {
    console.error(
      `[buildSimpleCaptionFilter] ❌ ERROR: Empty filter generated for caption ${caption.id}`,
      {
        linesCount: lines.length,
        filtersCount: filters.length,
        captionText: caption.text,
      }
    );
  }

  return finalFilter;
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
 * Generate ASS subtitle file content from captions
 * ASS format has better language support than drawtext, especially for Arabic/RTL languages
 */
export function generateASSSubtitleFile(
  captions: Caption[],
  trimStart: number,
  videoWidth: number = 1080,
  videoHeight: number = 1920
): string {
  // Filter visible captions
  const visibleCaptions = captions.filter((caption) => caption.isVisible);

  // ASS file header
  const assLines: string[] = [
    "[Script Info]",
    "Title: Reelify Captions",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: None",
    "",
    "[V4+ Styles]",
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`,
    // Default style - center bottom alignment for 9:16 videos
    // Style format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
    // Alignment: 2 = bottom center, 5 = middle center, 8 = top center
    // Colors in ASS format: &HAABBGGRR (AA=alpha, BB=blue, GG=green, RR=red)
    // Using BorderStyle=3 for opaque box background, Outline=10 for padding
    // PrimaryColour: &H00FFFFFF (white), BackColour: &H80000000 (semi-transparent black box)
    `Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,10,0,2,10,10,30,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  // Add each caption as a dialogue event
  visibleCaptions.forEach((caption) => {
    const captionStart = Math.round(Math.max(0, caption.startTime - trimStart) * 100) / 100;
    const captionEnd = Math.round(Math.max(0, caption.endTime - trimStart) * 100) / 100;

    // Skip if outside trim range
    if (captionEnd <= captionStart) return;

    // Format time as ASS time format: H:MM:SS.cc (centiseconds)
    const formatTime = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const centiseconds = Math.floor((seconds % 1) * 100);
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
    };

    // Escape ASS text (convert newlines to \N, escape special characters)
    const escapeASSText = (text: string): string => {
      return text
        .replace(/\\/g, "\\\\") // Escape backslashes
        .replace(/\n/g, "\\N") // Convert newlines to ASS newline
        .replace(/{/g, "\\{") // Escape braces
        .replace(/}/g, "\\}"); // Escape braces
    };

    // Apply text transform
    let text = applyTextTransform(caption.text, caption.style.textTransform);

    // Wrap text if needed (ASS handles wrapping automatically, but we can add manual breaks)
    const padding = caption.style.padding || {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const maxTextWidth = videoWidth * 0.8 - padding.left - padding.right;
    const wrappedText = wrapTextForFFmpeg(
      text,
      caption.style.fontSize,
      caption.style.fontFamily,
      maxTextWidth
    );

    // Build ASS dialogue line
    // Format: Dialogue: 0,start,end,Default,,0,0,0,,text
    const startTimeStr = formatTime(captionStart);
    const endTimeStr = formatTime(captionEnd);
    const escapedText = escapeASSText(wrappedText);

    // Add styling tags if needed
    let styledText = escapedText;
    if (caption.style.color && caption.style.color !== "#FFFFFF") {
      // Convert hex color to ASS format: &HBBGGRR (BGR, not RGB)
      const hex = caption.style.color.replace("#", "");
      const r = hex.substring(0, 2);
      const g = hex.substring(2, 4);
      const b = hex.substring(4, 6);
      styledText = `{\\c&H${b}${g}${r}&}${styledText}`;
    }

    if (caption.style.fontSize && caption.style.fontSize !== 48) {
      styledText = `{\\fs${caption.style.fontSize}}${styledText}`;
    }

    // Background box - use ASS box drawing for background
    if (caption.style.backgroundColor && caption.style.backgroundColor !== "transparent") {
      // Convert background color to ASS format: &HAABBGGRR
      let bgColorASS = "&H80000000&"; // Default: semi-transparent black
      if (caption.style.backgroundColor.startsWith("#")) {
        const hex = caption.style.backgroundColor.replace("#", "");
        if (hex.length === 6) {
          const r = hex.substring(0, 2);
          const g = hex.substring(2, 4);
          const b = hex.substring(4, 6);
          bgColorASS = `&H80${b}${g}${r}&`; // 80 = ~50% opacity
        }
      } else if (caption.style.backgroundColor.startsWith("rgba")) {
        // Parse rgba color
        const match = caption.style.backgroundColor.match(
          /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/
        );
        if (match) {
          const r = parseInt(match[1], 10).toString(16).padStart(2, "0");
          const g = parseInt(match[2], 10).toString(16).padStart(2, "0");
          const b = parseInt(match[3], 10).toString(16).padStart(2, "0");
          const alpha = Math.round((1 - parseFloat(match[4])) * 255)
            .toString(16)
            .padStart(2, "0"); // ASS uses inverse alpha
          bgColorASS = `&H${alpha}${b}${g}${r}&`;
        }
      }
      // Add border style and background color
      styledText = `{\\bord4\\3c${bgColorASS}\\4c${bgColorASS}}${styledText}`;
    }

    assLines.push(`Dialogue: 0,${startTimeStr},${endTimeStr},Default,,0,0,0,,${styledText}`);
  });

  return assLines.join("\n");
}

/**
 * Build FFmpeg filter complex for all captions
 * DEPRECATED: Use ASS subtitles instead for better language support
 */
export function buildCaptionFilters(
  captions: Caption[],
  trimStart: number,
  videoWidth: number = 1080,
  videoHeight: number = 1920
): string {
  console.log("[buildCaptionFilters] Building filters for captions:", {
    totalCaptions: captions.length,
    visibleCaptions: captions.filter((c) => c.isVisible).length,
    trimStart,
    videoSize: { width: videoWidth, height: videoHeight },
  });

  const filters = captions
    .filter((caption) => caption.isVisible)
    .map((caption) => buildCaptionFilter(caption, trimStart, videoWidth, videoHeight))
    .filter((filter) => filter && filter.length > 0); // Filter out empty strings

  console.log("[buildCaptionFilters] Generated filters:", {
    filterCount: filters.length,
    totalLength: filters.join(",").length,
    firstFilter: filters[0] ? filters[0].substring(0, 150) + "..." : "none",
  });

  return filters.join(",");
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
  inputFile: string = "input.mp4",
  outputFile: string = "output.mp4",
  useStreamCopy: boolean = false,
  inputWidth: number = 1920,
  inputHeight: number = 1080
): string[] {
  // Filter captions that are visible AND overlap with the trim range
  const trimEnd = startTime + duration;
  const visibleCaptions = captions.filter((caption) => {
    if (!caption.isVisible) return false;
    // Check if caption overlaps with trim range
    return caption.startTime < trimEnd && caption.endTime > startTime;
  });
  const hasCaptions = visibleCaptions.length > 0;

  console.log("[buildFFmpegCommand] Caption filtering:", {
    totalCaptions: captions.length,
    visibleCaptions: visibleCaptions.length,
    trimRange: `${startTime} - ${trimEnd}`,
    captions: captions.map((c) => ({
      id: c.id,
      text: c.text.substring(0, 50),
      isVisible: c.isVisible,
      startTime: c.startTime,
      endTime: c.endTime,
      overlaps: c.startTime < trimEnd && c.endTime > startTime,
    })),
  });

  // Use stream copy when no captions are needed - this is much faster
  // Stream copy can only cut at keyframes, but for most videos this is acceptable
  const shouldUseStreamCopy = useStreamCopy && !hasCaptions;

  // Use INPUT SEEKING (-ss BEFORE -i) for fast seeking
  // This seeks in the input stream without decoding, making it much faster
  // The slight frame inaccuracy at keyframe boundaries is acceptable for most use cases
  const args: string[] = ["-ss", startTime.toString(), "-i", inputFile, "-t", duration.toString()];

  if (shouldUseStreamCopy) {
    // Stream copy mode - no re-encoding, nearly instant
    // With input seeking (-ss before -i), cuts may be at keyframes but this is fast
    // Note: Stream copy cannot be used with format/reframing options as they require re-encoding
    const needsReframing =
      settings.formatOptions?.reframing?.enabled &&
      settings.formatOptions?.reframing?.mode !== "none";
    // Format change is needed if formatOptions.format is specified (landscape or zoom)
    // Portrait is the default, so no format change needed if formatOptions is undefined
    const needsFormatChange = settings.formatOptions?.format !== undefined;

    if (!needsReframing && !needsFormatChange) {
      args.push("-c", "copy");
    } else {
      // Fall through to re-encoding mode if reframing/format change is needed
      const [width, height] = settings.resolution.split("x").map(Number);
      const filterParts: string[] = [];

      // Build reframing filters first (crop before scale)
      if (settings.formatOptions) {
        const reframingFilters = buildReframingFilters(
          inputWidth,
          inputHeight,
          width,
          height,
          settings.formatOptions
        );
        filterParts.push(...reframingFilters);
      }

      // Add scale filter for resolution
      // For landscape format, scale maintaining aspect ratio and add black bars
      if (settings.formatOptions?.format === "landscape") {
        // Scale maintaining aspect ratio, then pad to exact dimensions
        filterParts.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
        filterParts.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`);
      } else {
        // For zoom format, scale to fill (may crop)
        filterParts.push(`scale=${width}:${height}`);
      }

      // Add caption filters using drawtext (stream copy fallback path)
      if (hasCaptions) {
        console.log(
          `[buildFFmpegCommand] Adding drawtext filters (stream copy fallback) for ${visibleCaptions.length} captions`
        );

        // Build drawtext filters for each caption
        const captionFilters = buildCaptionFilters(visibleCaptions, startTime, width, height);
        if (captionFilters && captionFilters.length > 0) {
          console.log(
            `[buildFFmpegCommand] Caption filters (stream copy):`,
            captionFilters.substring(0, 200) + "..."
          );
          filterParts.push(captionFilters);
        } else {
          console.warn(
            "[buildFFmpegCommand] No caption filters generated in stream copy fallback!"
          );
        }
      } else {
        console.warn("[buildFFmpegCommand] NO CAPTIONS in stream copy fallback!");
      }

      if (filterParts.length > 0) {
        args.push("-vf", filterParts.join(","));
      }

      // Video codec settings
      args.push("-c:v", settings.videoCodec);
      args.push("-preset", settings.preset);
      args.push("-crf", settings.crf.toString());
      args.push("-r", settings.fps.toString());

      // Audio codec settings
      args.push("-c:a", settings.audioCodec);
      args.push("-b:a", settings.audioBitrate);
    }
  } else {
    // Re-encoding mode - needed for filters (scale, captions, reframing)
    const [width, height] = settings.resolution.split("x").map(Number);
    const filterParts: string[] = [];

    // Build reframing filters first (crop before scale)
    if (settings.formatOptions) {
      const reframingFilters = buildReframingFilters(
        inputWidth,
        inputHeight,
        width,
        height,
        settings.formatOptions
      );
      filterParts.push(...reframingFilters);
    }

    // Add scale filter for resolution
    // For landscape format, scale maintaining aspect ratio and add black bars
    if (settings.formatOptions?.format === "landscape") {
      // Scale maintaining aspect ratio, then pad to exact dimensions
      filterParts.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
      filterParts.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`);
    } else {
      // For zoom format, scale to fill (may crop)
      filterParts.push(`scale=${width}:${height}`);
    }

    // Add caption filters using drawtext (works better in FFmpeg WASM than ASS subtitles)
    if (hasCaptions) {
      console.log(
        `[buildFFmpegCommand] Adding drawtext filters for ${visibleCaptions.length} captions:`,
        {
          captionDetails: visibleCaptions.map((c) => ({
            text: c.text.substring(0, 30),
            start: c.startTime,
            end: c.endTime,
            adjustedStart: Math.max(0, c.startTime - startTime),
            adjustedEnd: Math.max(0, c.endTime - startTime),
          })),
        }
      );

      // Build drawtext filters for each caption
      // FFmpeg WASM doesn't have font files for ASS subtitles, so we use drawtext which has embedded fonts
      const captionFilters = buildCaptionFilters(visibleCaptions, startTime, width, height);
      if (captionFilters && captionFilters.length > 0) {
        console.log(
          `[buildFFmpegCommand] Caption filters generated:`,
          captionFilters.substring(0, 200) + "..."
        );
        filterParts.push(captionFilters);
      } else {
        console.warn("[buildFFmpegCommand] No caption filters generated despite having captions!");
      }
    } else {
      console.warn("[buildFFmpegCommand] NO CAPTIONS TO ADD - hasCaptions is false!");
    }

    if (filterParts.length > 0) {
      const filterChain = filterParts.join(",");
      console.log(
        `[buildFFmpegCommand] Complete filter chain (${filterParts.length} filters):`,
        filterChain
      );
      console.log(
        `[buildFFmpegCommand] Filter breakdown:`,
        filterParts.map((f, i) => `${i + 1}. ${f.substring(0, 150)}...`)
      );
      args.push("-vf", filterChain);
    } else {
      console.warn("[buildFFmpegCommand] No filters to apply!");
    }

    // Video codec settings
    args.push("-c:v", settings.videoCodec);
    args.push("-preset", settings.preset);
    args.push("-crf", settings.crf.toString());
    args.push("-r", settings.fps.toString());

    // Audio codec settings
    args.push("-c:a", settings.audioCodec);
    args.push("-b:a", settings.audioBitrate);
  }

  // Output file
  args.push(outputFile);

  return args;
}

/**
 * Calculate crop parameters for reframing
 * Returns crop filter string: crop=width:height:x:y
 */
function calculateCropFilter(
  inputWidth: number,
  inputHeight: number,
  outputWidth: number,
  outputHeight: number,
  reframingMode: ReframingMode
): string {
  // Calculate aspect ratios
  const inputAspect = inputWidth / inputHeight;
  const outputAspect = outputWidth / outputHeight;

  let cropWidth: number;
  let cropHeight: number;
  let x: number;
  let y: number;

  if (inputAspect > outputAspect) {
    // Input is wider - crop horizontally
    cropHeight = inputHeight;
    cropWidth = Math.round(inputHeight * outputAspect);
    y = 0;

    // Smart reframing: adjust x position based on mode
    if (reframingMode === "smart" || reframingMode === "face" || reframingMode === "speaker") {
      // Center-weighted cropping (can be enhanced with ML models later)
      // For now, use center position
      x = Math.round((inputWidth - cropWidth) / 2);
    } else if (reframingMode === "motion") {
      // Motion-based: keep center for now (can be enhanced with motion detection)
      x = Math.round((inputWidth - cropWidth) / 2);
    } else {
      // None or default: center crop
      x = Math.round((inputWidth - cropWidth) / 2);
    }
  } else {
    // Input is taller - crop vertically
    cropWidth = inputWidth;
    cropHeight = Math.round(inputWidth / outputAspect);
    x = 0;

    // Smart reframing: adjust y position based on mode
    if (reframingMode === "smart" || reframingMode === "face" || reframingMode === "speaker") {
      // Center-weighted cropping (can be enhanced with ML models later)
      // For now, use center position
      y = Math.round((inputHeight - cropHeight) / 2);
    } else if (reframingMode === "motion") {
      // Motion-based: keep center for now
      y = Math.round((inputHeight - cropHeight) / 2);
    } else {
      // None or default: center crop
      y = Math.round((inputHeight - cropHeight) / 2);
    }
  }

  return `crop=${cropWidth}:${cropHeight}:${x}:${y}`;
}

/**
 * Build crop and reframing filters based on format options
 */
function buildReframingFilters(
  inputWidth: number,
  inputHeight: number,
  outputWidth: number,
  outputHeight: number,
  formatOptions?: ExportFormatOptions
): string[] {
  const filters: string[] = [];

  if (!formatOptions) {
    return filters;
  }

  const { format, reframing } = formatOptions;

  // If reframing is disabled, just scale
  if (!reframing.enabled || reframing.mode === "none") {
    return filters;
  }

  // For zoom format, we want to crop/zoom to fill 9:16 without black bars
  if (format === "zoom") {
    // Calculate crop to fit 9:16 aspect ratio, cropping from center
    const targetAspect = 9 / 16;
    const inputAspect = inputWidth / inputHeight;

    let cropWidth: number;
    let cropHeight: number;
    let x: number;
    let y: number;

    if (inputAspect > targetAspect) {
      // Input is wider - crop horizontally to match 9:16
      cropHeight = inputHeight;
      cropWidth = Math.round(inputHeight * targetAspect);
      x = Math.round((inputWidth - cropWidth) / 2);
      y = 0;
    } else {
      // Input is taller - crop vertically to match 9:16
      cropWidth = inputWidth;
      cropHeight = Math.round(inputWidth / targetAspect);
      x = 0;
      y = Math.round((inputHeight - cropHeight) / 2);
    }

    filters.push(`crop=${cropWidth}:${cropHeight}:${x}:${y}`);
    return filters;
  }

  // For landscape format, don't crop - just scale to fit within 9:16 with black bars
  // The scaling filter will handle letterboxing/pillarboxing automatically
  if (format === "landscape") {
    // No cropping needed - video will be scaled to fit with black bars
    return filters;
  }

  return filters;
}

/**
 * Get export settings based on quality preset and format options
 *
 * Note: Using faster presets (ultrafast/veryfast) for FFmpeg WASM performance.
 * FFmpeg WASM is ~10-20x slower than native, so we prioritize speed over compression.
 * Quality impact is minimal - mainly affects file size, not visual quality.
 */
export function getExportSettings(
  quality: "high",
  formatOptions?: ExportFormatOptions
): ExportSettings {
  const presets = {
    high: {
      videoCodec: "libx264",
      audioCodec: "aac",
      videoBitrate: "12M", // Max bitrate cap for rate control
      audioBitrate: "192k",
      resolution: "1080x1920",
      fps: 30,
      preset: "ultrafast", // Critical for FFmpeg WASM performance (~10x faster)
      crf: 16, // High quality (lower = better, 16 is excellent)
    },
  };

  const baseSettings = presets[quality];

  // Adjust resolution based on format
  let resolution = baseSettings.resolution;
  if (formatOptions) {
    const { format } = formatOptions;
    if (format === "zoom") {
      // Zoom: 9:16 aspect ratio (portrait with smart cropping/zooming)
      resolution = "1080x1920";
    } else if (format === "landscape") {
      // Landscape: 9:16 aspect ratio (show full video with black bars)
      resolution = "1080x1920";
    }
  }

  return {
    ...baseSettings,
    resolution,
    formatOptions,
  };
}
