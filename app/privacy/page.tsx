"use client";

import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gradient-warm" dir="rtl">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-24 pt-10">
        {/* Logo */}
        <div className="flex items-center justify-center">
          <Link href="/">
            <Image
              src="/Transparent white1.png"
              alt="Realify"
              width={160}
              height={80}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>

        {/* Header */}
        <header className="text-center space-y-4 animate-fade-in mt-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            سياسة الخصوصية
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            آخر تحديث: يناير 2026
          </p>
        </header>

        {/* Content */}
        <Card className="shadow-card border-0 bg-gradient-card animate-fade-in">
          <CardContent className="p-8 sm:p-10 space-y-8">
            {/* Introduction */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">مقدمة</h2>
              <p className="text-muted-foreground leading-relaxed">
                مرحباً بك في Realify. نحن نقدر ثقتك بنا ونلتزم بحماية خصوصيتك. توضح سياسة الخصوصية هذه كيفية جمع واستخدام وحماية معلوماتك الشخصية عند استخدام خدماتنا.
              </p>
            </section>

            {/* Data Collection */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">المعلومات التي نجمعها</h2>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">1. معلومات الفيديو</h3>
                <p className="text-muted-foreground leading-relaxed">
                  عندما ترفع فيديو، نقوم بمعالجته محلياً على جهازك. لا يتم تخزين محتوى الفيديو على خوادمنا بشكل دائم، ويتم حذفه تلقائياً بعد انتهاء جلسة المعالجة.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">2. بيانات التفضيلات</h3>
                <p className="text-muted-foreground leading-relaxed">
                  نجمع تفضيلاتك المتعلقة بالمنصة المستهدفة، ومدة المقطع، والجمهور المستهدف، والنبرة، وأسلوب الافتتاح. هذه المعلومات تُستخدم فقط لتحسين جودة المقاطع المُنتجة.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">3. بيانات الاستخدام</h3>
                <p className="text-muted-foreground leading-relaxed">
                  نستخدم خدمات تحليل مجهولة الهوية (مثل Vercel Analytics) لفهم كيفية استخدام الخدمة وتحسينها. هذه البيانات لا تحتوي على معلومات شخصية قابلة للتحديد.
                </p>
              </div>
            </section>

            {/* Data Usage */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">كيف نستخدم معلوماتك</h2>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>تقديم خدمة تحويل الفيديو إلى مقاطع قصيرة</li>
                <li>تحسين جودة الخدمة والميزات المقدمة</li>
                <li>فهم أنماط الاستخدام لتطوير الخدمة</li>
                <li>التواصل معك بشأن التحديثات المهمة (إذا اشتركت في القائمة البريدية)</li>
              </ul>
            </section>

            {/* Data Security */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">أمان البيانات</h2>
              <p className="text-muted-foreground leading-relaxed">
                نتخذ تدابير أمنية معقولة لحماية معلوماتك، بما في ذلك:
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>معالجة الفيديو محلياً على جهازك قدر الإمكان</li>
                <li>تشفير البيانات أثناء النقل باستخدام HTTPS</li>
                <li>حذف الملفات المؤقتة تلقائياً بعد انتهاء الجلسة</li>
                <li>عدم تخزين معلومات شخصية حساسة</li>
              </ul>
            </section>

            {/* Changes */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">التغييرات على هذه السياسة</h2>
              <p className="text-muted-foreground leading-relaxed">
                قد نقوم بتحديث سياسة الخصوصية هذه من وقت لآخر. سنخطرك بأي تغييرات جوهرية عن طريق نشر السياسة الجديدة على هذه الصفحة وتحديث تاريخ &quot;آخر تحديث&quot;.
              </p>
            </section>

            {/* Contact */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">تواصل معنا</h2>
              <p className="text-muted-foreground leading-relaxed">
                إذا كانت لديك أي أسئلة حول سياسة الخصوصية هذه، يمكنك التواصل معنا عبر البريد الإلكتروني.
              </p>
            </section>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground animate-fade-in">
          <Link href="/" className="hover:text-primary transition-colors">
            الرئيسية
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-primary transition-colors">
            الشروط والأحكام
          </Link>
        </div>
      </section>
    </main>
  );
}
