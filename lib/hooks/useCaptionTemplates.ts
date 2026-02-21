"use client";

import { useCallback, useState } from "react";
import { CaptionStyle } from "@/types";

const STORAGE_KEY = "reelify_caption_templates";

// Bilingual font stack for templates (Latin + Arabic)
const FONT_STACK_AR_EN = "Inter, \"Noto Sans Arabic\", system-ui, sans-serif";

export interface CaptionTemplate {
  id: string;
  name: string;
  style: CaptionStyle;
}

/** Five built-in templates shown to every user when they have no saved templates. */
const DEFAULT_TEMPLATES: CaptionTemplate[] = [
  {
    id: "default-classic",
    name: "Classic",
    style: {
      fontSize: 50,
      fontFamily: FONT_STACK_AR_EN,
      fontWeight: "600",
      color: "#FFFFFF",
      backgroundColor: "rgba(0, 0, 0, 0.78)",
      textAlign: "center",
      padding: { top: 14, right: 24, bottom: 14, left: 24 },
      maxWidth: 820,
      letterSpacing: 0.5,
      lineHeight: 1.25,
    },
  },
  {
    id: "default-minimal",
    name: "Minimal",
    style: {
      fontSize: 46,
      fontFamily: FONT_STACK_AR_EN,
      color: "#FFFFFF",
      backgroundColor: "transparent",
      textAlign: "center",
      strokeColor: "#000000",
      strokeWidth: 2.5,
      padding: { top: 8, right: 16, bottom: 8, left: 16 },
      maxWidth: 800,
      letterSpacing: 0,
      lineHeight: 1.3,
    },
  },
  {
    id: "default-bold",
    name: "Bold",
    style: {
      fontSize: 54,
      fontFamily: FONT_STACK_AR_EN,
      fontWeight: "bold",
      color: "#FFFFFF",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      textAlign: "center",
      strokeColor: "#000000",
      strokeWidth: 2,
      padding: { top: 16, right: 28, bottom: 16, left: 28 },
      maxWidth: 840,
      letterSpacing: 0.5,
      lineHeight: 1.2,
    },
  },
  {
    id: "default-highlight",
    name: "Highlight",
    style: {
      fontSize: 48,
      fontFamily: FONT_STACK_AR_EN,
      fontWeight: "bold",
      color: "#1a1a1a",
      backgroundColor: "#FFE135",
      textAlign: "center",
      padding: { top: 12, right: 22, bottom: 12, left: 22 },
      maxWidth: 800,
      letterSpacing: 0.3,
      lineHeight: 1.25,
    },
  },
  {
    id: "default-subtle",
    name: "Subtle",
    style: {
      fontSize: 44,
      fontFamily: FONT_STACK_AR_EN,
      color: "#FFFFFF",
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      textAlign: "center",
      padding: { top: 12, right: 20, bottom: 12, left: 20 },
      maxWidth: 780,
      letterSpacing: 0.2,
      lineHeight: 1.35,
    },
  },
];

function loadTemplates(): CaptionTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveTemplatesToStorage(DEFAULT_TEMPLATES);
      return [...DEFAULT_TEMPLATES];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveTemplatesToStorage(DEFAULT_TEMPLATES);
      return [...DEFAULT_TEMPLATES];
    }
    return parsed;
  } catch {
    saveTemplatesToStorage(DEFAULT_TEMPLATES);
    return [...DEFAULT_TEMPLATES];
  }
}

function saveTemplatesToStorage(templates: CaptionTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.warn("[useCaptionTemplates] Failed to save:", e);
  }
}

export function useCaptionTemplates() {
  const [templates, setTemplates] = useState<CaptionTemplate[]>(() => loadTemplates());

  const saveTemplate = useCallback((name: string, style: CaptionStyle) => {
    const next: CaptionTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim() || "Untitled",
      style: { ...style },
    };
    setTemplates((prev) => {
      const list = [...prev, next];
      saveTemplatesToStorage(list);
      return list;
    });
    return next.id;
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => {
      const list = prev.filter((t) => t.id !== id);
      saveTemplatesToStorage(list);
      return list;
    });
  }, []);

  const getTemplates = useCallback(() => loadTemplates(), []);

  return { templates, saveTemplate, deleteTemplate, getTemplates };
}
