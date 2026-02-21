"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import Moveable from "moveable";
import { useCaptionRenderer } from "@/lib/hooks/useCaptionRenderer";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { DEFAULT_SAFE_AREAS, type Caption } from "@/types";
import styles from "./CaptionCanvas.module.css";

interface CaptionCanvasProps {
  videoWidth?: number;
  videoHeight?: number;
  className?: string;
}

export function CaptionCanvas({
  videoWidth = 1080,
  videoHeight = 1920,
  className,
}: Readonly<CaptionCanvasProps>) {
  const t = useTranslations("captionCanvas");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 540, height: 960 });
  const canvasRef = useCaptionRenderer(videoWidth, videoHeight);
  const {
    showSafeAreas,
    captions,
    selectedCaptionId,
    setSelectedCaptionId,
    setSelectedCaptionHeightInVideo,
    updateCaptionPosition,
    updateCaptionStyle,
    currentPlayheadTime,
    trimPoints,
  } = useReelEditorStore();

  // Don't clear canvas - let captions render normally
  // The canvas has transparent background so video shows through

  const moveableRef = useRef<Moveable | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fixedPositionDuringResizeRef = useRef<{
    left: string;
    top: string;
  } | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const isDoubleClickRef = useRef<boolean>(false);
  /** Caption height in video coordinates (for alignment buttons) */
  const captionHeightVideoRef = useRef<number>(0);

  // Update canvas size to match container
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && canvasRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const canvasRect = canvasRef.current.getBoundingClientRect();
        // Canvas height excludes controls
        const canvasHeight = canvasRect.height || containerRect.height - 56;
        setDimensions({
          width: canvasRect.width || containerRect.width,
          height: canvasHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    // Also update on any layout changes
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    if (canvasRef.current) {
      observer.observe(canvasRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateDimensions);
      observer.disconnect();
    };
  }, [canvasRef]);

  // Calculate safe area percentages
  const safeAreaStyle = {
    top: `${(DEFAULT_SAFE_AREAS.top / videoHeight) * 100}%`,
    left: `${(DEFAULT_SAFE_AREAS.left / videoWidth) * 100}%`,
    right: `${(DEFAULT_SAFE_AREAS.right / videoWidth) * 100}%`,
    bottom: `${(DEFAULT_SAFE_AREAS.bottom / videoHeight) * 100}%`,
  };

  const selectedCaption = captions.find((c) => c.id === selectedCaptionId);
  const isOutsideSafeArea = selectedCaption
    ? selectedCaption.position.x < DEFAULT_SAFE_AREAS.left ||
      selectedCaption.position.x > videoWidth - DEFAULT_SAFE_AREAS.right ||
      selectedCaption.position.y < DEFAULT_SAFE_AREAS.top ||
      selectedCaption.position.y > videoHeight - DEFAULT_SAFE_AREAS.bottom
    : false;

  // Handle canvas click to select/deselect caption
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // CRITICAL: If we're currently dragging or resizing, don't process clicks
      // This prevents accidental deselection during interactions
      if (isDraggingRef.current || isResizingRef.current) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // CRITICAL: If a caption is selected, NEVER deselect from canvas clicks
      // Deselection can only happen via:
      // 1. Escape key (handled by keyboard handler)
      // 2. Clicking outside video area (handled by ReelEditor)
      // 3. Clicking on another caption (when no caption is selected)
      if (selectedCaption) {
        // Completely ignore ALL canvas clicks when a caption is selected
        // Don't deselect, don't process, just return
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // CRITICAL: Ignore double-clicks completely - they're handled by the moveable target
      if (e.detail === 2 || e.detail > 2) {
        isDoubleClickRef.current = true;
        // Clear the flag after a delay to catch any delayed events
        setTimeout(() => {
          isDoubleClickRef.current = false;
        }, 500);
        return;
      }

      // Check if this is the second click of a double-click (within 500ms)
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;
      if (timeSinceLastClick < 500 && timeSinceLastClick > 0) {
        // This is likely part of a double-click, ignore it
        isDoubleClickRef.current = true;
        setTimeout(() => {
          isDoubleClickRef.current = false;
        }, 500);
        lastClickTimeRef.current = 0;
        return;
      }
      lastClickTimeRef.current = now;

      // If we just had a double-click, ignore this click
      if (isDoubleClickRef.current) {
        return;
      }

      // Don't interfere with controls - check if click is in controls area
      const target = e.target as HTMLElement;
      if (
        target.closest(".controls") ||
        target.closest("button") ||
        target.closest(`.${styles.moveableTarget}`)
      ) {
        return; // Let controls or Moveable handle the click
      }

      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) {
        return;
      }

      // Use canvas dimensions for accurate click detection
      const containerRect = containerRef.current.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      // Canvas height excludes controls (calc(100% - 56px))
      const canvasHeight = canvasRect.height || containerRect.height - 56;
      const canvasWidth = canvasRect.width || containerRect.width;

      const scaleX = videoWidth / canvasWidth;
      const scaleY = videoHeight / canvasHeight;

      // Calculate click position relative to canvas
      const canvasLeft = canvasRect.left;
      const canvasTop = canvasRect.top;

      const x = (e.clientX - canvasLeft) * scaleX;
      const y = (e.clientY - canvasTop) * scaleY;

      // Helper function to check if a click is within a caption's bounds
      const isClickWithinCaptionBounds = (caption: (typeof captions)[0]): boolean => {
        // Use the actual canvas context for accurate measurements (matches renderer exactly)
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;

        // Save context state
        ctx.save();

        const padding = caption.style.padding || {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        };
        const fontSize = caption.style.fontSize || 48;
        const maxWidth = caption.style.maxWidth || 800;

        const fontStyle = caption.style.fontStyle || "normal";
        const fontWeight = caption.style.fontWeight || "normal";
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${caption.style.fontFamily}`;

        // Measure text to get actual dimensions
        const words = caption.text.split(" ");
        const maxTextWidth = maxWidth - padding.left - padding.right;
        let currentLine = "";
        let lines: string[] = [];

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const metrics = ctx.measureText(testLine);

          if (metrics.width > maxTextWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          lines.push(currentLine);
        }

        const lineHeight = fontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
        const bgWidth = maxLineWidth + padding.left + padding.right;

        // Use custom height if set by user, otherwise calculate from text
        const customHeight = caption.style.customHeight;
        const bgHeight = customHeight || totalTextHeight + padding.top + padding.bottom;

        const captionX = caption.position.x;
        const captionY = caption.position.y;

        // Restore context state
        ctx.restore();

        // Add tolerance to account for any measurement differences or rounding errors
        // Use a percentage-based tolerance (20% of dimensions) plus a fixed minimum
        // Very large tolerance to be extremely forgiving of click detection
        const toleranceX = Math.max(bgWidth * 0.2, 50);
        const toleranceY = Math.max(bgHeight * 0.2, 50);

        // Check if click is within caption bounds (with tolerance)
        const isWithin =
          x >= captionX - bgWidth / 2 - toleranceX &&
          x <= captionX + bgWidth / 2 + toleranceX &&
          y >= captionY - bgHeight / 2 - toleranceY &&
          y <= captionY + bgHeight / 2 + toleranceY;

        return isWithin;
      };

      // Find all visible captions at current time FIRST
      const relativeTime = currentPlayheadTime - trimPoints.startTime;
      const visibleCaptions = captions.filter((caption) => {
        if (!caption.isVisible) return false;
        const captionStart = caption.startTime - trimPoints.startTime;
        const captionEnd = caption.endTime - trimPoints.startTime;
        return relativeTime >= captionStart && relativeTime <= captionEnd;
      });

      // Find caption at click position (using same calculation as renderer)
      const clickedCaption = visibleCaptions.find((caption) => isClickWithinCaptionBounds(caption));

      // CRITICAL: If a caption is selected, check IMMEDIATELY if click is within its bounds
      // This must happen BEFORE deselecting to prevent the caption from disappearing
      if (selectedCaption) {
        // Store selected caption in a const to avoid TypeScript narrowing issues
        // Type assertion needed because TypeScript has trouble with narrowing in callbacks
        const currentSelectedCaption: Caption = selectedCaption;
        const currentSelectedCaptionId = currentSelectedCaption.id;

        // First check: if click is on the moveable target element itself (fastest check)
        if (targetRef.current) {
          const moveableTarget = targetRef.current;
          if (target === moveableTarget || moveableTarget.contains(target)) {
            e.stopPropagation();
            e.preventDefault();
            return;
          }

          // Second check: if click coordinates are within the moveable target bounds (quick check)
          const targetRect = targetRef.current.getBoundingClientRect();
          const tolerance = 50; // Very large tolerance to be safe
          if (
            e.clientX >= targetRect.left - tolerance &&
            e.clientX <= targetRect.right + tolerance &&
            e.clientY >= targetRect.top - tolerance &&
            e.clientY <= targetRect.bottom + tolerance
          ) {
            e.stopPropagation();
            e.preventDefault();
            return;
          }
        }

        // Third check: if we found a caption at click position AND it's the selected one
        if (clickedCaption && clickedCaption.id === currentSelectedCaptionId) {
          // Click is on the selected caption, don't deselect
          e.stopPropagation();
          e.preventDefault();
          return;
        }

        // Fourth check: use caption bounds calculation for selected caption (most accurate)
        if (isClickWithinCaptionBounds(currentSelectedCaption)) {
          // Click is on the selected caption, don't deselect
          e.stopPropagation();
          e.preventDefault();
          return;
        }

        // Fifth check: if ANY caption is at click position, don't deselect (safety net)
        // This handles cases where bounds calculation might be slightly off
        if (clickedCaption) {
          // Found a caption at click position - don't deselect, just keep current selection
          e.stopPropagation();
          e.preventDefault();
          return;
        }

        // Sixth check: Check ALL visible captions (not just selected) to see if click is near any
        // This is a final safety net - if click is anywhere near any caption, don't deselect
        for (const caption of visibleCaptions) {
          if (isClickWithinCaptionBounds(caption)) {
            // Click is near a caption (maybe bounds calculation was off for selected caption)
            // Don't deselect to be safe
            e.stopPropagation();
            e.preventDefault();
            return;
          }
        }

        // Only deselect if we're absolutely certain click is outside ALL captions
        // Final check: make sure we're not currently interacting
        // Log for debugging
        console.log("[CaptionCanvas] Deselecting caption - click outside bounds", {
          clickX: x,
          clickY: y,
          selectedCaptionPos: {
            x: currentSelectedCaption.position.x,
            y: currentSelectedCaption.position.y,
          },
          isDragging: isDraggingRef.current,
          isResizing: isResizingRef.current,
        });

        if (!isDraggingRef.current && !isResizingRef.current) {
          setSelectedCaptionId(null);
        }
        return;
      }

      if (clickedCaption) {
        setSelectedCaptionId(clickedCaption.id);
      } else {
        setSelectedCaptionId(null);
      }
    },
    [
      captions,
      currentPlayheadTime,
      trimPoints,
      videoWidth,
      videoHeight,
      canvasRef,
      selectedCaption,
      setSelectedCaptionId,
      targetRef,
    ]
  );

  // Handle escape key to deselect caption
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCaption) {
        // Aggressively cleanup drag handle before deselecting
        // Check both targetRef and container directly to ensure cleanup
        if (targetRef.current) {
          const dragHandle = (targetRef.current as any)?._dragHandle as HTMLDivElement;
          if (dragHandle) {
            try {
              if (dragHandle.parentNode) {
                dragHandle.parentNode.removeChild(dragHandle);
              }
              delete (targetRef.current as any)._dragHandle;
            } catch (error) {
              console.warn("[CaptionCanvas] Error removing drag handle on ESC:", error);
            }
          }
        }

        // Also check container directly for any drag handles (fallback)
        if (containerRef.current) {
          // Use data attribute for more reliable selection
          const dragHandles = containerRef.current.querySelectorAll('[data-drag-handle="true"]');
          dragHandles.forEach((handle) => {
            try {
              handle.remove();
            } catch (error) {
              console.warn("[CaptionCanvas] Error removing drag handle from container:", error);
            }
          });
        }

        setSelectedCaptionId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCaption, setSelectedCaptionId]);

  // CRITICAL: Add native click listener on canvas in capture phase to intercept clicks BEFORE React's onClick
  // This prevents React's onClick handler from firing when clicking on selected caption
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeClick = (e: MouseEvent) => {
      // If a caption is selected, check if click is on moveable target
      if (selectedCaption && targetRef.current) {
        const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        if (elementAtPoint === targetRef.current || targetRef.current.contains(elementAtPoint)) {
          // Click is on moveable target - stop React's onClick from firing
          e.stopImmediatePropagation();
          return;
        }

        // Check bounds as backup
        const targetRect = targetRef.current.getBoundingClientRect();
        const tolerance = 100;
        if (
          e.clientX >= targetRect.left - tolerance &&
          e.clientX <= targetRect.right + tolerance &&
          e.clientY >= targetRect.top - tolerance &&
          e.clientY <= targetRect.bottom + tolerance
        ) {
          // Click is near moveable target - stop React's onClick from firing
          e.stopImmediatePropagation();
          return;
        }

        // If caption is selected and click is NOT in safe zone, prevent React onClick
        const containerRect = containerRef.current?.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        if (containerRect && canvasRect) {
          const canvasHeight = canvasRect.height || containerRect.height - 56;
          const canvasWidth = canvasRect.width || containerRect.width;
          const scaleX = videoWidth / canvasWidth;
          const scaleY = videoHeight / canvasHeight;
          const canvasLeft = canvasRect.left;
          const canvasTop = canvasRect.top;
          const x = (e.clientX - canvasLeft) * scaleX;
          const y = (e.clientY - canvasTop) * scaleY;
          const safeZoneSize = 50;

          // Only allow React onClick if clicking in safe zone
          if (!(x <= safeZoneSize && y <= safeZoneSize)) {
            // Click is NOT in safe zone - prevent React onClick from firing
            e.stopImmediatePropagation();
            return;
          }
        }
      }
    };

    // Add listener in capture phase to intercept BEFORE React's onClick
    canvas.addEventListener("click", handleNativeClick, true);

    return () => {
      canvas.removeEventListener("click", handleNativeClick, true);
    };
  }, [selectedCaption, canvasRef, targetRef, containerRef, videoWidth, videoHeight]);

  // Update target position when caption position changes externally (without recreating Moveable)
  useEffect(() => {
    // Skip if we're currently dragging or resizing
    if (isDraggingRef.current || isResizingRef.current) {
      console.log(
        "[CaptionCanvas] Skipping external update - drag:",
        isDraggingRef.current,
        "resize:",
        isResizingRef.current
      );
      return;
    }
    if (
      !selectedCaption ||
      !targetRef.current ||
      !moveableRef.current ||
      !containerRef.current ||
      !canvasRef.current
    )
      return;

    const target = targetRef.current;
    const container = containerRef.current;
    const canvas = canvasRef.current;

    // Only update if Moveable is not currently being dragged/resized
    // We'll use a flag to track this
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const canvasHeight = canvasRect.height || containerRect.height - 56;
    const canvasWidth = canvasRect.width || containerRect.width;
    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;

    // Recalculate target dimensions and position
    const padding = selectedCaption.style.padding || {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const fontSize = selectedCaption.style.fontSize || 48;
    const maxWidth = selectedCaption.style.maxWidth || 800;
    const maxTextWidth = maxWidth - padding.left - padding.right;

    // IMPORTANT: Read customHeight but don't add it to dependency array to prevent recalculation loops
    const customHeight = selectedCaption.style.customHeight; // Custom height from user resize

    console.log("[CaptionCanvas] External update - customHeight:", customHeight);

    // Measure text to get actual dimensions
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (tempCtx) {
      const fontStyle = selectedCaption.style.fontStyle || "normal";
      const fontWeight = selectedCaption.style.fontWeight || "normal";
      tempCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${selectedCaption.style.fontFamily}`;

      const words = selectedCaption.text.split(" ");
      let currentLine = "";
      let lines: string[] = [];

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = tempCtx.measureText(testLine);

        if (metrics.width > maxTextWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }

      const lineHeight = fontSize * 1.2;
      const totalTextHeight = lines.length * lineHeight;
      const maxLineWidth = Math.max(...lines.map((line) => tempCtx.measureText(line).width));
      const bgWidth = maxLineWidth + padding.left + padding.right;

      // Use custom height if set by user, otherwise calculate from text
      const bgHeight = customHeight || totalTextHeight + padding.top + padding.bottom;

      console.log(
        "[CaptionCanvas] Calculated dimensions - bgWidth:",
        bgWidth,
        "bgHeight:",
        bgHeight,
        "using customHeight:",
        !!customHeight
      );

      // Calculate position in canvas coordinates
      const canvasX = selectedCaption.position.x * scaleX;
      const canvasY = selectedCaption.position.y * scaleY;
      // Calculate scaled dimensions - use exact same calculation as renderer
      const scaledWidth = bgWidth * scaleX;
      const scaledHeight = bgHeight * scaleY;

      // Use exact calculated dimensions without rounding to match canvas rendering precisely
      const targetWidth = scaledWidth;
      const targetHeight = scaledHeight;

      // Calculate canvas offset to convert from canvas coordinates to container coordinates
      const canvasOffsetX = canvasRect.left - containerRect.left;
      const canvasOffsetY = canvasRect.top - containerRect.top;

      // Position target relative to container (matching Moveable setup logic)
      // Use exact calculated position to match canvas rendering precisely
      const expectedLeft = canvasX + canvasOffsetX - targetWidth / 2;
      const expectedTop = canvasY + canvasOffsetY - targetHeight / 2;

      // Check if position or size changed (to avoid infinite loops)
      const currentLeft = Number.parseFloat(target.style.left) || 0;
      const currentTop = Number.parseFloat(target.style.top) || 0;
      const currentWidth = Number.parseFloat(target.style.width) || 0;
      const currentHeight = Number.parseFloat(target.style.height) || 0;

      const positionChanged =
        Math.abs(currentLeft - expectedLeft) > 1 || Math.abs(currentTop - expectedTop) > 1;
      const widthChanged = Math.abs(currentWidth - targetWidth) > 1;
      const heightChanged = Math.abs(currentHeight - targetHeight) > 1;

      // If customHeight is set, don't update height (user set it via resize)
      // Only update height if it's not a custom height OR if it changed significantly (scale change)
      const shouldUpdateHeight = !customHeight || heightChanged;

      if (positionChanged || widthChanged || (heightChanged && shouldUpdateHeight)) {
        console.log(
          "[CaptionCanvas] External update applying - position:",
          { expectedLeft, expectedTop },
          "size:",
          { targetWidth, targetHeight },
          "customHeight:",
          customHeight,
          "shouldUpdateHeight:",
          shouldUpdateHeight
        );
        // CRITICAL: Only update position if NOT resizing/dragging
        // During resize, we MUST keep left/top fixed to prevent resize handles from jumping
        if (!isResizingRef.current && !isDraggingRef.current) {
          target.style.left = `${expectedLeft}px`;
          target.style.top = `${expectedTop}px`;
          target.style.width = `${targetWidth}px`;

          // Only update height if we should
          if (shouldUpdateHeight) {
            target.style.height = `${targetHeight}px`;
          }
        } else {
          // During resize/drag, DO NOT update position or size at all
          // This keeps the resize handles fixed and prevents jumping
          console.log(
            "[CaptionCanvas] External update blocked - keeping position fixed during resize/drag"
          );
          return; // Exit early to prevent any updates
        }

        // Update drag handle position when target position changes
        // Skip if resizing to prevent jumps
        if (!isResizingRef.current && !isDraggingRef.current) {
          const dragHandle = (target as any)?._dragHandle as HTMLDivElement;
          if (dragHandle) {
            const handleSize = Number.parseFloat(dragHandle.style.width) || 16;
            dragHandle.style.transform = "none"; // Clear any transform
            dragHandle.style.left = `${expectedLeft + targetWidth}px`; // Square's left edge aligns with rectangle's right edge
            dragHandle.style.top = `${expectedTop - handleSize}px`; // Square's bottom edge aligns with rectangle's top edge
          }
        }

        // Update Moveable to recognize new position/size
        // Don't update if we're currently resizing or dragging to prevent jumps
        // Use a small delay to ensure resize/drag flags are set before this runs
        if (!isResizingRef.current && !isDraggingRef.current) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Double-check flags after animation frames to avoid race conditions
              if (moveableRef.current && !isResizingRef.current && !isDraggingRef.current) {
                moveableRef.current.updateRect();
              }
            });
          });
        }
      }
    }
  }, [
    selectedCaption?.position.x,
    selectedCaption?.position.y,
    selectedCaption?.text,
    selectedCaption?.style.maxWidth,
    selectedCaption?.style.fontSize,
    selectedCaption?.style.fontFamily,
    dimensions,
    videoWidth,
    videoHeight,
  ]);

  // Setup Moveable for dragging
  useEffect(() => {
    if (!selectedCaption || !containerRef.current) {
      // Disable pointer events on container when no caption selected
      if (containerRef.current) {
        containerRef.current.style.pointerEvents = "none";
      }

      // Canvas pointer events will be re-enabled via inline style when selectedCaption is null
      // Cleanup existing Moveable instance
      if (moveableRef.current) {
        try {
          moveableRef.current.destroy();
        } catch (error) {
          console.warn("[CaptionCanvas] Error destroying Moveable:", error);
        }
        moveableRef.current = null;
      }
      // Cleanup drag handle first (it's appended to container, not target)
      if (targetRef.current) {
        const dragHandle = (targetRef.current as any)?._dragHandle as HTMLDivElement;
        if (dragHandle && containerRef.current && containerRef.current.contains(dragHandle)) {
          try {
            dragHandle.remove();
            delete (targetRef.current as any)._dragHandle;
          } catch (error) {
            console.warn("[CaptionCanvas] Error removing drag handle:", error);
          }
        }
      }

      // Cleanup target element
      if (
        targetRef.current &&
        containerRef.current &&
        containerRef.current.contains(targetRef.current)
      ) {
        try {
          targetRef.current.remove();
        } catch (error) {
          console.warn("[CaptionCanvas] Error removing target:", error);
        }
        targetRef.current = null;
      }
      setSelectedCaptionHeightInVideo(null);
      return;
    }

    // Create a target element for Moveable
    if (!targetRef.current) {
      const target = document.createElement("div");
      target.className = styles.moveableTarget;
      if (containerRef.current) {
        containerRef.current.appendChild(target);
        targetRef.current = target;
      }
    }

    if (!targetRef.current || !containerRef.current) {
      return;
    }

    const target = targetRef.current;
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!canvas) return;

    // CRITICAL: Use canvas dimensions for scale calculation (captions are rendered on canvas)
    // But position target relative to container (Moveable uses container as reference)
    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // Canvas is CSS-scaled, so use its actual rendered size for scale calculation
    const canvasRenderedWidth = canvasRect.width;
    const canvasRenderedHeight = canvasRect.height;

    // Calculate scale based on canvas rendered dimensions (matches how captions are rendered)
    const scaleX = canvasRenderedWidth / videoWidth;
    const scaleY = canvasRenderedHeight / videoHeight;

    // Container dimensions for bounds
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Calculate actual caption bounds (matching the renderer logic)
    const padding = selectedCaption.style.padding || {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const fontSize = selectedCaption.style.fontSize || 48;
    // Match renderer exactly: use maxWidth if specified, otherwise videoWidth * 0.8, fallback to 800
    const maxWidth = selectedCaption.style.maxWidth
      ? selectedCaption.style.maxWidth
      : videoWidth
        ? videoWidth * 0.8
        : 800;

    // Use the actual canvas context for measurement to match renderer exactly
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // CRITICAL: Ensure canvas internal dimensions match video dimensions (like renderer does)
    // This ensures text measurement matches exactly. The renderer sets these every frame,
    // but we need to ensure they're correct for our measurement.
    // Note: Setting canvas.width/height clears the canvas, but the renderer will redraw immediately
    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }

    // Save context state
    ctx.save();

    const fontStyle = selectedCaption.style.fontStyle || "normal";
    const fontWeight = selectedCaption.style.fontWeight || "normal";
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${selectedCaption.style.fontFamily}`;
    ctx.textBaseline = "middle"; // Match renderer exactly
    // textAlign doesn't affect measureText, but set it for consistency
    ctx.textAlign = "center";

    // Measure text to get actual dimensions (matching renderer's wrapText logic exactly)
    const words = selectedCaption.text.split(" ");
    const maxTextWidth = maxWidth - padding.left - padding.right;
    let currentLine = "";
    let lines: string[] = [];

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    // Ensure at least one line (matching renderer: return lines.length > 0 ? lines : [text])
    if (lines.length === 0) {
      lines = [selectedCaption.text];
    }

    const lineHeight = fontSize * 1.2; // Match renderer exactly
    const totalTextHeight = lines.length * lineHeight;

    // Calculate actual line widths (matching renderer exactly)
    // Renderer uses: maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width))
    const lineWidths = lines.map((line) => ctx.measureText(line).width);
    const maxLineWidth = Math.max(...lineWidths);

    // CRITICAL: Match renderer exactly
    // Renderer: textWidth = maxLineWidth, textHeight = totalTextHeight
    // Renderer: bgWidth = textWidth + padding.left + padding.right
    // Renderer: bgHeight = textHeight + padding.top + padding.bottom
    const textWidth = maxLineWidth;
    const textHeight = totalTextHeight;

    // CRITICAL: Ensure padding values are numbers (not undefined/null)
    const paddingLeft = padding.left || 0;
    const paddingRight = padding.right || 0;
    const bgWidth = textWidth + paddingLeft + paddingRight;

    // Use custom height if set by user, otherwise calculate from text (matching renderer)
    const customHeight = selectedCaption.style.customHeight;
    // Renderer uses: bgHeight = textHeight + padding.top + padding.bottom
    // But if user resized, use customHeight
    const bgHeight = customHeight || textHeight + padding.top + padding.bottom;

    captionHeightVideoRef.current = bgHeight;
    setSelectedCaptionHeightInVideo(bgHeight);

    // Restore context state
    ctx.restore();

    console.log("[CaptionCanvas] Dimension calculation:", {
      lines: lines.length,
      lineWidths,
      maxLineWidth,
      textWidth,
      textHeight,
      bgWidth,
      bgHeight,
      maxWidth,
      customHeight,
      padding,
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingTotal: padding.left + padding.right,
      calculatedHeight: textHeight + padding.top + padding.bottom,
      scaleX,
      scaleY,
      scaledWidth: bgWidth * scaleX,
      scaledHeight: bgHeight * scaleY,
      targetWidth: Math.round(bgWidth * scaleX),
      targetHeight: Math.round(bgHeight * scaleY),
      canvasInternalSize: { width: canvas.width, height: canvas.height },
      canvasRenderedSize: {
        width: canvasRenderedWidth,
        height: canvasRenderedHeight,
      },
      videoSize: { width: videoWidth, height: videoHeight },
    });

    // Position target at caption position (matching renderer)
    // Caption position is in video coordinates, convert to canvas screen coordinates
    const canvasX = selectedCaption.position.x * scaleX;
    const canvasY = selectedCaption.position.y * scaleY;
    // Calculate scaled dimensions - use exact same calculation as renderer
    const scaledWidth = bgWidth * scaleX;
    const scaledHeight = bgHeight * scaleY;

    // Use exact calculated dimensions without rounding to match canvas rendering precisely
    // Canvas rendering uses exact pixel values, so we should too
    const targetWidth = scaledWidth;
    const targetHeight = scaledHeight;

    // Canvas is absolutely positioned, but we need to account for any offset
    // Calculate offset from container to canvas
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;

    // Position target relative to container (Moveable uses container as reference)
    // Add canvas offset to convert from canvas coordinates to container coordinates
    // Use exact calculated position to match canvas rendering precisely
    const targetLeft = canvasX + canvasOffsetX - targetWidth / 2;
    const targetTop = canvasY + canvasOffsetY - targetHeight / 2;

    console.log("[CaptionCanvas] Positioning target:", {
      captionPosition: {
        x: selectedCaption.position.x,
        y: selectedCaption.position.y,
      },
      scale: { scaleX, scaleY },
      canvasPosition: { x: canvasX, y: canvasY },
      canvasOffset: { x: canvasOffsetX, y: canvasOffsetY },
      bgSize: {
        width: bgWidth,
        height: bgHeight,
        customHeight: !!customHeight,
      },
      targetSize: { width: targetWidth, height: targetHeight },
      targetTopLeft: { left: targetLeft, top: targetTop },
      containerSize: { width: containerWidth, height: containerHeight },
      canvasSize: { width: canvasRenderedWidth, height: canvasRenderedHeight },
      videoSize: { width: videoWidth, height: videoHeight },
    });

    target.style.position = "absolute";
    target.style.left = `${targetLeft}px`; // Center horizontally
    target.style.top = `${targetTop}px`; // Center vertically
    // Use exact calculated dimensions - match canvas rendering precisely
    target.style.width = `${targetWidth}px`;
    target.style.height = `${targetHeight}px`;
    target.style.transform = "none"; // No initial transform
    target.style.margin = "0"; // Remove any margins
    target.style.padding = "0"; // CRITICAL: No padding - box should match rendered background exactly
    target.style.position = "absolute";
    target.style.left = `${targetLeft}px`;
    target.style.top = `${targetTop}px`;
    target.style.width = `${targetWidth}px`;
    target.style.height = `${targetHeight}px`;
    target.style.transform = "none";
    target.style.margin = "0";
    target.style.padding = "0";
    // Disable pointer events on target - only drag handle will be draggable
    target.style.pointerEvents = "none";
    target.style.boxSizing = "content-box";
    target.style.border = "none";
    target.style.cursor = "default"; // Default cursor - not draggable
    target.style.zIndex = "5000";
    target.style.backgroundColor = "transparent";
    target.style.outline = "2px dashed rgba(255, 107, 122, 0.6)";
    target.style.outlineOffset = "0";
    target.style.touchAction = "none";

    // Create drag handle in top-right corner - THE ONLY place where dragging is allowed
    let dragHandle = (target as any)?._dragHandle as HTMLDivElement;
    if (!dragHandle) {
      dragHandle = document.createElement("div");
      dragHandle.className = styles.dragHandle;
      dragHandle.setAttribute("data-drag-handle", "true"); // Add data attribute for easy finding
      dragHandle.style.position = "absolute";
      dragHandle.style.zIndex = "5002"; // Above resize handles (5001)
      container.appendChild(dragHandle);
      (target as any)._dragHandle = dragHandle;
    }

    // Position drag handle in top-right corner
    const handleSize = 16; // Larger size for better visibility
    dragHandle.style.left = `${targetLeft + targetWidth}px`; // Right edge of target
    dragHandle.style.top = `${targetTop - handleSize}px`; // Above top edge
    dragHandle.style.transform = "none";
    dragHandle.style.width = `${handleSize}px`;
    dragHandle.style.height = `${handleSize}px`;

    // Cleanup existing Moveable before creating new one
    if (moveableRef.current) {
      try {
        moveableRef.current.destroy();
      } catch (error) {
        console.warn("[CaptionCanvas] Error destroying existing Moveable:", error);
      }
    }

    // CRITICAL: Keep container pointer-events as none to never block video
    // Individual elements (target, controls) will have pointer-events: auto
    container.style.pointerEvents = "none";

    // Ensure target is visible and ready
    target.style.display = "block";
    target.style.visibility = "visible";
    target.style.opacity = "1";
    // Outline is already set above

    // Add mousedown handler in CAPTURE phase to track clicks (but don't stop propagation)
    // Moveable needs mousedown events for dragging, so we can't stop propagation here
    // We'll prevent canvas click handler in the click event instead
    const mousedownCaptureHandler = (e: MouseEvent) => {
      // Don't stop propagation - Moveable needs this for dragging
      // Just track timing for double-click detection
      const now = Date.now();
      if (now - lastClickTimeRef.current < 500) {
        isDoubleClickRef.current = true;
      }
      lastClickTimeRef.current = now;
    };

    // Add click handler to prevent canvas click handler from firing
    // This prevents deselection when clicking on the moveable target
    // Note: Dragging uses mousedown/mousemove/mouseup, NOT click events, so stopping click won't affect dragging
    const clickHandler = (e: MouseEvent) => {
      // Stop immediate propagation to prevent canvas click handler from firing
      // This is safe because dragging doesn't use click events
      e.stopPropagation();
      e.stopImmediatePropagation();
      // Don't prevent default - let browser handle normally
    };

    // Add double-click handler to prevent deselection
    const doubleClickHandler = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      e.stopImmediatePropagation();
      isDoubleClickRef.current = true;
      setTimeout(() => {
        isDoubleClickRef.current = false;
      }, 500);
      return false;
    };

    // Add mousedown handler for Moveable (needs to run after capture handler)
    const mousedownHandler = (e: MouseEvent) => {
      // This runs after capture phase, Moveable can use it for dragging
      // Timing already tracked in capture handler
    };

    // CRITICAL: Add handlers in capture phase to intercept BEFORE canvas handler
    target.addEventListener("mousedown", mousedownCaptureHandler, true); // Capture phase!
    target.addEventListener("click", clickHandler, true); // Capture phase!
    target.addEventListener("mousedown", mousedownHandler, false); // Bubble phase for Moveable
    target.addEventListener("dblclick", doubleClickHandler, true); // Capture phase!

    // Store handlers for cleanup
    (target as any)._clickHandler = clickHandler;
    (target as any)._doubleClickHandler = doubleClickHandler;
    (target as any)._mousedownHandler = mousedownHandler;
    (target as any)._mousedownCaptureHandler = mousedownCaptureHandler;

    // Ensure target is in the DOM before initializing Moveable
    if (!container.contains(target)) {
      container.appendChild(target);
    }

    // Force a reflow to ensure target is rendered
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    target.offsetHeight;

    // Safe-area snap guidelines in container coordinates
    const safeLeft = canvasOffsetX + DEFAULT_SAFE_AREAS.left * scaleX;
    const safeRight = canvasOffsetX + (videoWidth - DEFAULT_SAFE_AREAS.right) * scaleX;
    const safeTop = canvasOffsetY + DEFAULT_SAFE_AREAS.top * scaleY;
    const safeBottom = canvasOffsetY + (videoHeight - DEFAULT_SAFE_AREAS.bottom) * scaleY;

    // Initialize Moveable
    let moveable: Moveable | null = null;
    try {
      // Container needs pointer-events for Moveable to work, but video controls have higher z-index
      container.style.position = "relative";
      // CSS will handle pointer-events via :has(.moveableTarget) selector

      moveable = new Moveable(container, {
        target: target,
        draggable: true,
        resizable: true,
        rotatable: false,
        scalable: false,
        throttleDrag: 0,
        throttleResize: 0,
        renderDirections: ["nw", "n", "w", "e", "sw", "s", "se"],
        edge: ["nw", "n", "w", "e", "sw", "s", "se"],
        checkInput: false,
        bounds: {
          left: 0,
          top: 0,
          right: containerWidth,
          bottom: containerHeight,
        },
        dragTarget: dragHandle,
        keepRatio: selectedCaption.style.lockAspectRatio === true,
        snappable: true,
        snapThreshold: 5,
        horizontalGuidelines: [safeLeft, safeRight],
        verticalGuidelines: [safeTop, safeBottom],
        origin: false,
      });

      moveableRef.current = moveable;

      // Note: Moveable doesn't have a dblclick event, but we handle it via DOM events

      // Wait for DOM to settle, then update Moveable
      // Use double requestAnimationFrame to ensure everything is rendered
      // But don't update if we're resizing or dragging
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (moveableRef.current && target && container.contains(target)) {
            // Don't update if resizing or dragging to prevent jumps
            if (!isResizingRef.current && !isDraggingRef.current) {
              // Update Moveable to recognize the target's current position
              moveableRef.current.updateRect();
            }

            // Test if Moveable can detect the target
            const rect = moveableRef.current.getRect();
            const targetRect = target.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            console.log("[CaptionCanvas] Moveable initialized:", {
              targetExists: !!target,
              targetInDOM: container.contains(target),
              targetRect: targetRect,
              containerRect: containerRect,
              targetPosition: {
                left: target.style.left,
                top: target.style.top,
                computedLeft: targetRect.left - containerRect.left,
                computedTop: targetRect.top - containerRect.top,
              },
              moveableRect: rect,
              moveableCanDetectTarget: rect.width > 0 && rect.height > 0,
            });

            // Verify target is positioned correctly relative to container
            if (
              Math.abs(
                targetRect.left - containerRect.left - Number.parseFloat(target.style.left || "0")
              ) > 5 ||
              Math.abs(
                targetRect.top - containerRect.top - Number.parseFloat(target.style.top || "0")
              ) > 5
            ) {
              console.warn("[CaptionCanvas] Target position mismatch detected!", {
                styleLeft: target.style.left,
                styleTop: target.style.top,
                computedLeft: targetRect.left - containerRect.left,
                computedTop: targetRect.top - containerRect.top,
              });
            }
          } else {
            console.error("[CaptionCanvas] Moveable initialization failed:", {
              moveableExists: !!moveableRef.current,
              targetExists: !!target,
              targetInDOM: target ? container.contains(target) : false,
            });
          }
        });
      });

      moveable.on("dragStart", (e) => {
        console.log("[CaptionCanvas] Drag started", {
          target: e.target,
          inputEvent: e.inputEvent,
        });
        isDraggingRef.current = true;
      });

      moveable.on("drag", (e) => {
        if (!selectedCaption || !container || !target || !canvas) return;
        const { left, top, transform, translate, width } = e;

        console.log("[CaptionCanvas] Dragging", { left, top, translate });

        // Apply transform directly without modifying left/top
        // Moveable handles positioning via transform during drag
        target.style.transform = transform || "none";

        // Update drag handle position during drag - use event data directly to avoid jumps
        const dragHandle = (target as any)?._dragHandle as HTMLDivElement;
        if (dragHandle) {
          const handleSize = Number.parseFloat(dragHandle.style.width) || 10;
          const targetWidth = width || Number.parseFloat(target.style.width) || 0;
          // Use left/top from event (which accounts for transform) instead of getBoundingClientRect
          dragHandle.style.transform = "none"; // Don't use transform, use absolute positioning
          dragHandle.style.left = `${left + targetWidth}px`; // Align with right edge
          dragHandle.style.top = `${top - handleSize}px`; // Position above top edge
        }

        // Don't update left/top during drag - Moveable uses transform
        // We'll update the actual position in dragEnd
      });

      moveable.on("dragEnd", (e) => {
        const lastEvent = e.lastEvent as any;
        console.log("[CaptionCanvas] Drag ended", {
          left: lastEvent?.left,
          top: lastEvent?.top,
          lastEvent: e.lastEvent,
        });

        if (!selectedCaption || !container || !target || !canvas) return;

        const { left, top } = lastEvent || {};

        // Update actual left/top position after drag completes
        target.style.left = `${left}px`;
        target.style.top = `${top}px`;
        target.style.transform = "none"; // Clear transform

        // Update drag handle position - clear transform and use final position
        const dragHandle = (target as any)?._dragHandle as HTMLDivElement;
        if (dragHandle) {
          const handleSize = Number.parseFloat(dragHandle.style.width) || 10;
          const targetWidth = Number.parseFloat(target.style.width) || bgWidth * scaleX;
          dragHandle.style.transform = "none"; // Clear transform
          dragHandle.style.left = `${left + targetWidth}px`; // Square's left edge aligns with rectangle's right edge
          dragHandle.style.top = `${top - handleSize}px`; // Square's bottom edge aligns with rectangle's top edge
        }

        // Calculate scale
        const canvasRect = canvas.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const canvasHeight = canvasRect.height || containerRect.height - 56;
        const canvasWidth = canvasRect.width || containerRect.width;
        const currentScaleX = canvasWidth / videoWidth;
        const currentScaleY = canvasHeight / videoHeight;

        // Get target dimensions
        const targetWidth = Number.parseFloat(target.style.width) || bgWidth * scaleX;
        const targetHeight = Number.parseFloat(target.style.height) || bgHeight * scaleY;

        // Calculate center position in container coordinates
        const centerXContainer = left + targetWidth / 2;
        const centerYContainer = top + targetHeight / 2;

        // Convert to video coordinates
        const centerX = centerXContainer / currentScaleX;
        const centerY = centerYContainer / currentScaleY;

        // Update caption position
        updateCaptionPosition(selectedCaption.id, { x: centerX, y: centerY });

        // Delay resetting the drag flag to prevent external updates from interfering
        setTimeout(() => {
          isDraggingRef.current = false;
          console.log("[CaptionCanvas] Drag flag cleared after timeout");
        }, 1000);

        // Final update to ensure position is correct
        // Use a delay to ensure resize/drag flags are cleared first
        setTimeout(() => {
          if (moveableRef.current && !isResizingRef.current && !isDraggingRef.current) {
            moveableRef.current.updateRect();
          }
        }, 100);
      });

      // Canvas pointer events are already disabled via inline style when selectedCaption exists
      // Moveable should now be able to interact with the target

      moveable.on("resizeStart", (e) => {
        console.log("[CaptionCanvas] Resize started", {
          target: e.target,
          inputEvent: e.inputEvent,
          direction: e.direction,
        });
        // Set flag IMMEDIATELY at the very start to prevent any external updates
        // This must happen synchronously, before any other code runs
        isResizingRef.current = true;

        // Store the CURRENT position from getBoundingClientRect to get actual rendered position
        // This accounts for any transforms that might be applied
        const targetRect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const actualLeft = targetRect.left - containerRect.left;
        const actualTop = targetRect.top - containerRect.top;

        // Store the fixed position to prevent any changes during resize
        // Use the actual rendered position, not the style value
        fixedPositionDuringResizeRef.current = {
          left: `${actualLeft}px`,
          top: `${actualTop}px`,
        };

        // Also update the style to ensure it matches the actual position
        target.style.left = `${actualLeft}px`;
        target.style.top = `${actualTop}px`;
        target.style.transform = "none"; // Clear any transform before resize

        // Prevent any position updates that might be queued
        // The external update effect checks this flag, so setting it here prevents jumps
      });

      moveable.on("resize", (e) => {
        if (!selectedCaption || !target || !canvas || !container) return;
        // Only update if actively resizing (not just hovering)
        if (!isResizingRef.current) return;

        const eventData = e as any;
        const { width, height, transform, drag, left, top, direction } = eventData;

        console.log("[CaptionCanvas] Resizing", {
          width,
          height,
          direction,
          drag,
          left,
          top,
        });

        // Apply size and transform - ALLOW BOTH width and height to change
        // CRITICAL: Only update width/height, NOT left/top - Moveable handles position via transform
        // CRITICAL: Keep left/top FIXED during resize to prevent resize handles from jumping

        // Store current position before any updates
        const currentLeft = target.style.left;
        const currentTop = target.style.top;

        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
        target.style.transform = transform || "none";

        // CRITICAL: ALWAYS restore the fixed position IMMEDIATELY after updating size/transform
        // This must happen synchronously to prevent any jumps
        // Use the stored fixed position from resizeStart, or fallback to current if not set
        const fixedPos = fixedPositionDuringResizeRef.current || {
          left: currentLeft,
          top: currentTop,
        };
        target.style.left = fixedPos.left;
        target.style.top = fixedPos.top;

        // Double-check: if position was changed by something else, restore it again
        // This ensures position stays fixed even if external code tries to change it
        if (target.style.left !== fixedPos.left) {
          target.style.left = fixedPos.left;
        }
        if (target.style.top !== fixedPos.top) {
          target.style.top = fixedPos.top;
        }

        // DO NOT update target.style.left or target.style.top here - it causes jumps
        // Moveable uses transform to position during resize, and we'll update left/top in resizeEnd

        // Don't update drag handle position during resize - it causes jumping
        // We'll update it in resizeEnd after resize completes

        // Don't update position or recalculate during resize - wait for resizeEnd
        // Moveable handles positioning via transform
      });

      moveable.on("resizeEnd", (e) => {
        const eventData = e as any;
        const lastEvent = e.lastEvent as any;
        console.log("[CaptionCanvas] Resize ended", {
          width: eventData?.width,
          height: eventData?.height,
          lastEvent: e.lastEvent,
          direction: eventData?.direction,
        });

        if (!selectedCaption || !container || !target || !canvas) return;

        // Read actual dimensions from the target element (already set during resize)
        const targetRect = target.getBoundingClientRect();
        const width = targetRect.width;
        const height = targetRect.height;

        // Get position from drag or calculate from current position
        const drag = lastEvent?.drag || eventData?.drag;
        const left =
          drag?.left !== undefined ? drag.left : Number.parseFloat(target.style.left) || 0;
        const top = drag?.top !== undefined ? drag.top : Number.parseFloat(target.style.top) || 0;

        console.log("[CaptionCanvas] Final dimensions from target:", {
          width,
          height,
          left,
          top,
        });

        // Update actual size and position after resize completes
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
        target.style.left = `${left}px`;
        target.style.top = `${top}px`;
        target.style.transform = "none"; // Clear transform

        // Update drag handle position (size stays fixed) - clear transform after resize
        const dragHandle = (target as any)?._dragHandle as HTMLDivElement;
        if (dragHandle) {
          const handleSize = Number.parseFloat(dragHandle.style.width) || 16;
          dragHandle.style.transform = "none"; // Clear transform
          dragHandle.style.left = `${left + width}px`; // Square's left edge aligns with rectangle's right edge
          dragHandle.style.top = `${top - handleSize}px`; // Square's bottom edge aligns with rectangle's top edge
        }

        // Calculate scale
        const canvasRect = canvas.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const canvasHeight = canvasRect.height || containerRect.height - 56;
        const canvasWidth = canvasRect.width || containerRect.width;
        const currentScaleX = canvasWidth / videoWidth;
        const currentScaleY = canvasHeight / videoHeight;

        // Convert dimensions to video coordinates and save them
        const newWidth = width / currentScaleX;
        const newHeight = height / currentScaleY;

        console.log("[CaptionCanvas] Saving dimensions - width:", newWidth, "height:", newHeight);

        // Update both width and custom height in caption style
        updateCaptionStyle(selectedCaption.id, {
          maxWidth: Math.max(200, Math.round(newWidth)),
          customHeight: Math.max(50, Math.round(newHeight)), // Save custom height
        });

        // Always update position to ensure center point is correct after resize
        const centerXContainer = left + width / 2;
        const centerYContainer = top + height / 2;
        const centerX = centerXContainer / currentScaleX;
        const centerY = centerYContainer / currentScaleY;

        console.log("[CaptionCanvas] Updating position - center:", {
          centerX,
          centerY,
        });
        updateCaptionPosition(selectedCaption.id, { x: centerX, y: centerY });

        // Keep resizing flag true for a short time to prevent external updates from interfering
        // Clear any existing timeout
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }

        // Clear the fixed position reference
        fixedPositionDuringResizeRef.current = null;

        // Delay resetting the flag to give state updates time to propagate
        // Use longer timeout to ensure state updates complete (1 second to be safe)
        resizeTimeoutRef.current = setTimeout(() => {
          isResizingRef.current = false;
          console.log("[CaptionCanvas] Resize flag cleared after timeout");
        }, 1000);

        // Final update to ensure size and position are correct
        if (moveableRef.current) {
          moveableRef.current.updateRect();
        }
      });
    } catch (error) {
      console.error("[CaptionCanvas] Error creating Moveable:", error);
      return;
    }

    return () => {
      // Clear any pending timeouts
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }

      // Reset flags
      isDraggingRef.current = false;
      isResizingRef.current = false;

      // Ensure container pointer events stay as none (don't block video)
      if (containerRef.current) {
        containerRef.current.style.pointerEvents = "none";
      }

      // Canvas pointer events will be re-enabled via inline style when selectedCaption becomes null
      // Cleanup Moveable
      if (moveableRef.current) {
        try {
          moveableRef.current.destroy();
        } catch (error) {
          console.warn("[CaptionCanvas] Error destroying Moveable in cleanup:", error);
        }
        moveableRef.current = null;
      }

      // Cleanup drag handle first (before target cleanup)
      if (targetRef.current) {
        const dragHandle = (targetRef.current as any)?._dragHandle as HTMLDivElement;
        if (dragHandle) {
          try {
            if (dragHandle.parentNode) {
              dragHandle.parentNode.removeChild(dragHandle);
            }
            delete (targetRef.current as any)._dragHandle;
          } catch (error) {
            console.warn("[CaptionCanvas] Error removing drag handle in cleanup:", error);
          }
        }
      }

      // Also check container directly for any drag handles (fallback)
      if (containerRef.current) {
        // Use data attribute for more reliable selection
        const dragHandles = containerRef.current.querySelectorAll('[data-drag-handle="true"]');
        dragHandles.forEach((handle) => {
          try {
            handle.remove();
          } catch (error) {
            console.warn(
              "[CaptionCanvas] Error removing drag handle from container in cleanup:",
              error
            );
          }
        });
      }

      // Cleanup target element
      if (
        targetRef.current &&
        containerRef.current &&
        containerRef.current.contains(targetRef.current)
      ) {
        try {
          // Remove event listeners
          const clickHandler = (targetRef.current as any)?._clickHandler;
          const doubleClickHandler = (targetRef.current as any)?._doubleClickHandler;
          const mousedownHandler = (targetRef.current as any)?._mousedownHandler;
          const mousedownCaptureHandler = (targetRef.current as any)?._mousedownCaptureHandler;
          if (clickHandler) {
            targetRef.current.removeEventListener("click", clickHandler, true);
          }
          if (doubleClickHandler) {
            targetRef.current.removeEventListener("dblclick", doubleClickHandler, true);
          }
          if (mousedownHandler) {
            targetRef.current.removeEventListener("mousedown", mousedownHandler, false);
          }
          if (mousedownCaptureHandler) {
            targetRef.current.removeEventListener("mousedown", mousedownCaptureHandler, true);
          }

          targetRef.current.remove();
        } catch (error) {
          console.warn("[CaptionCanvas] Error removing target in cleanup:", error);
        }
        targetRef.current = null;
      }
    };
  }, [
    selectedCaption?.id,
    selectedCaption?.style?.lockAspectRatio,
    dimensions,
    videoWidth,
    videoHeight,
    updateCaptionPosition,
    updateCaptionStyle,
    canvasRef,
  ]);

  // Handle double-click on container to prevent deselection
  const handleContainerDoubleClick = useCallback((e: React.MouseEvent) => {
    // Stop double-click from propagating to canvas
    e.stopPropagation();
    e.preventDefault();
    // Note: stopImmediatePropagation() is not available on React synthetic events
    // Set flag to prevent canvas click handler
    isDoubleClickRef.current = true;
    setTimeout(() => {
      isDoubleClickRef.current = false;
    }, 500);
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "calc(100% - 56px)",
        zIndex: 10,
      }}
      onDoubleClick={handleContainerDoubleClick}
    >
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${className || ""}`}
        width={videoWidth}
        height={videoHeight}
        style={{
          width: "100%",
          height: "100%", // Fill container completely (container already excludes controls)
          cursor: selectedCaption ? "default" : "pointer",
          // Canvas must be clickable for caption selection
          pointerEvents: "auto",
          touchAction: "none",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          objectFit: "contain", // Match video's object-fit
        }}
        onClick={handleCanvasClick}
        onDoubleClick={(e) => {
          // Prevent double-click from deselecting caption
          e.stopPropagation();
          e.preventDefault();
          isDoubleClickRef.current = true;
          setTimeout(() => {
            isDoubleClickRef.current = false;
          }, 500);
        }}
      />
      {showSafeAreas && (
        <div className={styles.safeAreaOverlay}>
          <div className={styles.safeAreaBorder} style={safeAreaStyle} />
          <div className={styles.safeAreaLabel}>{t("safeArea")}</div>
        </div>
      )}
      {showSafeAreas && isOutsideSafeArea && (
        <div className={styles.warningIndicator}>{t("outsideSafeArea")}</div>
      )}
    </div>
  );
}
