import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales, localeDirection, type Locale } from "@/i18n/config";
import "../globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";

export function generateStaticParams() {
  return locales.map(locale => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const isArabic = locale === "ar";

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    ),
    title: {
      default: isArabic
        ? "Reelify | ريلز عربية بالذكاء الاصطناعي"
        : "Reelify | AI-Powered Arabic Reels",
      template: "%s | Reelify",
    },
    description: isArabic
      ? "حوّل الفيديوهات العربية الطويلة إلى ريلز قصيرة احترافية مع عناوين جذابة خلال دقائق."
      : "Convert long Arabic videos into professional short reels with engaging titles in minutes.",
    keywords: [
      "ريلز",
      "فيديوهات قصيرة",
      "تحويل فيديو",
      "ذكاء اصطناعي",
      "مقاطع عربية",
      "Shorts",
      "Reels",
      "TikTok",
      "Instagram Reels",
      "YouTube Shorts",
    ],
    robots: {
      index: true,
      follow: true,
    },
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.svg",
    },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      locale: isArabic ? "ar_AR" : "en_US",
      url: "/",
      siteName: "Reelify",
      title: isArabic
        ? "Reelify | ريلز عربية بالذكاء الاصطناعي"
        : "Relify | AI-Powered Arabic Reels",
      description: isArabic
        ? "حوّل الفيديوهات العربية الطويلة إلى ريلز قصيرة احترافية مع عناوين جذابة خلال دقائق."
        : "Convert long Arabic videos into professional short reels with engaging titles in minutes.",
    },
    twitter: {
      card: "summary_large_image",
      title: isArabic
        ? "Reelify | ريلز عربية بالذكاء الاصطناعي"
        : "Relify | AI-Powered Arabic Reels",
      description: isArabic
        ? "حوّل الفيديوهات العربية الطويلة إلى ريلز قصيرة احترافية مع عناوين جذابة خلال دقائق."
        : "Convert long Arabic videos into professional short reels with engaging titles in minutes.",
    },
    alternates: {
      canonical: "/",
      languages: {
        ar: "/ar",
        en: "/en",
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Get messages for the locale
  const messages = await getMessages();

  const dir = localeDirection[locale as Locale];

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
