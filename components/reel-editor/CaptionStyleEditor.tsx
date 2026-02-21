"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { useCaptionTemplates } from "@/lib/hooks/useCaptionTemplates";
import { CaptionStyle, DEFAULT_SAFE_AREAS } from "@/types";
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

const VIDEO_HEIGHT = 1920;

export function CaptionStyleEditor() {
  const t = useTranslations("captionStyleEditor");
  const tCanvas = useTranslations("captionCanvas");
  const {
    captions,
    selectedCaptionId,
    selectedCaptionIds,
    selectedCaptionHeightInVideo,
    updateCaptionPosition,
    updateCaptionStyle,
    updateCaptionStyleForIds,
    setSelectedCaptionId,
  } = useReelEditorStore();
  const { templates, saveTemplate } = useCaptionTemplates();

  const selectedCaption = captions.find((c) => c.id === selectedCaptionId);
  const idsToApply = selectedCaptionIds.length > 0 ? selectedCaptionIds : selectedCaptionId ? [selectedCaptionId] : [];
  const style = selectedCaption?.style;

  // Local state for editing
  const [localStyle, setLocalStyle] = useState<Partial<CaptionStyle>>(style || {});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

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

      {/* Templates – at top so users can choose a style first */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("templates")}</h4>
        <div className={styles.field}>
          <button
            type="button"
            className={styles.templateBtn}
            onClick={() => {
              const name = window.prompt(t("templateNamePrompt"), "");
              if (name != null && selectedCaption) {
                saveTemplate(name, { ...selectedCaption.style, ...localStyle } as CaptionStyle);
              }
            }}
            disabled={!selectedCaption}
          >
            {t("saveAsTemplate")}
          </button>
        </div>
        {templates.length > 0 && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>{t("applyTemplate")}</label>
              <Select
                value={selectedTemplateId}
                onValueChange={setSelectedTemplateId}
              >
                <SelectTrigger className={styles.select}>
                  <SelectValue placeholder={t("chooseTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={styles.templateActions}>
              <button
                type="button"
                className={styles.templateBtn}
                disabled={!selectedTemplateId || idsToApply.length === 0}
                onClick={() => {
                  const tpl = templates.find((t) => t.id === selectedTemplateId);
                  if (tpl) updateCaptionStyleForIds(idsToApply, tpl.style);
                }}
              >
                {t("applyToSelected")}
              </button>
              <button
                type="button"
                className={styles.templateBtn}
                disabled={!selectedTemplateId || captions.length === 0}
                onClick={() => {
                  const tpl = templates.find((t) => t.id === selectedTemplateId);
                  if (tpl) updateCaptionStyleForIds(captions.map((c) => c.id), tpl.style);
                }}
              >
                {t("applyToAll")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Position */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("position")}</h4>
        <div className={styles.field}>
          <div className={styles.buttonGroup}>
            <button
              type="button"
              className={styles.buttonGroupBtn}
              onClick={() => {
                if (!selectedCaption) return;
                const h = selectedCaptionHeightInVideo ?? 100;
                updateCaptionPosition(selectedCaption.id, {
                  x: selectedCaption.position.x,
                  y: DEFAULT_SAFE_AREAS.top + h / 2,
                });
              }}
              title={tCanvas("alignTop")}
              aria-label={tCanvas("alignTop")}
            >
              {tCanvas("alignTop")}
            </button>
            <button
              type="button"
              className={styles.buttonGroupBtn}
              onClick={() => {
                if (!selectedCaption) return;
                updateCaptionPosition(selectedCaption.id, {
                  x: selectedCaption.position.x,
                  y: VIDEO_HEIGHT / 2,
                });
              }}
              title={tCanvas("alignCenter")}
              aria-label={tCanvas("alignCenter")}
            >
              {tCanvas("alignCenter")}
            </button>
            <button
              type="button"
              className={styles.buttonGroupBtn}
              onClick={() => {
                if (!selectedCaption) return;
                const h = selectedCaptionHeightInVideo ?? 100;
                updateCaptionPosition(selectedCaption.id, {
                  x: selectedCaption.position.x,
                  y: VIDEO_HEIGHT - DEFAULT_SAFE_AREAS.bottom - h / 2,
                });
              }}
              title={tCanvas("alignBottom")}
              aria-label={tCanvas("alignBottom")}
            >
              {tCanvas("alignBottom")}
            </button>
          </div>
        </div>
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

        {/* Bold + Italic + Underline toggles */}
        <div className={styles.toggleRow}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={(localStyle.fontWeight || "400") === "700"}
              onChange={(e) =>
                handleSelectChange("fontWeight", e.target.checked ? "700" : "400")
              }
              onClick={(e) => e.stopPropagation()}
              className={styles.checkbox}
            />
            <span>{t("bold")}</span>
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={(localStyle.fontStyle || "normal") === "italic"}
              onChange={(e) =>
                handleSelectChange("fontStyle", e.target.checked ? "italic" : "normal")
              }
              onClick={(e) => e.stopPropagation()}
              className={styles.checkbox}
            />
            <span>{t("italic")}</span>
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={(localStyle.textDecoration || "none") === "underline"}
              onChange={(e) =>
                handleStyleChange({
                  textDecoration: e.target.checked ? "underline" : "none",
                })
              }
              onClick={(e) => e.stopPropagation()}
              className={styles.checkbox}
            />
            <span>{t("underline")}</span>
          </label>
        </div>

        {/* Font Weight (full scale) */}
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

        {/* Text Align */}
        <div className={styles.field}>
          <label className={styles.label}>{t("textAlign")}</label>
          <div className={styles.buttonGroup}>
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                className={
                  (localStyle.textAlign || "center") === align
                    ? styles.buttonGroupActive
                    : styles.buttonGroupBtn
                }
                onClick={() => handleSelectChange("textAlign", align)}
                title={t(`align_${align}`)}
                aria-pressed={(localStyle.textAlign || "center") === align}
              >
                {t(`align_${align}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Letter Spacing */}
        <div className={styles.field}>
          <label className={styles.label}>
            {t("letterSpacing")}: {localStyle.letterSpacing ?? 0}px
          </label>
          <input
            type="range"
            min="-5"
            max="20"
            value={localStyle.letterSpacing ?? 0}
            onChange={(e) =>
              handleNumberChange("letterSpacing", Number.parseInt(e.target.value, 10))
            }
            className={styles.slider}
          />
        </div>

        {/* Line Height (multiplier) */}
        <div className={styles.field}>
          <label className={styles.label}>
            {t("lineHeight")}: {localStyle.lineHeight ?? 1.2}
          </label>
          <input
            type="range"
            min="0.8"
            max="2.5"
            step="0.1"
            value={localStyle.lineHeight ?? 1.2}
            onChange={(e) =>
              handleStyleChange({ lineHeight: Number.parseFloat(e.target.value) })
            }
            className={styles.slider}
          />
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

        {/* Lock aspect ratio */}
        <div className={styles.field}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={localStyle.lockAspectRatio === true}
              onChange={(e) =>
                handleStyleChange({ lockAspectRatio: e.target.checked })
              }
              onClick={(e) => e.stopPropagation()}
              className={styles.checkbox}
            />
            <span>{t("lockAspectRatio")}</span>
          </label>
        </div>

        {/* Max Width */}
        <div className={styles.field}>
          <label className={styles.label}>
            {t("maxWidth")}: {localStyle.maxWidth ?? 800}px
          </label>
          <input
            type="range"
            min="200"
            max="1200"
            step="50"
            value={localStyle.maxWidth ?? 800}
            onChange={(e) =>
              handleNumberChange("maxWidth", Number.parseInt(e.target.value, 10))
            }
            className={styles.slider}
          />
        </div>

        {/* Background: Transparent toggle + Color */}
        <div className={styles.field}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={!localStyle.backgroundColor || localStyle.backgroundColor === "transparent"}
              onChange={(e) =>
                handleStyleChange({
                  backgroundColor: e.target.checked ? "transparent" : "rgba(0, 0, 0, 0.7)",
                })
              }
              onClick={(e) => e.stopPropagation()}
              className={styles.checkbox}
            />
            <span>{t("transparentBackground")}</span>
          </label>
          {localStyle.backgroundColor && localStyle.backgroundColor !== "transparent" && (
            <>
              <label className={styles.label}>{t("backgroundColor")}</label>
              <div className={styles.colorInputGroup}>
                <input
                  type="color"
                  value={
                    localStyle.backgroundColor.startsWith("#")
                      ? localStyle.backgroundColor
                      : "#000000"
                  }
                  onChange={(e) => handleColorChange("backgroundColor", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={styles.colorInput}
                />
                <input
                  type="text"
                  value={localStyle.backgroundColor}
                  onChange={(e) => handleColorChange("backgroundColor", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  className={styles.colorTextInput}
                  placeholder="rgba(0,0,0,0.7)"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Karaoke (word highlight) */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("karaoke")}</h4>
        <div className={styles.field}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={localStyle.karaoke === true}
              onChange={(e) => handleStyleChange({ karaoke: e.target.checked })}
              onClick={(e) => e.stopPropagation()}
              className={styles.checkbox}
            />
            <span>{t("karaokeMode")}</span>
          </label>
          <p className={styles.hint}>{t("karaokeHint")}</p>
        </div>
        {localStyle.karaoke && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>{t("karaokeActiveColor")}</label>
              <div className={styles.colorInputGroup}>
                <input
                  type="color"
                  value={localStyle.karaokeActiveColor || localStyle.color || "#FFFF00"}
                  onChange={(e) =>
                    handleStyleChange({ karaokeActiveColor: e.target.value })
                  }
                  onClick={(e) => e.stopPropagation()}
                  className={styles.colorInput}
                />
                <input
                  type="text"
                  value={localStyle.karaokeActiveColor || localStyle.color || "#FFFF00"}
                  onChange={(e) =>
                    handleStyleChange({ karaokeActiveColor: e.target.value })
                  }
                  className={styles.colorTextInput}
                  placeholder="#FFFF00"
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                {t("karaokeActiveScale")}: {localStyle.karaokeActiveScale ?? 1.2}
              </label>
              <input
                type="range"
                min="1"
                max="1.8"
                step="0.1"
                value={localStyle.karaokeActiveScale ?? 1.2}
                onChange={(e) =>
                  handleStyleChange({
                    karaokeActiveScale: Number.parseFloat(e.target.value),
                  })
                }
                className={styles.slider}
              />
            </div>
          </>
        )}
      </div>

      {/* Stroke Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("stroke")}</h4>
        <div className={styles.field}>
          <label className={styles.label}>{t("strokeColor")}</label>
          <div className={styles.colorInputGroup}>
            <input
              type="color"
              value={localStyle.strokeColor || "#000000"}
              onChange={(e) => handleStyleChange({ strokeColor: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={styles.colorInput}
            />
            <input
              type="text"
              value={localStyle.strokeColor || "#000000"}
              onChange={(e) => handleStyleChange({ strokeColor: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className={styles.colorTextInput}
              placeholder="#000000"
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>
            {t("strokeWidth")}: {localStyle.strokeWidth ?? 0}px
          </label>
          <input
            type="range"
            min="0"
            max="8"
            value={localStyle.strokeWidth ?? 0}
            onChange={(e) =>
              handleNumberChange("strokeWidth", Number.parseInt(e.target.value, 10))
            }
            className={styles.slider}
          />
        </div>
      </div>

      {/* Shadow Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("shadow")}</h4>
        <div className={styles.field}>
          <label className={styles.label}>{t("shadowColor")}</label>
          <div className={styles.colorInputGroup}>
            <input
              type="color"
              value={localStyle.shadow?.color ?? "#000000"}
              onChange={(e) =>
                handleStyleChange({
                  shadow: {
                    ...(localStyle.shadow ?? {
                      offsetX: 0,
                      offsetY: 2,
                      blur: 4,
                      color: "#000000",
                    }),
                    color: e.target.value,
                  },
                })
              }
              onClick={(e) => e.stopPropagation()}
              className={styles.colorInput}
            />
            <input
              type="text"
              value={localStyle.shadow?.color ?? "#000000"}
              onChange={(e) =>
                handleStyleChange({
                  shadow: {
                    ...(localStyle.shadow ?? {
                      offsetX: 0,
                      offsetY: 2,
                      blur: 4,
                      color: "#000000",
                    }),
                    color: e.target.value,
                  },
                })
              }
              className={styles.colorTextInput}
              placeholder="#000000"
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{t("shadowOffset")} X: {localStyle.shadow?.offsetX ?? 0}</label>
          <input
            type="range"
            min="-20"
            max="20"
            value={localStyle.shadow?.offsetX ?? 0}
            onChange={(e) =>
              handleStyleChange({
                shadow: {
                  ...(localStyle.shadow ?? {
                    offsetY: 2,
                    blur: 4,
                    color: "#000000",
                  }),
                  offsetX: Number.parseInt(e.target.value, 10),
                  offsetY: localStyle.shadow?.offsetY ?? 2,
                  blur: localStyle.shadow?.blur ?? 4,
                  color: localStyle.shadow?.color ?? "#000000",
                },
              })
            }
            className={styles.slider}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{t("shadowOffset")} Y: {localStyle.shadow?.offsetY ?? 2}</label>
          <input
            type="range"
            min="-20"
            max="20"
            value={localStyle.shadow?.offsetY ?? 2}
            onChange={(e) =>
              handleStyleChange({
                shadow: {
                  ...(localStyle.shadow ?? {
                    offsetX: 0,
                    blur: 4,
                    color: "#000000",
                  }),
                  offsetX: localStyle.shadow?.offsetX ?? 0,
                  offsetY: Number.parseInt(e.target.value, 10),
                  blur: localStyle.shadow?.blur ?? 4,
                  color: localStyle.shadow?.color ?? "#000000",
                },
              })
            }
            className={styles.slider}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{t("shadowBlur")}: {localStyle.shadow?.blur ?? 4}</label>
          <input
            type="range"
            min="0"
            max="30"
            value={localStyle.shadow?.blur ?? 4}
            onChange={(e) =>
              handleStyleChange({
                shadow: {
                  ...(localStyle.shadow ?? {
                    offsetX: 0,
                    offsetY: 2,
                    color: "#000000",
                  }),
                  offsetX: localStyle.shadow?.offsetX ?? 0,
                  offsetY: localStyle.shadow?.offsetY ?? 2,
                  blur: Number.parseInt(e.target.value, 10),
                  color: localStyle.shadow?.color ?? "#000000",
                },
              })
            }
            className={styles.slider}
          />
        </div>
      </div>
    </div>
  );
}
