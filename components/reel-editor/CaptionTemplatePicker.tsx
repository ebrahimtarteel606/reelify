"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useReelEditorStore } from "@/lib/store/useReelEditorStore";
import { useCaptionTemplates } from "@/lib/hooks/useCaptionTemplates";
import styles from "./CaptionStyleEditor.module.css";

/**
 * Shown in the Style tab when no caption is selected.
 * Lets users pick a template and apply it to all captions.
 */
export function CaptionTemplatePicker() {
  const t = useTranslations("captionStyleEditor");
  const { templates } = useCaptionTemplates();
  const { captions, updateCaptionStyleForIds } = useReelEditorStore();

  const allCaptionIds = captions.map((c) => c.id);
  const hasCaptions = allCaptionIds.length > 0;

  if (templates.length === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>{t("captionStyle")}</h3>
        <p className={styles.placeholder}>
          {t("noCaptionSelected")} {hasCaptions ? t("chooseTemplate") : ""}
        </p>
      </div>
    );
  }

  return (
    <div
      className={styles.container}
      data-onboarding="style-editor"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h3 className={styles.title}>{t("captionStyle")}</h3>
      <p className={styles.placeholder}>{t("chooseStyleForAll")}</p>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t("templates")}</h4>
        <div className={styles.templateGrid}>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className={styles.templateCard}
              disabled={!hasCaptions}
              onClick={() => {
                if (hasCaptions) updateCaptionStyleForIds(allCaptionIds, tpl.style);
              }}
            >
              <span className={styles.templateCardName}>{tpl.name}</span>
              <span className={styles.templateCardAction}>{t("applyToAllCaptions")}</span>
            </button>
          ))}
        </div>
        {!hasCaptions && (
          <p className={styles.hint}>{t("noCaptionSelected")}</p>
        )}
      </div>
    </div>
  );
}
