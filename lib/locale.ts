"use server";

import { cookies } from "next/headers";
import { type Locale, locales, defaultLocale } from "@/i18n";

export async function setLocale(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value;
  if (locale && locales.includes(locale as Locale)) {
    return locale as Locale;
  }
  return defaultLocale;
}
