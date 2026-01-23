import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Realify Arabic Reels",
  description: "تحويل الفيديوهات العربية إلى مقاطع قصيرة جاهزة للنشر."
};

// RootLayout is the layout for the entire application
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
