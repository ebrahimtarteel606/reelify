"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { CaptionStyle } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import styles from "./CaptionStyleEditor.module.css";

const FONT_FAMILIES = [
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Courier New", label: "Courier New" },
  { value: "Verdana", label: "Verdana" },
  { value: "Georgia", label: "Georgia" },
  { value: "Palatino", label: "Palatino" },
  { value: "Garamond", label: "Garamond" },
  { value: "Roboto", label: "Roboto" },
  { value: "Noto Sans Arabic", label: "Noto Sans Arabic" },
  { value: "Impact", label: "Impact" },
  { value: "Comic Sans MS", label: "Comic Sans MS" },
];

const FONT_WEIGHTS = [
  { value: "100", label: "Thin (100)" },
  { value: "200", label: "Extra Light (200)" },
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Normal (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "Semi Bold (600)" },
  { value: "700", label: "Bold (700)" },
  { value: "800", label: "Extra Bold (800)" },
  { value: "900", label: "Black (900)" },
];

export function CaptionStyleEditor() {
  const t = useTranslations("captionStyleEditor");
  const { captions, selectedCaptionId, updateCaptionStyle, setSelectedCaptionId } =
    useReelEditorStore();

  const selectedCaption = captions.find((c) => c.id === selectedCaptionId);
  const style = selectedCaption?.style;

  // Local state for editing
  const [localStyle, setLocalStyle] = useState<Partial<CaptionStyle>>(style || {});

  // Update local style when selected caption changes
  useEffect(() => {
    if (style && selectedCaption) {
      setLocalStyle(style);
    }
  }, [selectedCaptionId, style, selectedCaption]);

  // Handle ESC key to exit edit mode
  useEffect(() => {
    if (!selectedCaptionId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCaptionId) {
        e.preventDefault();
        setSelectedCaptionId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCaptionId, setSelectedCaptionId]);

  if (!selectedCaption) {
    return (
      <div className={styles.container}>
        <p className={styles.placeholder}>{t("noCaptionSelected")}</p>
      </div>
    );
  }

  const handleStyleChange = (updates: Partial<CaptionStyle>) => {
    if (!selectedCaption) return; // Guard against missing caption

    const newStyle = { ...localStyle, ...updates };
    setLocalStyle(newStyle);
    updateCaptionStyle(selectedCaption.id, newStyle);
  };

  const handleColorChange = (field: "color" | "backgroundColor", value: string) => {
    handleStyleChange({ [field]: value });
  };

  const handleNumberChange = (field: keyof CaptionStyle, value: number) => {
    handleStyleChange({ [field]: value });
  };

  const handleSelectChange = (field: keyof CaptionStyle, value: string) => {
    handleStyleChange({ [field]: value });
  };

  return (
    <div
      className={styles.container}
      data-onboarding="style-editor"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{t("captionStyle")}</h3>
        {selectedCaption && (
          <div className={styles.exitHint} role="status" aria-live="polite">
            <span className={styles.exitHintIcon} aria-hidden>
              ⌨️
            </span>
            <span>{t("pressEscToExit")}</span>
          </div>
        )}
      </div>

      {/* Text Styling Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("textStyle")}</h4>

        {/* Font Family */}
        <div className={styles.field}>
          <label className={styles.label}>{t("fontFamily")}</label>
          <Select
            value={localStyle.fontFamily || "Arial"}
            onValueChange={(value) => handleSelectChange("fontFamily", value)}
          >
            <SelectTrigger className={styles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Font Size */}
        <div className={styles.field}>
          <label className={styles.label}>
            {t("fontSize")}: {localStyle.fontSize || 48}px
          </label>
          <input
            type="range"
            min="12"
            max="120"
            value={localStyle.fontSize || 48}
            onChange={(e) => handleNumberChange("fontSize", Number.parseInt(e.target.value, 10))}
            className={styles.slider}
          />
        </div>

        {/* Font Weight */}
        <div className={styles.field}>
          <label className={styles.label}>{t("fontWeight")}</label>
          <Select
            value={localStyle.fontWeight || "400"}
            onValueChange={(value) => handleSelectChange("fontWeight", value)}
          >
            <SelectTrigger className={styles.select}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((weight) => (
                <SelectItem key={weight.value} value={weight.value}>
                  {weight.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Font Color */}
        <div className={styles.field}>
          <label className={styles.label}>{t("fontColor")}</label>
          <div className={styles.colorInputGroup}>
            <input
              type="color"
              value={localStyle.color || "#FFFFFF"}
              onChange={(e) => handleColorChange("color", e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={styles.colorInput}
            />
            <input
              type="text"
              value={localStyle.color || "#FFFFFF"}
              onChange={(e) => handleColorChange("color", e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              className={styles.colorTextInput}
              placeholder="#FFFFFF"
            />
          </div>
        </div>
      </div>

      {/* Box Styling Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("boxStyle")}</h4>

        {/* Background Color */}
        <div className={styles.field}>
          <label className={styles.label}>{t("backgroundColor")}</label>
          <div className={styles.colorInputGroup}>
            <input
              type="color"
              value={localStyle.backgroundColor || "#000000"}
              onChange={(e) => handleColorChange("backgroundColor", e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={styles.colorInput}
            />
            <input
              type="text"
              value={localStyle.backgroundColor || "#000000"}
              onChange={(e) => handleColorChange("backgroundColor", e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              className={styles.colorTextInput}
              placeholder="rgba(0,0,0,0.7)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
