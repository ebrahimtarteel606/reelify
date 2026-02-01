import { Caption } from '@/types';
import { calculateAnimationProgress, getAnimationTransform, getTypewriterCharCount } from '@/lib/hooks/useCaptionAnimation';

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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Filter captions visible at current time
    const visibleAtTime = captions.filter(
      (caption) =>
        caption.isVisible &&
        currentTime >= caption.startTime &&
        currentTime <= caption.endTime
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
    if (caption.style.animation?.type === 'typewriter') {
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

    this.renderCaption(ctx, modifiedCaption, videoWidth, videoHeight);

    // Restore context state
    ctx.restore();
  }

  /**
   * Render a single caption
   */
  private static renderCaption(
    ctx: CanvasRenderingContext2D,
    caption: Caption,
    videoWidth: number,
    videoHeight: number
  ): void {
    const { style, position } = caption;
    let { text } = caption;

    // Apply text transform
    text = this.applyTextTransform(text, style.textTransform);

    // Check if we have keyword highlights
    const hasKeywords = style.keywordHighlights && style.keywordHighlights.length > 0;

    if (hasKeywords) {
      this.renderCaptionWithKeywords(ctx, text, style, position, videoWidth);
    } else {
      this.renderSimpleCaption(ctx, text, style, position, videoWidth);
    }
  }

  /**
   * Wrap text into multiple lines based on max width
   */
  private static wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

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

  /**
   * Render caption without keyword highlighting
   */
  private static renderSimpleCaption(
    ctx: CanvasRenderingContext2D,
    text: string,
    style: Caption['style'],
    position: { x: number; y: number },
    videoWidth?: number
  ): void {
    // Set font
    const fontStyle = style.fontStyle || 'normal';
    const fontWeight = style.fontWeight || 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    ctx.textBaseline = 'middle';

    // Calculate max width for text wrapping (80% of video width with padding)
    const padding = style.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const maxTextWidth = videoWidth 
      ? (videoWidth * 0.8) - padding.left - padding.right
      : 800; // Fallback width

    // Wrap text into multiple lines
    const lines = this.wrapText(ctx, text, maxTextWidth);

    // Calculate dimensions for multi-line text
    const lineHeight = style.fontSize * 1.2; // Line spacing
    const totalTextHeight = lines.length * lineHeight;
    const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const textWidth = maxLineWidth;
    const textHeight = totalTextHeight;

    // Calculate background dimensions
    const bgWidth = textWidth + padding.left + padding.right;
    const bgHeight = textHeight + padding.top + padding.bottom;

    // Calculate text position based on alignment
    const textAlign = style.textAlign || 'center';
    let textX = position.x;
    let bgX = position.x;

    if (textAlign === 'center') {
      ctx.textAlign = 'center';
      textX = position.x;
      bgX = position.x - bgWidth / 2;
    } else if (textAlign === 'left') {
      ctx.textAlign = 'left';
      textX = position.x - bgWidth / 2 + padding.left;
      bgX = position.x - bgWidth / 2;
    } else if (textAlign === 'right') {
      ctx.textAlign = 'right';
      textX = position.x + bgWidth / 2 - padding.right;
      bgX = position.x - bgWidth / 2;
    } else {
      ctx.textAlign = 'center';
      textX = position.x;
      bgX = position.x - bgWidth / 2;
    }

    // Draw background if specified
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(
        bgX,
        position.y - bgHeight / 2,
        bgWidth,
        bgHeight
      );
    }

    // Apply shadow if specified
    if (style.shadow && (style.shadow.blur > 0 || style.shadow.offsetX !== 0 || style.shadow.offsetY !== 0)) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
      ctx.shadowBlur = style.shadow.blur;
    }

    // Draw each line of text
    const startY = position.y - (lines.length - 1) * lineHeight / 2;
    ctx.fillStyle = style.color;
    ctx.globalAlpha = style.opacity ?? 1;

    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      
      // Draw stroke if specified
      if (style.strokeColor && style.strokeWidth) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth;
        ctx.strokeText(line, textX, y);
      }

      // Draw text
      ctx.fillText(line, textX, y);
    });

    ctx.globalAlpha = 1;

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
  }

  /**
   * Wrap segments into multiple lines based on max width
   */
  private static wrapSegments(
    ctx: CanvasRenderingContext2D,
    segments: Array<{ text: string; isKeyword: boolean; fontWeight?: string; color?: string; backgroundColor?: string }>,
    maxWidth: number,
    fontStyle: string,
    fontWeight: string,
    fontSize: number,
    fontFamily: string
  ): Array<Array<{ text: string; isKeyword: boolean; fontWeight?: string; color?: string; backgroundColor?: string }>> {
    const lines: Array<Array<{ text: string; isKeyword: boolean; fontWeight?: string; color?: string; backgroundColor?: string }>> = [];
    let currentLine: Array<{ text: string; isKeyword: boolean; fontWeight?: string; color?: string; backgroundColor?: string }> = [];
    let currentLineWidth = 0;

    for (const segment of segments) {
      const segFont = segment.isKeyword && segment.fontWeight
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
    style: Caption['style'],
    position: { x: number; y: number },
    videoWidth?: number
  ): void {
    // Parse text into segments
    const segments = this.parseTextSegments(text, style.keywordHighlights!);

    // Set base font
    const fontStyle = style.fontStyle || 'normal';
    const fontWeight = style.fontWeight || 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    ctx.textBaseline = 'middle';

    // Calculate max width for text wrapping (80% of video width with padding)
    const padding = style.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const maxTextWidth = videoWidth 
      ? (videoWidth * 0.8) - padding.left - padding.right
      : 800; // Fallback width

    // Wrap segments into multiple lines
    const wrappedLines = this.wrapSegments(
      ctx,
      segments,
      maxTextWidth,
      fontStyle,
      fontWeight,
      style.fontSize,
      style.fontFamily
    );

    // Calculate total dimensions
    const lineHeight = style.fontSize * 1.2;
    const totalTextHeight = wrappedLines.length * lineHeight;
    
    // Find max line width
    let maxLineWidth = 0;
    wrappedLines.forEach(line => {
      let lineWidth = 0;
      line.forEach(seg => {
        const segFont = seg.isKeyword && seg.fontWeight
          ? `${fontStyle} ${seg.fontWeight} ${style.fontSize}px ${style.fontFamily}`
          : ctx.font;
        ctx.font = segFont;
        lineWidth += ctx.measureText(seg.text).width;
      });
      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    });

    const bgWidth = maxLineWidth + padding.left + padding.right;
    const bgHeight = totalTextHeight + padding.top + padding.bottom;

    // Calculate starting X position based on alignment
    const textAlign = style.textAlign || 'center';
    let baseX = position.x;

    if (textAlign === 'center') {
      baseX = position.x;
    } else if (textAlign === 'right') {
      baseX = position.x + maxLineWidth / 2 - padding.right;
    } else {
      baseX = position.x - maxLineWidth / 2 + padding.left;
    }

    // Draw background for entire text block
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      const bgX = position.x - bgWidth / 2;
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(bgX, position.y - bgHeight / 2, bgWidth, bgHeight);
    }

    // Apply shadow if specified
    if (style.shadow && (style.shadow.blur > 0 || style.shadow.offsetX !== 0 || style.shadow.offsetY !== 0)) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
      ctx.shadowBlur = style.shadow.blur;
    }

    // Render each line
    const startY = position.y - (wrappedLines.length - 1) * lineHeight / 2;
    
    wrappedLines.forEach((line, lineIndex) => {
      const lineY = startY + lineIndex * lineHeight;
      
      // Calculate line width for alignment
      let lineWidth = 0;
      line.forEach(seg => {
        const segFont = seg.isKeyword && seg.fontWeight
          ? `${fontStyle} ${seg.fontWeight} ${style.fontSize}px ${style.fontFamily}`
          : `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
        ctx.font = segFont;
        lineWidth += ctx.measureText(seg.text).width;
      });

      // Calculate starting X for this line based on alignment
      let currentX = position.x;
      if (textAlign === 'center') {
        currentX = position.x - lineWidth / 2;
      } else if (textAlign === 'right') {
        currentX = position.x - lineWidth;
      } else {
        currentX = position.x - maxLineWidth / 2 + padding.left;
      }

      // Render each segment in the line
      ctx.textAlign = 'left';
      line.forEach((segment) => {
        // Set segment-specific styling
        const segFont = segment.isKeyword && segment.fontWeight
          ? `${fontStyle} ${segment.fontWeight} ${style.fontSize}px ${style.fontFamily}`
          : `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
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

    // Reset
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
  }

  /**
   * Parse text into segments with keyword information
   */
  private static parseTextSegments(
    text: string,
    keywords: NonNullable<Caption['style']['keywordHighlights']>
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
