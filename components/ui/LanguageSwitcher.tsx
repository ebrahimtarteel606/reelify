'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';

const LOCALE_COOKIE = 'NEXT_LOCALE';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('languageSwitcher');

  const handleLocaleChange = (newLocale: Locale) => {
    // Save preference to cookie (expires in 1 year)
    document.cookie = `${LOCALE_COOKIE}=${newLocale};path=/;max-age=${60 * 60 * 24 * 365}`;

    // Get the path without the current locale prefix
    const pathWithoutLocale = pathname.replace(new RegExp(`^/${locale}`), '') || '/';
    
    // Navigate to the new locale path
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  return (
    <button
      onClick={() => handleLocaleChange(otherLocale as Locale)}
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors duration-200"
      aria-label={t('language')}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
        />
      </svg>
      <span>{localeNames[otherLocale as Locale]}</span>
    </button>
  );
}

// Dropdown version for more options
export function LanguageSwitcherDropdown() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('languageSwitcher');

  const handleLocaleChange = (newLocale: string) => {
    // Save preference to cookie (expires in 1 year)
    document.cookie = `${LOCALE_COOKIE}=${newLocale};path=/;max-age=${60 * 60 * 24 * 365}`;

    // Get the path without the current locale prefix
    const pathWithoutLocale = pathname.replace(new RegExp(`^/${locale}`), '') || '/';
    
    // Navigate to the new locale path
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors duration-200"
        aria-label={t('language')}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
          />
        </svg>
        <span>{localeNames[locale as Locale]}</span>
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      
      <div className="absolute top-full mt-1 right-0 min-w-[120px] bg-background border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        {locales.map((loc) => (
          <button
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            className={`w-full px-4 py-2 text-sm text-right hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg ${
              locale === loc ? 'text-primary font-semibold' : 'text-foreground'
            }`}
          >
            {localeNames[loc]}
          </button>
        ))}
      </div>
    </div>
  );
}
