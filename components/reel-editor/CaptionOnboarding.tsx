"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { Brush2, DocumentText, ReceiveSquare, Refresh2, Timer1, Video } from "vuesax-icons-react";
import styles from "./CaptionOnboarding.module.css";

interface CaptionOnboardingProps {
  readonly isVisible: boolean;
  readonly onDismiss: () => void;
  readonly selectedCaptionId: string | null;
}

type OnboardingStep =
  | "video-area"
  | "style-editor"
  | "format-toggle"
  | "timeline"
  | "transcription"
  | "export";

export function CaptionOnboarding({
  isVisible,
  onDismiss,
  selectedCaptionId,
}: CaptionOnboardingProps) {
  const t = useTranslations("captionOnboarding");
  const { captions, setSelectedCaptionId } = useReelEditorStore();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("video-area");
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
    pointerDirection?: "top" | "bottom" | "left" | "right";
  } | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Get default position helper
  const getDefaultPosition = (): {
    top: number;
    left: number;
    pointerDirection: "top" | "bottom" | "left" | "right";
  } => ({
    top: typeof window !== "undefined" ? window.innerHeight / 2 - 150 : 200,
    left: typeof window !== "undefined" ? window.innerWidth / 2 - 175 : 200,
    pointerDirection: "bottom",
  });

  // Auto-select a caption when starting onboarding (first step) if none is selected
  useEffect(() => {
    if (!isVisible) return;

    if (currentStep === "video-area" && !selectedCaptionId && captions.length > 0) {
      // Find the first visible caption
      const firstVisibleCaption = captions.find((caption) => caption.isVisible);
      if (firstVisibleCaption) {
        console.log(
          "[Onboarding] Auto-selecting caption for video-area step:",
          firstVisibleCaption.id
        );
        setSelectedCaptionId(firstVisibleCaption.id);
      }
    }
  }, [isVisible, currentStep, selectedCaptionId, captions, setSelectedCaptionId]);

  // Automatically deselect caption when reaching transcription step
  // This ensures the transcription editor is shown instead of style editor
  useEffect(() => {
    if (isVisible && currentStep === "transcription" && selectedCaptionId) {
      console.log("[Onboarding] Deselecting caption for transcription step");
      setSelectedCaptionId(null);
    }
  }, [isVisible, currentStep, selectedCaptionId, setSelectedCaptionId]);

  useEffect(() => {
    if (!isVisible) {
      setPopoverPosition(null);
      setHighlightRect(null);
      return;
    }

    // Set default position immediately when visible (before calculating actual position)
    if (!popoverPosition) {
      const defaultPos = getDefaultPosition();
      console.log("[Onboarding] Setting default position:", defaultPos);
      setPopoverPosition(defaultPos);
    }

    const updatePosition = (useAnimationFrame = false) => {
      const doUpdate = () => {
        let element: HTMLElement | null = null;

        switch (currentStep) {
          case "video-area":
            // Point to video area
            element = document.querySelector('[data-onboarding="video-area"]') as HTMLElement;
            break;
          case "timeline":
            // Point to timeline
            element = document.querySelector('[data-onboarding="timeline"]') as HTMLElement;
            break;
          case "format-toggle":
            // Point to format toggle slider only (not the whole div)
            // Try to find the slider element within the format toggle
            const formatToggle = document.querySelector(
              '[data-onboarding="format-toggle"]'
            ) as HTMLElement;
            if (formatToggle) {
              // Look for the slider element (it has class toggleSlider)
              element = formatToggle.querySelector(".toggleSlider") as HTMLElement;
              if (!element) {
                // Fallback to the toggle button if slider not found
                element = formatToggle.querySelector("button") as HTMLElement;
              }
              if (!element) {
                // Final fallback to the toggle container
                element = formatToggle;
              }
            }
            break;
          case "style-editor":
            // Point directly to the CaptionStyleEditor component in the sidebar
            // First try to find the style editor (only visible when caption is selected)
            element = document.querySelector('[data-onboarding="style-editor"]') as HTMLElement;
            // Fallback to sidebar content area (where style editor is rendered)
            // This ensures we always have a target even if no caption is selected yet
            if (!element) {
              element = document.querySelector(
                '[data-onboarding="transcription-editor"]'
              ) as HTMLElement;
            }
            // Fallback to sidebar if still not found
            if (!element) {
              element = document.querySelector('[data-onboarding="sidebar"]') as HTMLElement;
            }
            if (!element) {
              element = document.querySelector(".sidebar") as HTMLElement;
            }
            break;
          case "transcription":
            // Point to transcription editor content area
            element = document.querySelector(
              '[data-onboarding="transcription-editor"]'
            ) as HTMLElement;
            if (!element) {
              // Fallback to sidebar
              element = document.querySelector('[data-onboarding="sidebar"]') as HTMLElement;
            }
            break;
          case "export":
            // Point to the actual export button (not the wrapper div)
            const exportWrapper = document.querySelector(
              '[data-onboarding="export-button"]'
            ) as HTMLElement;
            if (exportWrapper) {
              // Find the actual button element inside the wrapper
              element = exportWrapper.querySelector("button") as HTMLElement;
              if (!element) {
                // Try finding by class
                element = exportWrapper.querySelector(".button") as HTMLElement;
              }
              // Fallback to wrapper if button not found
              if (!element) {
                element = exportWrapper;
              }
            }
            break;
        }

        // Get actual popover dimensions if available, otherwise use estimates
        const actualPopoverWidth = popoverRef.current?.offsetWidth || 350;
        const actualPopoverHeight = popoverRef.current?.offsetHeight || 200;
        const padding = 20; // Space between popover and target element
        const viewportPadding = 16; // Minimum space from viewport edges

        if (element) {
          const rect = element.getBoundingClientRect();

          // Check if element is visible
          if (rect.width === 0 || rect.height === 0) {
            console.log("[Onboarding] Element has zero dimensions:", currentStep);
            // Use fallback
            setPopoverPosition({
              top: window.innerHeight / 2 - actualPopoverHeight / 2,
              left: window.innerWidth / 2 - actualPopoverWidth / 2,
              pointerDirection: "bottom",
            });
            setHighlightRect(null);
            return;
          }

          // Calculate center position
          const elementCenterX = rect.left + rect.width / 2;
          const elementCenterY = rect.top + rect.height / 2;

          // Special handling for video-area: position to the right side to avoid overlap
          if (currentStep === "video-area") {
            const spaceRight = window.innerWidth - rect.right;
            const extraPadding = 30; // Padding between video and popover

            if (spaceRight >= actualPopoverWidth + extraPadding) {
              // Position to the right of video area
              let top = elementCenterY - actualPopoverHeight / 2;
              let left = rect.right + extraPadding;
              let pointerDirection: "top" | "bottom" | "left" | "right" = "left";

              // Ensure popover stays within viewport vertically
              if (top < viewportPadding) {
                top = viewportPadding;
              } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                top = window.innerHeight - actualPopoverHeight - viewportPadding;
              }

              // Ensure popover stays within viewport horizontally
              if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
                // If not enough space on right, try left side
                const spaceLeft = rect.left;
                if (spaceLeft >= actualPopoverWidth + extraPadding) {
                  left = rect.left - actualPopoverWidth - extraPadding;
                  pointerDirection = "right";
                } else {
                  // Fall back to below if neither side works
                  top = rect.bottom + extraPadding;
                  left = elementCenterX - actualPopoverWidth / 2;
                  pointerDirection = "top";

                  // Ensure horizontal bounds
                  if (left < viewportPadding) {
                    left = viewportPadding;
                  } else if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
                    left = window.innerWidth - actualPopoverWidth - viewportPadding;
                  }
                }
              }

              setPopoverPosition({ top, left, pointerDirection });
              setHighlightRect(rect);
              return;
            } else {
              // Try left side if right doesn't have enough space
              const spaceLeft = rect.left;
              if (spaceLeft >= actualPopoverWidth + extraPadding) {
                let top = elementCenterY - actualPopoverHeight / 2;
                let left = rect.left - actualPopoverWidth - extraPadding;
                let pointerDirection: "top" | "bottom" | "left" | "right" = "right";

                // Ensure popover stays within viewport
                if (top < viewportPadding) {
                  top = viewportPadding;
                } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                  top = window.innerHeight - actualPopoverHeight - viewportPadding;
                }

                setPopoverPosition({ top, left, pointerDirection });
                setHighlightRect(rect);
                return;
              }
            }
            // If neither side has enough space, fall through to default positioning
          }

          // Special handling for transcription step: position on left side of sidebar (pointing right)
          if (currentStep === "transcription") {
            const spaceLeft = rect.left;
            const extraPadding = 30;

            // Position to the left of transcription editor (inside sidebar)
            if (spaceLeft >= actualPopoverWidth + extraPadding) {
              let top = elementCenterY - actualPopoverHeight / 2;
              let left = rect.left - actualPopoverWidth - extraPadding;
              let pointerDirection: "top" | "bottom" | "left" | "right" = "right";

              // Ensure popover stays within viewport vertically
              if (top < viewportPadding) {
                top = viewportPadding;
              } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                top = window.innerHeight - actualPopoverHeight - viewportPadding;
              }

              // Ensure popover stays within viewport horizontally
              if (left < viewportPadding) {
                // If not enough space on left, try right side
                const spaceRight = window.innerWidth - rect.right;
                if (spaceRight >= actualPopoverWidth + extraPadding) {
                  left = rect.right + extraPadding;
                  pointerDirection = "left";
                } else {
                  // Fall through to default positioning
                }
              } else {
                setPopoverPosition({ top, left, pointerDirection });
                setHighlightRect(rect);
                return;
              }
            } else {
              // Try right side if left doesn't have enough space
              const spaceRight = window.innerWidth - rect.right;
              if (spaceRight >= actualPopoverWidth + extraPadding) {
                let top = elementCenterY - actualPopoverHeight / 2;
                let left = rect.right + extraPadding;
                let pointerDirection: "top" | "bottom" | "left" | "right" = "left";

                // Ensure popover stays within viewport
                if (top < viewportPadding) {
                  top = viewportPadding;
                } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                  top = window.innerHeight - actualPopoverHeight - viewportPadding;
                }
                if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
                  left = window.innerWidth - actualPopoverWidth - viewportPadding;
                }

                setPopoverPosition({ top, left, pointerDirection });
                setHighlightRect(rect);
                return;
              }
            }
            // If neither side has enough space, fall through to default positioning
          }

          // Special handling for style-editor step: position to the left of the style editor, pointing right
          if (currentStep === "style-editor") {
            const extraPadding = 20; // Reduced padding for better positioning
            const spaceLeft = rect.left;

            // Position to the left of the style editor element, pointing right
            // Calculate position relative to the element's left edge
            if (spaceLeft >= actualPopoverWidth + extraPadding) {
              let top = elementCenterY - actualPopoverHeight / 2;
              let left = rect.left - actualPopoverWidth - extraPadding;
              let pointerDirection: "top" | "bottom" | "left" | "right" = "right";

              // Ensure popover stays within viewport vertically
              if (top < viewportPadding) {
                top = viewportPadding;
              } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                top = window.innerHeight - actualPopoverHeight - viewportPadding;
              }

              // Ensure popover stays within viewport horizontally
              if (left >= viewportPadding) {
                setPopoverPosition({ top, left, pointerDirection });
                setHighlightRect(rect);
                return;
              }
            }

            // If not enough space on left, try right side (pointing left)
            const spaceRight = window.innerWidth - rect.right;
            if (spaceRight >= actualPopoverWidth + extraPadding) {
              let top = elementCenterY - actualPopoverHeight / 2;
              let left = rect.right + extraPadding;
              let pointerDirection: "top" | "bottom" | "left" | "right" = "left";

              // Ensure popover stays within viewport
              if (top < viewportPadding) {
                top = viewportPadding;
              } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                top = window.innerHeight - actualPopoverHeight - viewportPadding;
              }
              if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
                left = window.innerWidth - actualPopoverWidth - viewportPadding;
              }

              setPopoverPosition({ top, left, pointerDirection });
              setHighlightRect(rect);
              return;
            }
            // If neither side has enough space, fall through to default positioning
          }

          // Special handling for style-editor step: position relative to moveable box
          if (currentStep === "style-editor") {
            // If pointing to moveable box (caption), position popover near it
            // Otherwise, position relative to sidebar
            const isMoveableBox =
              element &&
              (element.classList.contains("moveableTarget") ||
                element.classList.toString().includes("moveableTarget") ||
                element.classList.toString().includes("moveable"));

            if (isMoveableBox) {
              // Position popover near the moveable box (caption)
              const spaceRight = window.innerWidth - rect.right;
              const spaceLeft = rect.left;
              const extraPadding = 30;

              // Prefer positioning to the right of the caption box
              if (spaceRight >= actualPopoverWidth + extraPadding) {
                let top = elementCenterY - actualPopoverHeight / 2;
                let left = rect.right + extraPadding;
                let pointerDirection: "top" | "bottom" | "left" | "right" = "left";

                // Ensure popover stays within viewport
                if (top < viewportPadding) {
                  top = viewportPadding;
                } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                  top = window.innerHeight - actualPopoverHeight - viewportPadding;
                }
                if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
                  left = window.innerWidth - actualPopoverWidth - viewportPadding;
                }

                setPopoverPosition({ top, left, pointerDirection });
                setHighlightRect(rect);
                return;
              } else if (spaceLeft >= actualPopoverWidth + extraPadding) {
                // Position to the left if right doesn't have space
                let top = elementCenterY - actualPopoverHeight / 2;
                let left = rect.left - actualPopoverWidth - extraPadding;
                let pointerDirection: "top" | "bottom" | "left" | "right" = "right";

                if (top < viewportPadding) {
                  top = viewportPadding;
                } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                  top = window.innerHeight - actualPopoverHeight - viewportPadding;
                }

                setPopoverPosition({ top, left, pointerDirection });
                setHighlightRect(rect);
                return;
              }
              // Fall through to default positioning if neither side works
            } else {
              // Pointing to sidebar - use sidebar positioning logic
              const spaceLeft = rect.left;
              const extraPadding = 30;

              if (spaceLeft >= actualPopoverWidth + extraPadding) {
                let top = elementCenterY - actualPopoverHeight / 2;
                let left = rect.left - actualPopoverWidth - extraPadding;
                let pointerDirection: "top" | "bottom" | "left" | "right" = "right";

                if (top < viewportPadding) {
                  top = viewportPadding;
                } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                  top = window.innerHeight - actualPopoverHeight - viewportPadding;
                }

                if (left < viewportPadding) {
                  const spaceRight = window.innerWidth - rect.right;
                  if (spaceRight >= actualPopoverWidth + extraPadding) {
                    left = rect.right + extraPadding;
                    pointerDirection = "left";
                  }
                } else {
                  setPopoverPosition({ top, left, pointerDirection });
                  setHighlightRect(rect);
                  return;
                }
              }
            }
            // Fall through to default positioning
          }

          // Special handling for export step: position above or below the button
          if (currentStep === "export") {
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const extraPadding = 30;

            // Prefer positioning below button
            if (spaceBelow >= actualPopoverHeight + extraPadding) {
              let top = rect.bottom + extraPadding;
              let left = elementCenterX - actualPopoverWidth / 2;
              let pointerDirection: "top" | "bottom" | "left" | "right" = "top";

              // Ensure popover stays within viewport horizontally
              if (left < viewportPadding) {
                left = viewportPadding;
              } else if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
                left = window.innerWidth - actualPopoverWidth - viewportPadding;
              }

              setPopoverPosition({ top, left, pointerDirection });
              setHighlightRect(rect);
              return;
            } else if (spaceAbove >= actualPopoverHeight + extraPadding) {
              // Position above button if not enough space below
              let top = rect.top - actualPopoverHeight - extraPadding;
              let left = elementCenterX - actualPopoverWidth / 2;
              let pointerDirection: "top" | "bottom" | "left" | "right" = "bottom";

              // Ensure popover stays within viewport horizontally
              if (left < viewportPadding) {
                left = viewportPadding;
              } else if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
                left = window.innerWidth - actualPopoverWidth - viewportPadding;
              }

              setPopoverPosition({ top, left, pointerDirection });
              setHighlightRect(rect);
              return;
            }
            // Fall through to default positioning if neither above nor below works
          }

          // Default positioning logic for other steps
          // Try positioning below element first
          let top = rect.bottom + padding;
          let left = elementCenterX - actualPopoverWidth / 2;
          let pointerDirection: "top" | "bottom" | "left" | "right" = "top";

          // Check if there's enough space below
          const spaceBelow = window.innerHeight - rect.bottom;

          // If not enough space below, position above
          if (spaceBelow < actualPopoverHeight + padding + 50) {
            top = rect.top - actualPopoverHeight - padding;
            pointerDirection = "bottom";
          }

          // Ensure popover stays within viewport horizontally
          if (left < viewportPadding) {
            left = viewportPadding;
          } else if (left + actualPopoverWidth > window.innerWidth - viewportPadding) {
            left = window.innerWidth - actualPopoverWidth - viewportPadding;
          }

          // Ensure popover stays within viewport vertically
          if (top < viewportPadding) {
            top = viewportPadding;
          } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
            top = window.innerHeight - actualPopoverHeight - viewportPadding;
          }

          setPopoverPosition({ top, left, pointerDirection });
          setHighlightRect(rect);
        } else {
          // Fallback: center of screen or use sidebar position
          console.log(
            "[Onboarding] Element not found for step:",
            currentStep,
            "using fallback position"
          );

          // For style-editor step, try to use sidebar position even if style editor isn't visible
          if (currentStep === "style-editor") {
            const sidebar = document.querySelector('[data-onboarding="sidebar"]') as HTMLElement;
            if (sidebar) {
              const sidebarRect = sidebar.getBoundingClientRect();
              const spaceLeft = sidebarRect.left;
              const extraPadding = 30;

              if (spaceLeft >= actualPopoverWidth + extraPadding) {
                let top = sidebarRect.top + sidebarRect.height / 2 - actualPopoverHeight / 2;
                let left = sidebarRect.left - actualPopoverWidth - extraPadding;
                let pointerDirection: "top" | "bottom" | "left" | "right" = "right";

                if (top < viewportPadding) {
                  top = viewportPadding;
                } else if (top + actualPopoverHeight > window.innerHeight - viewportPadding) {
                  top = window.innerHeight - actualPopoverHeight - viewportPadding;
                }

                setPopoverPosition({ top, left, pointerDirection });
                setHighlightRect(sidebarRect);
                return;
              }
            }
          }

          // Default fallback: center of screen
          setPopoverPosition({
            top: Math.max(viewportPadding, window.innerHeight / 2 - actualPopoverHeight / 2),
            left: Math.max(viewportPadding, window.innerWidth / 2 - actualPopoverWidth / 2),
            pointerDirection: "bottom",
          });
          setHighlightRect(null);
        }
      };

      if (useAnimationFrame) {
        requestAnimationFrame(doUpdate);
      } else {
        doUpdate();
      }
    };

    // Small delay to ensure DOM is ready, then update position
    const timer = setTimeout(() => {
      updatePosition();
      // Update again after a short delay to account for popover rendering
      setTimeout(() => updatePosition(true), 50);
    }, 100);

    // Update position on resize and scroll
    const handleResize = () => updatePosition(true);
    const handleScroll = () => updatePosition(true);

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    // Also listen for scroll on the editor container
    const editorContainer = document
      .querySelector('[data-onboarding="video-area"]')
      ?.closest(".editor");
    if (editorContainer) {
      editorContainer.addEventListener("scroll", handleScroll, true);
    }

    // Watch for popover size changes
    let resizeObserver: ResizeObserver | null = null;
    if (popoverRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updatePosition(true);
      });
      resizeObserver.observe(popoverRef.current);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      if (editorContainer) {
        editorContainer.removeEventListener("scroll", handleScroll, true);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isVisible, currentStep, selectedCaptionId]);

  // Auto-select a caption when reaching style-editor step if none is selected
  useEffect(() => {
    if (!isVisible) return;

    if (currentStep === "style-editor" && !selectedCaptionId && captions.length > 0) {
      // Find the first visible caption
      const firstVisibleCaption = captions.find((caption) => caption.isVisible);
      if (firstVisibleCaption) {
        console.log(
          "[Onboarding] Auto-selecting caption for style-editor step:",
          firstVisibleCaption.id
        );
        setSelectedCaptionId(firstVisibleCaption.id);
      }
    }
  }, [isVisible, currentStep, selectedCaptionId, captions, setSelectedCaptionId]);

  // Skip steps that require a selected caption if none is selected
  const canShowStep = (step: OnboardingStep): boolean => {
    // All steps can always be shown
    // Style editor will show the sidebar area even if no caption is selected
    return true;
  };

  // Define handlers BEFORE conditional return to follow Rules of Hooks
  const handleDismiss = useCallback(() => {
    if (dontShowAgain) {
      // Save preference to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("reelify_caption_onboarding_dont_show", "true");
      }
    }
    setCurrentStep("video-area");
    onDismiss();
  }, [dontShowAgain, onDismiss]);

  const handleNext = useCallback(() => {
    const steps: OnboardingStep[] = [
      "video-area",
      "style-editor",
      "format-toggle",
      "timeline",
      "transcription",
      "export",
    ];
    const currentIndex = steps.indexOf(currentStep);

    console.log(
      "[Onboarding] handleNext called - currentStep:",
      currentStep,
      "currentIndex:",
      currentIndex,
      "totalSteps:",
      steps.length
    );

    // If current step is not found, start from beginning
    if (currentIndex === -1) {
      console.warn("[Onboarding] Current step not found in steps array:", currentStep);
      setCurrentStep("video-area");
      return;
    }

    // Check if we're at the last step
    if (currentIndex >= steps.length - 1) {
      console.log("[Onboarding] At last step, dismissing");
      handleDismiss();
      return;
    }

    // Simply advance to the next step (all steps can be shown)
    const nextStep = steps[currentIndex + 1];
    console.log("[Onboarding] Advancing from", currentStep, "to", nextStep);
    setCurrentStep(nextStep);
  }, [currentStep, handleDismiss]);

  const handlePrevious = useCallback(() => {
    const steps: OnboardingStep[] = [
      "video-area",
      "style-editor",
      "format-toggle",
      "timeline",
      "transcription",
      "export",
    ];
    const currentIndex = steps.indexOf(currentStep);

    if (currentIndex <= 0) {
      return; // Already at first step
    }

    // Simply go to previous step
    const prevStep = steps[currentIndex - 1];
    console.log("[Onboarding] Going back from", currentStep, "to", prevStep);
    setCurrentStep(prevStep);
  }, [currentStep]);

  // Handle Escape key to go back to previous step (defined after handleDismiss)
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Escape if onboarding is visible and not already handled by other components
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();

        const steps: OnboardingStep[] = [
          "video-area",
          "style-editor",
          "format-toggle",
          "timeline",
          "transcription",
          "export",
        ];
        const currentIndex = steps.indexOf(currentStep);

        if (currentIndex > 0) {
          // Go to previous step
          const prevStep = steps[currentIndex - 1];
          console.log("[Onboarding] Escape pressed - going back from", currentStep, "to", prevStep);
          setCurrentStep(prevStep);
        } else {
          // If at first step, dismiss onboarding
          console.log("[Onboarding] Escape pressed at first step - dismissing");
          handleDismiss();
        }
      }
    };

    // Use capture phase to intercept before other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isVisible, currentStep, handleDismiss]);

  if (!isVisible) {
    console.log("[Onboarding] Not visible, returning null");
    return null;
  }

  console.log("[Onboarding] Component is visible, currentStep:", currentStep);

  const getStepContent = () => {
    switch (currentStep) {
      case "video-area":
        return {
          title: t("step1Title"),
          content: t("step1Content"),
          icon: <Video size={28} variant="Bold" />,
        };
      case "style-editor":
        return {
          title: t("step2Title"),
          content: t("step2Content"),
          icon: <Brush2 size={28} variant="Bold" />,
        };
      case "format-toggle":
        return {
          title: t("step3Title"),
          content: t("step3Content"),
          icon: <Refresh2 size={28} variant="Bold" />,
        };
      case "timeline":
        return {
          title: t("step4Title"),
          content: t("step4Content"),
          icon: <Timer1 size={28} variant="Bold" />,
        };
      case "transcription":
        return {
          title: t("step5Title"),
          content: t("step5Content"),
          icon: <DocumentText size={28} variant="Bold" />,
        };
      case "export":
        return {
          title: t("step6Title"),
          content: t("step6Content"),
          icon: <ReceiveSquare size={28} variant="Bold" />,
        };
    }
  };

  const stepContent = getStepContent();
  const steps: OnboardingStep[] = [
    "video-area",
    "style-editor",
    "format-toggle",
    "timeline",
    "transcription",
    "export",
  ];
  const currentStepIndex = steps.indexOf(currentStep);
  const totalSteps = steps.length;

  // Verify current step is valid
  if (!steps.includes(currentStep)) {
    console.warn("[Onboarding] Invalid current step:", currentStep, "resetting to first step");
    setCurrentStep("video-area");
    return null;
  }

  // Ensure we always have a position (use fallback if needed)
  const displayPosition = popoverPosition || getDefaultPosition();

  console.log("[Onboarding] Rendering:", {
    isVisible,
    currentStep,
    popoverPosition,
    displayPosition,
    selectedCaptionId,
  });

  return (
    <>
      {/* Overlay with spotlight effect - create sections around highlight */}
      {highlightRect ? (
        <>
          {/* Top overlay */}
          <div
            className={styles.overlaySection}
            onClick={handleNext}
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: `${highlightRect.top}px`,
            }}
          />
          {/* Bottom overlay */}
          <div
            className={styles.overlaySection}
            onClick={handleNext}
            style={{
              top: `${highlightRect.bottom}px`,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          {/* Left overlay */}
          <div
            className={styles.overlaySection}
            onClick={handleNext}
            style={{
              top: `${highlightRect.top}px`,
              left: 0,
              width: `${highlightRect.left}px`,
              height: `${highlightRect.height}px`,
            }}
          />
          {/* Right overlay */}
          <div
            className={styles.overlaySection}
            onClick={handleNext}
            style={{
              top: `${highlightRect.top}px`,
              left: `${highlightRect.right}px`,
              right: 0,
              height: `${highlightRect.height}px`,
            }}
          />
          {/* Highlight box for target element */}
          <div
            className={styles.highlight}
            style={{
              top: `${highlightRect.top}px`,
              left: `${highlightRect.left}px`,
              width: `${highlightRect.width}px`,
              height: `${highlightRect.height}px`,
            }}
          />
        </>
      ) : (
        <div className={styles.overlay} onClick={handleNext} />
      )}

      {/* Popover */}
      <div
        ref={popoverRef}
        className={`${styles.popover} ${
          displayPosition.pointerDirection === "top"
            ? styles.pointerTop
            : displayPosition.pointerDirection === "bottom"
              ? styles.pointerBottom
              : displayPosition.pointerDirection === "left"
                ? styles.pointerLeft
                : displayPosition.pointerDirection === "right"
                  ? styles.pointerRight
                  : styles.pointerBottom
        }`}
        style={{
          top: `${displayPosition.top}px`,
          left: `${displayPosition.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.popoverHeader}>
          <span className={styles.icon}>{stepContent.icon}</span>
          <h3 className={styles.title}>{stepContent.title}</h3>
          <button className={styles.closeButton} onClick={handleDismiss} aria-label={t("close")}>
            ×
          </button>
        </div>

        <div className={styles.popoverContent}>
          <p>{stepContent.content}</p>
        </div>

        <div className={styles.popoverFooter}>
          <div className={styles.stepIndicator}>
            {steps.map((step, index) => (
              <div
                key={step}
                className={`${styles.stepDot} ${index === currentStepIndex ? styles.active : ""} ${index < currentStepIndex ? styles.completed : ""}`}
              />
            ))}
          </div>

          {/* Don't show again checkbox */}
          <label className={styles.dontShowAgain}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>{t("dontShowAgain")}</span>
          </label>

          <div className={styles.actions}>
            {currentStepIndex > 0 && (
              <button className={styles.prevButton} onClick={handlePrevious}>
                {t("previous")}
              </button>
            )}
            <button className={styles.nextButton} onClick={handleNext}>
              {currentStepIndex === totalSteps - 1 ? t("finish") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
