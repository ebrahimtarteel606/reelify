"use client";

import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import Image from "next/image";
import Link from "next/link";

export default function TermsPage() {
  const locale = useLocale();
  const t = useTranslations('terms');
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

            {/* Service Description */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('serviceDescription')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('serviceDescriptionText')}
              </p>
            </section>

            {/* Acceptance */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('acceptance')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('acceptanceText')}
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                {(t.raw('acceptanceList') as string[]).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* User Content */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('userContent')}</h2>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">{t('ownership')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t('ownershipText')}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">{t('license')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t('licenseText')}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">{t('contentResponsibility')}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t('contentResponsibilityText')}
                </p>
              </div>
            </section>

            {/* Prohibited Uses */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('prohibitedUses')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('prohibitedUsesText')}
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                {(t.raw('prohibitedUsesList') as string[]).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Intellectual Property */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('intellectualProperty')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('intellectualPropertyText')}
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                {(t.raw('intellectualPropertyList') as string[]).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Disclaimer */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('disclaimer')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('disclaimerText')}
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                {(t.raw('disclaimerList') as string[]).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Limitation of Liability */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('limitationOfLiability')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('limitationOfLiabilityText')}
              </p>
            </section>

            {/* Indemnification */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('indemnification')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('indemnificationText')}
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                {(t.raw('indemnificationList') as string[]).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>

            {/* Modifications */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('modifications')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('modificationsText')}
              </p>
            </section>

            {/* Termination */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('termination')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('terminationText')}
              </p>
            </section>

            {/* Governing Law */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('governingLaw')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('governingLawText')}
              </p>
            </section>

            {/* Severability */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">{t('severability')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('severabilityText')}
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
          <Link href={`/${locale}/privacy`} className="hover:text-primary transition-colors">
            {tCommon('privacyPolicy')}
          </Link>
        </div>
      </section>
    </main>
  );
}
