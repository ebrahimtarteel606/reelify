"use client";

import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { Whatsapp } from "vuesax-icons-react";

export function WhatsAppFAB() {
  const t = useTranslations("common");

  const fab = (
    <a
      className="whatsapp-fab"
      href="https://wa.me/201505588416"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("contactUs")}
    >
      <span className="whatsapp-fab__label">{t("contactUs")}</span>
      <span className="whatsapp-fab__icon">
        <Whatsapp size={24} variant="Bold" />
      </span>
      <span className="sr-only">WhatsApp</span>
    </a>
  );

  if (typeof document === "undefined") return null;
  return createPortal(fab, document.body);
}
