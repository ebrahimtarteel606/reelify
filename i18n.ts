import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export default getRequestConfig(async () => {
  let locale: Locale = defaultLocale;

  try {
    // Try to get locale from cookie first, then from Accept-Language header
    const cookieStore = await cookies();

    // Check cookie first
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    if (cookieLocale && locales.includes(cookieLocale as Locale)) {
      locale = cookieLocale as Locale;
    } else {
      // Fall back to Accept-Language header
      const headerStore = await headers();
      const acceptLanguage = headerStore.get("accept-language");
      if (acceptLanguage) {
        const preferredLocale = acceptLanguage
          .split(",")
          .map((lang) => lang.split(";")[0].trim().substring(0, 2))
          .find((lang) => locales.includes(lang as Locale));
        if (preferredLocale) {
          locale = preferredLocale as Locale;
        }
      }
    }
  } catch {
    // During static generation, cookies/headers aren't available
    // Use default locale
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

// Helper to get text direction based on locale
export function getDirection(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
