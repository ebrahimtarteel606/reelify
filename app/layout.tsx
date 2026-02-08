import "./globals.css";
import { PostHogProvider } from "./PostHogProvider";

// Root layout – must provide <html> and <body> for all routes (locale + admin + login).
// The [locale] layout overrides lang/dir via <html> attributes at its level.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
