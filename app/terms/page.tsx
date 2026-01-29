"use client";

import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";

export default function TermsPage() {
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
            الشروط والأحكام
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
                مرحباً بك في Realify. باستخدامك لخدماتنا، فإنك توافق على الالتزام بهذه الشروط والأحكام. يرجى قراءتها بعناية قبل استخدام الخدمة.
              </p>
            </section>

            {/* Service Description */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">وصف الخدمة</h2>
              <p className="text-muted-foreground leading-relaxed">
                Realify هي خدمة تتيح لك تحويل الفيديوهات الطويلة إلى مقاطع قصيرة (ريلز) باستخدام تقنيات الذكاء الاصطناعي. نقوم بتحليل محتوى الفيديو واقتراح أفضل المقاطع للنشر على منصات التواصل الاجتماعي المختلفة.
              </p>
            </section>

            {/* Acceptance */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">قبول الشروط</h2>
              <p className="text-muted-foreground leading-relaxed">
                باستخدامك لموقعنا أو خدماتنا، فإنك تقر وتوافق على:
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>أنك قد قرأت وفهمت هذه الشروط والأحكام</li>
                <li>أنك تبلغ من العمر 13 عاماً على الأقل</li>
                <li>أن لديك الصلاحية القانونية للموافقة على هذه الشروط</li>
                <li>أنك ستستخدم الخدمة بشكل قانوني ووفقاً لهذه الشروط</li>
              </ul>
            </section>

            {/* User Content */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">المحتوى الخاص بك</h2>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">الملكية</h3>
                <p className="text-muted-foreground leading-relaxed">
                  أنت تحتفظ بجميع حقوق الملكية للمحتوى الذي ترفعه على خدمتنا. نحن لا ندعي ملكية أي محتوى ترسله أو ترفعه.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">الترخيص</h3>
                <p className="text-muted-foreground leading-relaxed">
                  بتحميل محتوى على خدمتنا، فإنك تمنحنا ترخيصاً محدوداً وغير حصري ومؤقت لمعالجة هذا المحتوى بهدف تقديم الخدمة لك. ينتهي هذا الترخيص فور انتهاء جلسة المعالجة.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">المسؤولية عن المحتوى</h3>
                <p className="text-muted-foreground leading-relaxed">
                  أنت المسؤول الوحيد عن المحتوى الذي ترفعه. يجب أن تتأكد من أن لديك جميع الحقوق اللازمة لاستخدام هذا المحتوى.
                </p>
              </div>
            </section>

            {/* Prohibited Uses */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">الاستخدامات المحظورة</h2>
              <p className="text-muted-foreground leading-relaxed">
                يُحظر عليك استخدام خدمتنا في الأغراض التالية:
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>رفع أو معالجة محتوى ينتهك حقوق الملكية الفكرية للآخرين</li>
                <li>رفع محتوى غير قانوني أو ضار أو تهديدي أو مسيء</li>
                <li>محاولة الوصول غير المصرح به إلى أنظمتنا</li>
                <li>استخدام الخدمة لإرسال رسائل غير مرغوب فيها (سبام)</li>
                <li>رفع محتوى يحتوي على برامج ضارة أو فيروسات</li>
                <li>انتحال شخصية أي فرد أو كيان</li>
                <li>استخدام الخدمة بطريقة قد تضر بها أو تعطلها</li>
              </ul>
            </section>

            {/* Intellectual Property */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">الملكية الفكرية</h2>
              <p className="text-muted-foreground leading-relaxed">
                جميع حقوق الملكية الفكرية المتعلقة بالخدمة (باستثناء المحتوى الذي يوفره المستخدمون) مملوكة لنا أو لمرخصينا. يشمل ذلك على سبيل المثال لا الحصر:
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>العلامة التجارية والشعار</li>
                <li>تصميم واجهة المستخدم</li>
                <li>الخوارزميات والتقنيات المستخدمة</li>
                <li>النصوص والرسومات والصور</li>
              </ul>
            </section>

            {/* Disclaimer */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">إخلاء المسؤولية</h2>
              <p className="text-muted-foreground leading-relaxed">
                يتم توفير الخدمة &quot;كما هي&quot; و&quot;حسب التوافر&quot; دون أي ضمانات من أي نوع، صريحة أو ضمنية. نحن لا نضمن أن:
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>الخدمة ستكون متاحة بشكل مستمر أو خالية من الأخطاء</li>
                <li>النتائج المحققة ستلبي توقعاتك أو متطلباتك</li>
                <li>أي عيوب أو أخطاء سيتم تصحيحها</li>
              </ul>
            </section>

            {/* Limitation of Liability */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">حدود المسؤولية</h2>
              <p className="text-muted-foreground leading-relaxed">
                إلى أقصى حد يسمح به القانون المعمول به، لن نكون مسؤولين عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية أو عقابية، بما في ذلك على سبيل المثال لا الحصر فقدان الأرباح أو البيانات أو الاستخدام أو السمعة التجارية.
              </p>
            </section>

            {/* Indemnification */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">التعويض</h2>
              <p className="text-muted-foreground leading-relaxed">
                توافق على تعويضنا والدفاع عنا وحمايتنا من أي مطالبات أو أضرار أو التزامات أو تكاليف (بما في ذلك أتعاب المحاماة المعقولة) ناتجة عن:
              </p>
              <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
                <li>استخدامك للخدمة</li>
                <li>انتهاكك لهذه الشروط</li>
                <li>انتهاكك لأي حقوق طرف ثالث</li>
                <li>المحتوى الذي ترفعه أو تشاركه</li>
              </ul>
            </section>

            {/* Modifications */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">التعديلات</h2>
              <p className="text-muted-foreground leading-relaxed">
                نحتفظ بالحق في تعديل أو تحديث هذه الشروط في أي وقت. سنخطرك بأي تغييرات جوهرية عن طريق نشر الشروط الجديدة على هذه الصفحة. استمرارك في استخدام الخدمة بعد أي تعديلات يعني موافقتك على الشروط المعدلة.
              </p>
            </section>

            {/* Termination */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">إنهاء الخدمة</h2>
              <p className="text-muted-foreground leading-relaxed">
                يمكننا إنهاء أو تعليق وصولك إلى الخدمة فوراً، دون إشعار مسبق أو مسؤولية، لأي سبب، بما في ذلك على سبيل المثال لا الحصر انتهاك هذه الشروط.
              </p>
            </section>

            {/* Governing Law */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">القانون الحاكم</h2>
              <p className="text-muted-foreground leading-relaxed">
                تخضع هذه الشروط وتُفسر وفقاً للقوانين المعمول بها، دون اعتبار لأحكام تعارض القوانين.
              </p>
            </section>

            {/* Severability */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">قابلية الفصل</h2>
              <p className="text-muted-foreground leading-relaxed">
                إذا تبين أن أي حكم من هذه الشروط غير قانوني أو باطل أو غير قابل للتنفيذ، فإن هذا الحكم يُعتبر قابلاً للفصل عن هذه الشروط ولا يؤثر على صحة وقابلية تنفيذ الأحكام المتبقية.
              </p>
            </section>

            {/* Contact */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">تواصل معنا</h2>
              <p className="text-muted-foreground leading-relaxed">
                إذا كانت لديك أي أسئلة حول هذه الشروط والأحكام، يمكنك التواصل معنا عبر البريد الإلكتروني.
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
          <Link href="/privacy" className="hover:text-primary transition-colors">
            سياسة الخصوصية
          </Link>
        </div>
      </section>
    </main>
  );
}
