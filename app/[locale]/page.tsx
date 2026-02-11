"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export default function LandingPage() {
  const locale = useLocale();
  const t = useTranslations("landing");
  const tCommon = useTranslations("common");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [helpText, setHelpText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess(false);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedHelp = helpText.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone || !trimmedHelp) {
      setSubmitError(t("form.errors.required"));
      return;
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailValid) {
      setSubmitError(t("form.errors.email"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          help_text: trimmedHelp,
          locale,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || t("form.errors.generic"));
      }

      setSubmitSuccess(true);
      setName("");
      setEmail("");
      setPhone("");
      setHelpText("");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("form.errors.generic");
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 overflow-x-hidden font-[family-name:var(--font-body)]">
      {/* ── Ambient background glows ─────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-[10%] h-[520px] w-[520px] rounded-full bg-[#f43f5e]/8 blur-[130px]" />
        <div className="absolute top-[30%] right-[-5%] h-[400px] w-[400px] rounded-full bg-[#0066ff]/5 blur-[110px]" />
        <div className="absolute bottom-[10%] left-[30%] h-[300px] w-[300px] rounded-full bg-[#f43f5e]/5 blur-[100px]" />
      </div>

      {/* ── Subtle grid overlay ───────────────────────────────────────── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════ */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href={`/${locale}`} className="group flex items-center gap-2">
          <Image
            src="/Transparent white1.png"
            alt="Reelify"
            width={160}
            height={80}
            className="cursor-pointer transition-all duration-300 group-hover:opacity-70 group-hover:scale-[0.98]"
          />
        </Link>
        <nav className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href="/login"
            className="rounded-full border border-gray-200 bg-gray-50 px-5 py-2 text-sm font-medium text-gray-600 transition-all duration-200 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
          >
            {tCommon("login")}
          </Link>
        </nav>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-32 pt-8 space-y-28">
        {/* ═══════════════════════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════════════════════════ */}
        <section className="relative flex flex-col items-center text-center gap-8 pt-10 pb-4">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f43f5e]/30 bg-[#f43f5e]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#e11d48]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f43f5e] animate-pulse" />
            {t("hero.badge")}
          </div>

          {/* Headline */}
          <h1 className="max-w-3xl text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-gray-900">
            {t("hero.title")}
          </h1>

          {/* Subtext */}
          <p className="max-w-xl text-lg text-gray-500 leading-relaxed">{t("hero.subtitle")}</p>

          {/* CTA row */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="#demo-form"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[#f43f5e] px-7 py-3.5 text-sm font-bold text-white transition-all duration-300 hover:bg-[#e11d48] hover:scale-[1.03] active:scale-[0.98]"
            >
              {t("hero.primaryCta")}
              <svg
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </a>
            <a
              href="#demo-video"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-7 py-3.5 text-sm font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:border-gray-300 hover:text-gray-900"
            >
              <svg className="h-4 w-4 text-[#f43f5e]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {t("hero.secondaryCta")}
            </a>
          </div>

          <p className="text-xs text-gray-400">{t("hero.note")}</p>

          {/* Stats strip */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-px rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden divide-x divide-gray-100 shadow-sm">
            {["stat1", "stat2"].map((statKey) => (
              <div key={statKey} className="flex flex-col items-center gap-0.5 px-10 py-5">
                <span className="text-2xl font-black text-gray-900">
                  {t(`hero.${statKey}.value`)}
                </span>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                  {t(`hero.${statKey}.label`)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            HOW IT WORKS — 3-step process
        ══════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="mb-12 text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t("hero.kicker")}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              {t("hero.kickerSubtitle")}
            </h2>
          </div>

          <div className="relative grid gap-4 lg:grid-cols-3">
            {/* Connector line on desktop */}
            <div className="pointer-events-none absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] hidden h-px bg-gradient-to-r from-transparent via-[#f43f5e]/30 to-transparent lg:block" />

            {["step1", "step2", "step3"].map((stepKey, index) => (
              <div
                key={stepKey}
                className="group relative rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:border-[#f43f5e]/30 hover:shadow-md"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f43f5e]/12 text-sm font-black text-[#e11d48] ring-1 ring-[#f43f5e]/25">
                  {index + 1}
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">
                  {t(`howItWorks.${stepKey}.title`)}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t(`howItWorks.${stepKey}.description`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            VIDEO DEMO
        ══════════════════════════════════════════════════════════════════ */}
        <section id="demo-video" className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f43f5e]/30 bg-[#f43f5e]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#e11d48]">
              {t("video.badge")}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
              {t("video.title")}
            </h2>
            <p className="text-gray-500 leading-relaxed">{t("video.subtitle")}</p>

            <ul className="space-y-3">
              {["point1", "point2", "point3"].map((pointKey) => (
                <li key={pointKey} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f43f5e]/12 text-[#e11d48] text-[10px] font-black">
                    ✓
                  </span>
                  {t(`video.points.${pointKey}`)}
                </li>
              ))}
            </ul>

            {/* Compact flow steps */}
            <div className="flex flex-wrap gap-2">
              {["step1", "step2", "step3"].map((stepKey, index) => (
                <div
                  key={stepKey}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600"
                >
                  <span className="text-[#f43f5e] font-bold">{index + 1}.</span>
                  {t(`video.flow.${stepKey}`)}
                </div>
              ))}
            </div>

            <a
              href="#demo-form"
              className="inline-flex items-center gap-2 rounded-full bg-[#f43f5e] px-6 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-[#e11d48] hover:scale-[1.02]"
            >
              {t("video.cta")}
            </a>
          </div>

          {/* Video player */}
          <div className="relative rounded-3xl border border-gray-100 bg-white p-1.5 shadow-[0_4px_40px_rgba(244,63,94,0.12)]">
            <div className="relative aspect-video w-full overflow-hidden rounded-[20px] bg-gray-50">
              <div className="pointer-events-none absolute inset-0 z-10 rounded-[20px] ring-1 ring-inset ring-black/5" />
              <video src="/demo.mp4" controls className="h-full w-full object-cover" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-400">
              <span>{t("video.caption")}</span>
              <span className="font-mono text-[#f43f5e]">2:30</span>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            FEATURES GRID
        ══════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="mb-12 max-w-lg space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t("features.title")}
            </div>
            <p className="text-gray-500 leading-relaxed">{t("features.subtitle")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {["feature1", "feature2", "feature3", "feature4", "feature5", "feature6"].map(
              (featureKey, index) => (
                <div
                  key={featureKey}
                  className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:border-[#f43f5e]/25 hover:shadow-md"
                >
                  {/* Subtle teal gradient in corner on hover */}
                  <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-[#f43f5e]/8 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  {/* Feature number */}
                  <div className="mb-4 text-xs font-black text-gray-200 font-mono">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <p className="font-bold text-gray-900 text-[15px] mb-2">
                    {t(`features.items.${featureKey}.title`)}
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {t(`features.items.${featureKey}.description`)}
                  </p>

                  <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#f43f5e]/20 bg-[#f43f5e]/8 px-3 py-1 text-[11px] font-semibold text-[#e11d48]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#f43f5e]/60" />
                    {t("features.valueBadge")}
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            CONTACT / DEMO REQUEST FORM
        ══════════════════════════════════════════════════════════════════ */}
        <section
          id="demo-form"
          className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
        >
          {/* Decorative glows */}
          <div className="pointer-events-none absolute -top-32 -left-20 h-72 w-72 rounded-full bg-[#f43f5e]/8 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-[#0066ff]/5 blur-[70px]" />

          <div className="relative grid gap-12 p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:p-14">
            {/* Left — copy */}
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f43f5e]/30 bg-[#f43f5e]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#e11d48]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f43f5e] animate-pulse" />
                {t("hero.badge")}
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
                {t("cta.title")}
              </h2>
              <p className="text-gray-500 leading-relaxed">{t("cta.subtitle")}</p>
              <p className="text-sm text-gray-400">{t("cta.reviewNote")}</p>
            </div>

            {/* Right — form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    className="block text-xs font-semibold uppercase tracking-widest text-gray-400"
                    htmlFor="name"
                  >
                    {t("form.name")}
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f43f5e]/30 focus:border-[#f43f5e]/40 transition-all"
                    placeholder={t("form.placeholders.name")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    className="block text-xs font-semibold uppercase tracking-widest text-gray-400"
                    htmlFor="phone"
                  >
                    {t("form.phone")}
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f43f5e]/30 focus:border-[#f43f5e]/40 transition-all"
                    placeholder={t("form.placeholders.phone")}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  className="block text-xs font-semibold uppercase tracking-widest text-gray-400"
                  htmlFor="email"
                >
                  {t("form.email")}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f43f5e]/30 focus:border-[#f43f5e]/40 transition-all"
                  placeholder={t("form.placeholders.email")}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="block text-xs font-semibold uppercase tracking-widest text-gray-400"
                  htmlFor="helpText"
                >
                  {t("form.help")}
                </label>
                <textarea
                  id="helpText"
                  rows={4}
                  value={helpText}
                  onChange={(e) => setHelpText(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f43f5e]/30 focus:border-[#f43f5e]/40 transition-all resize-none"
                  placeholder={t("form.placeholders.help")}
                  required
                />
              </div>

              {submitError && (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                  role="alert"
                >
                  {submitError}
                </p>
              )}
              {submitSuccess && (
                <p
                  className="rounded-xl border border-[#f43f5e]/20 bg-[#f43f5e]/8 px-4 py-3 text-sm text-[#e11d48]"
                  role="status"
                >
                  {t("form.success")}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="group w-full rounded-xl bg-[#f43f5e] px-6 py-4 text-sm font-bold text-white transition-all duration-200 hover:bg-[#e11d48] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {t("form.submitting")}
                  </>
                ) : (
                  <>
                    {t("form.submit")}
                    <svg
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                      />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="flex flex-wrap items-center justify-center gap-6 border-t border-gray-100 pt-8 text-xs text-gray-400">
          <Link href={`/${locale}/privacy`} className="transition-colors hover:text-gray-700">
            {tCommon("privacyPolicy")}
          </Link>
          <span className="text-gray-200">•</span>
          <Link href={`/${locale}/terms`} className="transition-colors hover:text-gray-700">
            {tCommon("termsAndConditions")}
          </Link>
        </footer>
      </div>
    </main>
  );
}
