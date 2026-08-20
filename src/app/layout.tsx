import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Zapply — Autofill job applications in one click",
    template: "%s · Zapply",
  },
  description:
    "Zapply fills out job applications for you, remembers your answers, and keeps every application you've sent in one tracker.",
  applicationName: "Zapply",
  keywords: ["job application autofill", "Workday autofill", "Greenhouse autofill", "job tracker", "ATS"],
  openGraph: {
    title: "Zapply — Autofill job applications in one click",
    description:
      "Fill any job application in one click, reuse your answers everywhere, and track every application automatically.",
    url: APP_URL,
    siteName: "Zapply",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Zapply", description: "Autofill job applications in one click." },
};

export const viewport: Viewport = {
  themeColor: "#5B2AD6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
