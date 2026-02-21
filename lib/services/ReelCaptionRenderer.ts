import { Caption, WordTimestamp } from "@/types";
import {
  calculateAnimationProgress,
  getAnimationTransform,
  getTypewriterCharCount,
} from "@/lib/hooks/useCaptionAnimation";

/** Build word-level timestamps by splitting caption text and distributing time evenly (for karaoke when API has no words). */
function synthesizeWordTimestamps(
  text: string,
  startTime: number,
  endTime: number
): WordTimestamp[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const duration = endTime - startTime;
  const step = duration / parts.length;
  return parts.map((word, i) => ({
    text: word,
    start: startTime + i * step,
    end: startTime + (i + 1) * step,
  }));
}

export class ReelCaptionRenderer {
  /**
   * Render captions on canvas at current time
   */
  static renderCaptions(
    canvas: HTMLCanvasElement,
    captions: Caption[],
    currentTime: number,
    videoWidth: number = 1080,
    videoHeight: number = 1920
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Filter captions visible at current time
    const visibleAtTime = captions.filter(
      (caption) =>
        caption.isVisible && currentTime >= caption.startTime && currentTime <= caption.endTime
    );

    // If multiple captions overlap, prioritize the one that started most recently
    // Sort by startTime descending (most recent first)
    const sortedCaptions = visibleAtTime.sort((a, b) => b.startTime - a.startTime);

    // Render only the most recent caption if multiple overlap
    if (sortedCaptions.length > 0) {
      const captionToRender = sortedCaptions[0];
      // Scale caption position to fit new dimensions
      const scaledCaption = this.scaleCaptionPosition(captionToRender, videoWidth, videoHeight);
      this.renderCaptionWithAnimation(ctx, scaledCaption, currentTime, videoWidth, videoHeight);
    }
  }

  /**
   * Render caption with animation support
   */
  private static renderCaptionWithAnimation(
    ctx: CanvasRenderingContext2D,
    caption: Caption,
    currentTime: number,
    videoWidth: number,
    videoHeight: number
  ): void {
    // Always render captions (no time filtering)
    // Calculate animation progress for visual effects only
    const progress = calculateAnimationProgress(caption, currentTime);

    // Use progress for animations, but always render (set to 1 if progress is 0 or negative)
    const animationProgress = progress <= 0 ? 1 : progress;

    // Get animation transforms
    const transform = getAnimationTransform(caption, animationProgress);

    // Save context state
    ctx.save();

    // Apply transforms
    ctx.globalAlpha = transform.opacity * (caption.style.opacity ?? 1);

    // Handle typewriter effect separately
    let textToRender = caption.text;
    if (caption.style.animation?.type === "typewriter") {
      const charCount = getTypewriterCharCount(caption.text, animationProgress);
      textToRender = caption.text.substring(0, charCount);
    }

    // Apply spatial transformations
    if (transform.translateX !== 0 || transform.translateY !== 0 || transform.scale !== 1) {
      const centerX = caption.position.x;
      const centerY = caption.position.y;

      // Translate to position
      ctx.translate(centerX, centerY);

      // Apply scale
      if (transform.scale !== 1) {
        ctx.scale(transform.scale, transform.scale);
      }

      // Apply translation
      ctx.translate(transform.translateX, transform.translateY);

      // Translate back
      ctx.translate(-centerX, -centerY);
    }

    // Render the caption with transformed text
    const modifiedCaption = {
      ...caption,
      text: textToRender,
    };

    this.renderCaption(ctx, modifiedCaption, videoWidth, videoHeight, currentTime);

    // Restore context state
    ctx.restore();
  }

  /**
   * Get line height in pixels: style.lineHeight as multiplier (if <= 10) or px (if > 10)
   */
  private static getLineHeight(style: Caption["style"]): number {
    const lh = style.lineHeight;
    if (lh == null) return style.fontSize * 1.2;
    return lh > 10 ? lh : style.fontSize * lh;
  }

