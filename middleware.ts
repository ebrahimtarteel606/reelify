import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n/config';

const LOCALE_COOKIE = 'NEXT_LOCALE';

// Create the next-intl middleware
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
});

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware for API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // Static files like images, fonts, etc.
  ) {
    return NextResponse.next();
  }

  // Check for locale preference in cookie
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  
  // If user has a saved preference, use it
  if (cookieLocale && locales.includes(cookieLocale as typeof locales[number])) {
    // Check if the current path already has this locale
    const pathLocale = locales.find(
      (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    );

    // If path locale doesn't match cookie preference, redirect
    if (pathLocale !== cookieLocale) {
      const newPathname = pathname.replace(
        new RegExp(`^/(${locales.join('|')})`),
        ''
      ) || '/';
      const url = new URL(`/${cookieLocale}${newPathname}`, request.url);
      url.search = request.nextUrl.search;
      return NextResponse.redirect(url);
    }
  }

  // Use the default next-intl middleware for locale detection and routing
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except for API routes, static files, and Next.js internals
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
