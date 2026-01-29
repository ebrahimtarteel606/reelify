export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

export const localeNames: Record<Locale, string> = {
  ar: 'العربية',
  en: 'English',
};

export const localeDirection: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};