  /**
   * Get text direction: style.direction, or from caption.language, or detect from text.
   * For mixed ar+en, uses the first strong directional character so both scripts are supported.
   */
  private static getDirection(caption: Caption): "ltr" | "rtl" {
    if (caption.style.direction) return caption.style.direction;
    if (caption.language === "ar") return "rtl";
    if (caption.language === "en") return "ltr";
    const arabicRegex = /[\u0600-\u06FF]/;
    const latinRegex = /[a-zA-Z0-9]/;
    const hasArabic = arabicRegex.test(caption.text);
    const hasLatin = latinRegex.test(caption.text);
    if (hasArabic && !hasLatin) return "rtl";
    if (hasLatin && !hasArabic) return "ltr";
    // Mixed ar + en: use first character with strong direction
    for (const char of caption.text) {
      if (arabicRegex.test(char)) return "rtl";
      if (latinRegex.test(char)) return "ltr";
    }
    return hasArabic ? "rtl" : "ltr";
  }

  /** Font stack that supports both Latin and Arabic (used when style may not include Arabic). */
  private static fontStackWithArabic(fontFamily: string): string {
    if (fontFamily.includes("Noto Sans Arabic")) return fontFamily;
    return `${fontFamily}, "Noto Sans Arabic", sans-serif`;
  }

  /**
   * Render a single caption
   */
  private static renderCaption(
    ctx: CanvasRenderingContext2D,
    caption: Caption,
    videoWidth: number,
    videoHeight: number,
    currentTime?: number
  ): void {
    const { style, position } = caption;
    let { text } = caption;

    // Apply text transform
    text = this.applyTextTransform(text, style.textTransform);

    const hasWordTimestamps =
      caption.wordTimestamps && caption.wordTimestamps.length > 0;
    const wordTimestampsForKaraoke = hasWordTimestamps
      ? caption.wordTimestamps!
      : style.karaoke && currentTime != null
        ? synthesizeWordTimestamps(caption.text, caption.startTime, caption.endTime)
        : null;
    const useKaraoke =
      style.karaoke && wordTimestampsForKaraoke && wordTimestampsForKaraoke.length > 0 && currentTime != null;

    if (useKaraoke && wordTimestampsForKaraoke) {
      this.renderCaptionWithKaraoke(
        ctx,
        { ...caption, wordTimestamps: wordTimestampsForKaraoke },
        videoWidth,
        videoHeight,
        currentTime!
      );
      return;
    }

    // Check if we have keyword highlights
    const hasKeywords = style.keywordHighlights && style.keywordHighlights.length > 0;

    if (hasKeywords) {
      this.renderCaptionWithKeywords(ctx, text, style, position, videoWidth, caption);
    } else {
      this.renderSimpleCaption(ctx, text, style, position, videoWidth, caption);
    }
  }

  /**
   * Wrap text into multiple lines based on max width
   */
  private static wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

