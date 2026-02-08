'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { ArrowDown2, Global } from 'vuesax-icons-react';

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
      <Global className="w-4 h-4" size={16} />
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
        <Global className="w-4 h-4" size={16} />
        <span>{localeNames[locale as Locale]}</span>
        <ArrowDown2 className="w-3 h-3" size={12} />
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
