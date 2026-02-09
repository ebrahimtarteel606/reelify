"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { type Locale } from "@/i18n";

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (newLocale: Locale) => {
    if (newLocale === locale) return;

    startTransition(async () => {
      // Set the cookie via server action
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-full p-1">
      <button
        onClick={() => switchLocale("ar")}
        disabled={isPending}
        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
          locale === "ar"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        } ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
        aria-label="العربية"
      >
        عربي
      </button>
      <button
        onClick={() => switchLocale("en")}
        disabled={isPending}
        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
          locale === "en"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        } ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
        aria-label="English"
      >
        EN
      </button>
    </div>
  );
}
