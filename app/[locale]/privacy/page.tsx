"use client";

import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import Image from "next/image";
import Link from "next/link";

export default function PrivacyPage() {
  const locale = useLocale();
  const t = useTranslations('privacy');
  const tCommon = useTranslations('common');

  return (
    <main className="min-h-screen bg-gradient-warm">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-24 pt-10">
        {/* Logo */}
        <div className="flex items-center justify-between">
          <div className="flex-1" />
          <Link href={`/${locale}`}>
            <Image
              src="/Transparent white1.png"
              alt="Realify"
              width={160}
              height={80}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
          <div className="flex-1 flex justify-end">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Header */}
        <header className="text-center space-y-4 animate-fade-in mt-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            {t('title')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            {t('lastUpdated')}
          </p>
        </header>

        {/* Content */}
        <Card className="shadow-card border-0 bg-gradient-card animate-fade-in">
          <CardContent className="p-8 sm:p-10 space-y-8">
            {/* Introduction */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('introduction')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('introText')}
              </p>
            </section>

            {/* Data Collection */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('dataCollection')}</h2>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">1. {t('videoInfo')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t('videoInfoText')}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">2. {t('preferencesInfo')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t('preferencesInfoText')}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">3. {t('usageInfo')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t('usageInfoText')}
                </p>
              </div>
            </section>

            {/* Data Usage */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('dataUsage')}</h2>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                {(t.raw('dataUsageList') as string[]).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Data Security */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('dataSecurity')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('dataSecurityText')}
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                {(t.raw('dataSecurityList') as string[]).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Changes */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('changes')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('changesText')}
              </p>
            </section>

            {/* Contact */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('contact')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('contactText')}
              </p>
            </section>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground animate-fade-in">
          <Link href={`/${locale}`} className="hover:text-primary transition-colors">
            {tCommon('home')}
          </Link>
          <span>•</span>
          <Link href={`/${locale}/terms`} className="hover:text-primary transition-colors">
            {tCommon('termsAndConditions')}
          </Link>
        </div>
      </section>
    </main>
  );
}