    return lines.length > 0 ? lines : [text];
  }

  /** Arabic range: drawing these character-by-character breaks joining/shaping. */
  private static readonly ARABIC_REGEX = /[\u0600-\u06FF]/;

  /**
   * Draw a line of text with optional letter spacing (canvas has no letterSpacing API).
   * For Arabic (and other connected scripts), we always draw the whole line so shaping is preserved.
   */
  private static drawTextLine(
    ctx: CanvasRenderingContext2D,
    line: string,
    x: number,
    y: number,
    letterSpacing: number
  ): number {
    const useWholeLine = !letterSpacing || this.ARABIC_REGEX.test(line);
    if (useWholeLine) {
      ctx.fillText(line, x, y);
      return ctx.measureText(line).width;
    }
    let offset = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      ctx.fillText(char, x + offset, y);
      offset += ctx.measureText(char).width + letterSpacing;
    }
    return offset - letterSpacing;
  }

  /**
   * Stroke a line of text with optional letter spacing.
   * For Arabic we always draw the whole line so shaping is preserved.
   */
  private static strokeTextLine(
    ctx: CanvasRenderingContext2D,
    line: string,
    x: number,
    y: number,
    letterSpacing: number
  ): void {
    const useWholeLine = !letterSpacing || this.ARABIC_REGEX.test(line);
    if (useWholeLine) {
      ctx.strokeText(line, x, y);
      return;
    }
    let offset = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      ctx.strokeText(char, x + offset, y);
      offset += ctx.measureText(char).width + letterSpacing;
    }
  }

  /**
   * Render caption without keyword highlighting
   */
  private static renderSimpleCaption(
    ctx: CanvasRenderingContext2D,
    text: string,
    style: Caption["style"],
    position: { x: number; y: number },
    videoWidth: number | undefined,
    caption: Caption
  ): void {
    const direction = this.getDirection(caption);
    ctx.direction = direction;

    // Font: include Arabic fallback when RTL
    const fontFamily = this.fontStackWithArabic(style.fontFamily);
    const fontStyle = style.fontStyle || "normal";
    const fontWeight = style.fontWeight || "normal";
    ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";

    const letterSpacing = style.letterSpacing ?? 0;
    const padding = style.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const maxTextWidth = style.maxWidth
      ? style.maxWidth - padding.left - padding.right
      : videoWidth
        ? videoWidth * 0.8 - padding.left - padding.right
        : 800;

    const lines = this.wrapText(ctx, text, maxTextWidth);
    const lineHeight = this.getLineHeight(style);
    const totalTextHeight = lines.length * lineHeight;
    const maxLineWidth = Math.max(
      ...lines.map((line) => {
        if (!letterSpacing) return ctx.measureText(line).width;
        let w = 0;
        for (let i = 0; i < line.length; i++) {
          w += ctx.measureText(line[i]).width + letterSpacing;
        }
        return w - letterSpacing;
      })
    );
    const textWidth = maxLineWidth;
    const textHeight = totalTextHeight;

    const bgWidth = textWidth + padding.left + padding.right;
    const bgHeight = style.customHeight || textHeight + padding.top + padding.bottom;

    const textAlign = style.textAlign || "center";
    const isRtl = direction === "rtl";
    let textX = position.x;
    let bgX = position.x;

    if (textAlign === "center") {
      ctx.textAlign = "center";
      textX = position.x;
      bgX = position.x - bgWidth / 2;
    } else if (textAlign === "left") {
      ctx.textAlign = isRtl ? "right" : "left";
      textX = isRtl ? position.x + bgWidth / 2 - padding.right : position.x - bgWidth / 2 + padding.left;
      bgX = position.x - bgWidth / 2;
    } else if (textAlign === "right") {
      ctx.textAlign = isRtl ? "left" : "right";
      textX = isRtl ? position.x - bgWidth / 2 + padding.left : position.x + bgWidth / 2 - padding.right;
      bgX = position.x - bgWidth / 2;
    } else {
      ctx.textAlign = "center";
      textX = position.x;
      bgX = position.x - bgWidth / 2;
    }

    if (style.backgroundColor && style.backgroundColor !== "transparent") {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(bgX, position.y - bgHeight / 2, bgWidth, bgHeight);
    }

    if (
      style.shadow &&
      (style.shadow.blur > 0 || style.shadow.offsetX !== 0 || style.shadow.offsetY !== 0)
    ) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
      ctx.shadowBlur = style.shadow.blur;
    }

    const startY = position.y - ((lines.length - 1) * lineHeight) / 2;
    ctx.fillStyle = style.color;
    ctx.globalAlpha = style.opacity ?? 1;

    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;

      if (style.strokeColor && style.strokeWidth) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth;
        this.strokeTextLine(ctx, line, textX, y, letterSpacing);
      }

      this.drawTextLine(ctx, line, textX, y, letterSpacing);

      if (style.textDecoration === "underline") {
        const lineWidth =
          letterSpacing > 0
            ? [...line].reduce((w, c) => w + ctx.measureText(c).width + letterSpacing, -letterSpacing)
            : ctx.measureText(line).width;
        const underlineY = y + style.fontSize / 2 + 2;
        const leftEdge =
          ctx.textAlign === "center"
            ? textX - lineWidth / 2
            : ctx.textAlign === "right"
              ? textX - lineWidth
              : textX;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = Math.max(1, Math.floor(style.fontSize / 20));
        ctx.beginPath();
        ctx.moveTo(leftEdge, underlineY);
        ctx.lineTo(leftEdge + lineWidth, underlineY);
        ctx.stroke();
      }
    });

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
    ctx.direction = "ltr";
  }

  /**
   * Wrap segments into multiple lines based on max width
   */
  private static wrapSegments(
    ctx: CanvasRenderingContext2D,
    segments: Array<{
      text: string;
      isKeyword: boolean;
      fontWeight?: string;
      color?: string;
      backgroundColor?: string;
    }>,
    maxWidth: number,
    fontStyle: string,
    fontWeight: string,
    fontSize: number,
    fontFamily: string
  ): Array<
    Array<{
      text: string;
      isKeyword: boolean;
      fontWeight?: string;
      color?: string;
      backgroundColor?: string;
    }>
  > {
    const lines: Array<
      Array<{
        text: string;
        isKeyword: boolean;
        fontWeight?: string;
        color?: string;
        backgroundColor?: string;
      }>
    > = [];
    let currentLine: Array<{
      text: string;
      isKeyword: boolean;
      fontWeight?: string;
      color?: string;
      backgroundColor?: string;
    }> = [];
    let currentLineWidth = 0;

    for (const segment of segments) {
      const segFont =
        segment.isKeyword && segment.fontWeight
          ? `${fontStyle} ${segment.fontWeight} ${fontSize}px ${fontFamily}`
          : `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.font = segFont;
      const segmentWidth = ctx.measureText(segment.text).width;

      // Check if adding this segment would exceed max width
      if (currentLineWidth + segmentWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [segment];
        currentLineWidth = segmentWidth;
      } else {
        currentLine.push(segment);
        currentLineWidth += segmentWidth;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [segments];
  }

  /**
   * Render caption with keyword highlighting
   */
  private static renderCaptionWithKeywords(
    ctx: CanvasRenderingContext2D,
    text: string,
    style: Caption["style"],
    position: { x: number; y: number },
    videoWidth: number | undefined,
    caption: Caption
  ): void {
    const direction = this.getDirection(caption);
    ctx.direction = direction;

    const fontFamily = this.fontStackWithArabic(style.fontFamily);
    const fontStyle = style.fontStyle || "normal";
    const fontWeight = style.fontWeight || "normal";
    ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";

    const padding = style.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const maxTextWidth = style.maxWidth
      ? style.maxWidth - padding.left - padding.right
      : videoWidth
        ? videoWidth * 0.8 - padding.left - padding.right
        : 800;

    const segments = this.parseTextSegments(text, style.keywordHighlights!);
    const wrappedLines = this.wrapSegments(
      ctx,
      segments,
      maxTextWidth,
      fontStyle,
      fontWeight,
      style.fontSize,
      fontFamily
    );

    const lineHeight = this.getLineHeight(style);
    const totalTextHeight = wrappedLines.length * lineHeight;

    // Find max line width
    let maxLineWidth = 0;
    wrappedLines.forEach((line) => {
      let lineWidth = 0;
      line.forEach((seg) => {
        const segFont =
          seg.isKeyword && seg.fontWeight
            ? `${fontStyle} ${seg.fontWeight} ${style.fontSize}px ${fontFamily}`
            : ctx.font;
        ctx.font = segFont;
        lineWidth += ctx.measureText(seg.text).width;
      });
      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    });

    const bgWidth = maxLineWidth + padding.left + padding.right;
    const bgHeight = totalTextHeight + padding.top + padding.bottom;

    // Calculate starting X position based on alignment
    const textAlign = style.textAlign || "center";
    let baseX = position.x;

    if (textAlign === "center") {
      baseX = position.x;
    } else if (textAlign === "right") {
      baseX = position.x + maxLineWidth / 2 - padding.right;
    } else {
      baseX = position.x - maxLineWidth / 2 + padding.left;
    }

    // Draw background for entire text block
    if (style.backgroundColor && style.backgroundColor !== "transparent") {
      const bgX = position.x - bgWidth / 2;
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(bgX, position.y - bgHeight / 2, bgWidth, bgHeight);
    }

    // Apply shadow if specified
    if (
      style.shadow &&
      (style.shadow.blur > 0 || style.shadow.offsetX !== 0 || style.shadow.offsetY !== 0)
    ) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
      ctx.shadowBlur = style.shadow.blur;
    }

    // Render each line
    const startY = position.y - ((wrappedLines.length - 1) * lineHeight) / 2;

    wrappedLines.forEach((line, lineIndex) => {
      const lineY = startY + lineIndex * lineHeight;

      // Calculate line width for alignment
      let lineWidth = 0;
      line.forEach((seg) => {
        const segFont =
          seg.isKeyword && seg.fontWeight
            ? `${fontStyle} ${seg.fontWeight} ${style.fontSize}px ${fontFamily}`
            : `${fontStyle} ${fontWeight} ${style.fontSize}px ${fontFamily}`;
        ctx.font = segFont;
        lineWidth += ctx.measureText(seg.text).width;
      });

      // Calculate starting X for this line based on alignment
      let currentX = position.x;
      if (textAlign === "center") {
        currentX = position.x - lineWidth / 2;
      } else if (textAlign === "right") {
        currentX = position.x - lineWidth;
      } else {
        currentX = position.x - maxLineWidth / 2 + padding.left;
      }

      // Render each segment in the line
      ctx.textAlign = "left";
      line.forEach((segment) => {
        // Set segment-specific styling
        const segFont =
          segment.isKeyword && segment.fontWeight
            ? `${fontStyle} ${segment.fontWeight} ${style.fontSize}px ${fontFamily}`
            : `${fontStyle} ${fontWeight} ${style.fontSize}px ${fontFamily}`;
        ctx.font = segFont;

        const segWidth = ctx.measureText(segment.text).width;
        const color = segment.isKeyword && segment.color ? segment.color : style.color;

        // Draw keyword background if specified
        if (segment.isKeyword && segment.backgroundColor) {
          ctx.fillStyle = segment.backgroundColor;
          ctx.fillRect(currentX, lineY - style.fontSize / 2, segWidth, style.fontSize);
        }

        // Draw stroke
        if (style.strokeColor && style.strokeWidth) {
          ctx.strokeStyle = style.strokeColor;
          ctx.lineWidth = style.strokeWidth;
          ctx.strokeText(segment.text, currentX, lineY);
        }

        // Draw text
        ctx.fillStyle = color;
        ctx.globalAlpha = style.opacity ?? 1;
        ctx.fillText(segment.text, currentX, lineY);

        currentX += segWidth;
      });
    });

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
    ctx.direction = "ltr";
  }

  /**
   * Render caption with karaoke (current-word highlight) using wordTimestamps
   */
  private static renderCaptionWithKaraoke(
    ctx: CanvasRenderingContext2D,
    caption: Caption,
    videoWidth: number,
    videoHeight: number,
    currentTime: number
  ): void {
    const { style, position, wordTimestamps } = caption;
    if (!wordTimestamps || wordTimestamps.length === 0) {
      this.renderSimpleCaption(ctx, caption.text, style, position, videoWidth, caption);
      return;
    }

    const direction = this.getDirection(caption);
    ctx.direction = direction;

    const fontFamily = this.fontStackWithArabic(style.fontFamily);
    const fontStyle = style.fontStyle || "normal";
    const fontWeight = style.fontWeight || "normal";
    ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${fontFamily}`;
    ctx.textBaseline = "middle";

    const padding = style.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const maxTextWidth = style.maxWidth
      ? style.maxWidth - padding.left - padding.right
      : videoWidth * 0.8 - padding.left - padding.right;

    const activeColor = style.karaokeActiveColor ?? style.color;
    const activeScale = style.karaokeActiveScale ?? 1.2;

    let currentWordIndex = -1;
    for (let i = 0; i < wordTimestamps.length; i++) {
      const w = wordTimestamps[i];
      if (currentTime >= w.start && currentTime <= w.end) {
        currentWordIndex = i;
        break;
      }
    }

    const lineHeight = this.getLineHeight(style);

    const lines: typeof wordTimestamps[] = [];
    let currentLine: typeof wordTimestamps = [];
    let currentWidth = 0;

    for (const w of wordTimestamps) {
      const wordWidth = ctx.measureText(w.text + " ").width;
      if (currentWidth + wordWidth > maxTextWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [w];
        currentWidth = wordWidth;
      } else {
        currentLine.push(w);
        currentWidth += wordWidth;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    const totalHeight = lines.length * lineHeight;
    const bgWidth =
      Math.max(
        ...lines.map((line) =>
          line.reduce((sum, w) => sum + ctx.measureText(w.text + " ").width, 0)
        )
      ) +
      padding.left +
      padding.right;
    const bgHeight = totalHeight + padding.top + padding.bottom;

    if (style.backgroundColor && style.backgroundColor !== "transparent") {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(
        position.x - bgWidth / 2,
        position.y - bgHeight / 2,
        bgWidth,
        bgHeight
      );
    }

    if (
      style.shadow &&
      (style.shadow.blur > 0 || style.shadow.offsetX !== 0 || style.shadow.offsetY !== 0)
    ) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
      ctx.shadowBlur = style.shadow.blur;
    }

    let globalWordIndex = 0;
    const startY = position.y - ((lines.length - 1) * lineHeight) / 2;
    const isRtl = direction === "rtl";

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineY = startY + lineIndex * lineHeight;
      const lineWidth = line.reduce((sum, w) => sum + ctx.measureText(w.text + " ").width, 0);
      const textAlign = style.textAlign || "center";

      if (isRtl) {
        ctx.textAlign = "right";
        // RTL: first word (logically) is on the right; start at right edge and move left
        let x =
          textAlign === "center"
            ? position.x + lineWidth / 2
            : textAlign === "right"
              ? position.x + lineWidth / 2
              : position.x - lineWidth / 2 + lineWidth;

        for (const w of line) {
          const wordWidth = ctx.measureText(w.text).width;
          const spaceWidth = ctx.measureText(" ").width;
          const isActive = globalWordIndex === currentWordIndex;
          const scale = isActive ? activeScale : 1;
          const color = isActive ? activeColor : style.color;
          const wordCenterX = x - wordWidth / 2;

          ctx.save();
          ctx.fillStyle = color;
          if (scale !== 1) {
            ctx.translate(wordCenterX, lineY);
            ctx.scale(scale, scale);
            ctx.translate(-wordCenterX, -lineY);
          }
          if (style.strokeColor && style.strokeWidth) {
            ctx.strokeStyle = style.strokeColor;
            ctx.lineWidth = style.strokeWidth;
            ctx.strokeText(w.text, x, lineY);
          }
          ctx.fillText(w.text, x, lineY);
          ctx.restore();

          x -= wordWidth + spaceWidth;
          globalWordIndex++;
        }
      } else {
        ctx.textAlign = "left";
        let x =
          textAlign === "center"
            ? position.x - lineWidth / 2
            : textAlign === "right"
              ? position.x + lineWidth / 2 - lineWidth
              : position.x - lineWidth / 2;

        for (const w of line) {
          const isActive = globalWordIndex === currentWordIndex;
          const scale = isActive ? activeScale : 1;
          const color = isActive ? activeColor : style.color;
          const wordWidth = ctx.measureText(w.text).width;

          ctx.save();
          ctx.fillStyle = color;
          if (scale !== 1) {
            ctx.translate(x + wordWidth / 2, lineY);
            ctx.scale(scale, scale);
            ctx.translate(-(x + wordWidth / 2), -lineY);
          }
          if (style.strokeColor && style.strokeWidth) {
            ctx.strokeStyle = style.strokeColor;
            ctx.lineWidth = style.strokeWidth;
            ctx.strokeText(w.text, x, lineY);
          }
          ctx.fillText(w.text, x, lineY);
          ctx.restore();

          x += ctx.measureText(w.text + " ").width;
          globalWordIndex++;
        }
      }
    }

    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
    ctx.direction = "ltr";
    ctx.textAlign = "left";
  }

  /**
   * Parse text into segments with keyword information
   */
  private static parseTextSegments(
    text: string,
    keywords: NonNullable<Caption["style"]["keywordHighlights"]>
  ): Array<{
    text: string;
    isKeyword: boolean;
    color?: string;
    backgroundColor?: string;
    fontWeight?: string;
  }> {
    const segments: ReturnType<typeof this.parseTextSegments> = [];
    let remainingText = text;
    let currentIndex = 0;

    while (remainingText.length > 0) {
      let foundKeyword = false;

      // Check each keyword
      for (const keyword of keywords) {
        const keywordIndex = remainingText.toLowerCase().indexOf(keyword.text.toLowerCase());

        if (keywordIndex === 0) {
          // Found a keyword at the start
          segments.push({
            text: remainingText.substring(0, keyword.text.length),
            isKeyword: true,
            color: keyword.color,
            backgroundColor: keyword.backgroundColor,
            fontWeight: keyword.fontWeight,
          });

          remainingText = remainingText.substring(keyword.text.length);
          currentIndex += keyword.text.length;
          foundKeyword = true;
          break;
        }
      }

      if (!foundKeyword) {
        // Find next keyword or take rest of text
        let nextKeywordIndex = remainingText.length;

        for (const keyword of keywords) {
          const idx = remainingText.toLowerCase().indexOf(keyword.text.toLowerCase());
          if (idx > 0 && idx < nextKeywordIndex) {
            nextKeywordIndex = idx;
          }
        }

        // Add non-keyword segment
        segments.push({
          text: remainingText.substring(0, nextKeywordIndex),
          isKeyword: false,
        });

        remainingText = remainingText.substring(nextKeywordIndex);
        currentIndex += nextKeywordIndex;
      }
    }

    return segments;
  }

  /**
   * Apply text transformation (uppercase, lowercase, capitalize)
   */
  private static applyTextTransform(
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
   * Scale caption position to fit new video dimensions
   * Uses percentage-based positioning to maintain relative position
   */
  static scaleCaptionPosition(
    caption: Caption,
    targetWidth: number,
    targetHeight: number
  ): Caption {
    // Original dimensions (portrait - default)
    const originalWidth = 1080;
    const originalHeight = 1920;

    // If dimensions match, no scaling needed
    if (targetWidth === originalWidth && targetHeight === originalHeight) {
      return caption;
    }

    // Convert to percentage-based positioning
    const percentX = (caption.position.x / originalWidth) * 100;
    const percentY = (caption.position.y / originalHeight) * 100;

    // Convert back to pixel coordinates for target dimensions
    const scaledX = (percentX / 100) * targetWidth;
    const scaledY = (percentY / 100) * targetHeight;

    // Ensure position is within bounds with some padding
    const padding = 50; // Keep some padding from edges
    const safeX = Math.max(padding, Math.min(scaledX, targetWidth - padding));
    const safeY = Math.max(padding, Math.min(scaledY, targetHeight - padding));

    return {
      ...caption,
      position: {
        x: safeX,
        y: safeY,
      },
    };
  }

  /**
   * Update caption visibility based on trim points
   */
  static updateCaptionVisibility(
    captions: Caption[],
    trimStart: number,
    trimEnd: number
  ): Caption[] {
    return captions.map((caption) => ({
      ...caption,
      isVisible:
        caption.startTime >= trimStart &&
        caption.endTime <= trimEnd &&
        caption.startTime < caption.endTime,
    }));
  }
}
