import "./globals.css";
import { PostHogProvider } from "./PostHogProvider";
import { Whatsapp } from "vuesax-icons-react";

// Root layout – must provide <html> and <body> for all routes (locale + admin + login).
// The [locale] layout overrides lang/dir via <html> attributes at its level.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
        <a
          className="whatsapp-fab"
          href="https://wa.me/201505588416"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contact us on WhatsApp"
        >
          <Whatsapp size={24} variant="Bold" />
          <span className="sr-only">WhatsApp</span>
        </a>
      </body>
    </html>
  );
}
