import "./globals.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  title: "Realify Arabic Reels",
  description: "تحويل الفيديوهات العربية إلى مقاطع قصيرة جاهزة للنشر."
};

// RootLayout is the layout for the entire application
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}
        <Analytics />
      </body>
    </html>
  );
}
