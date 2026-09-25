import type { Metadata } from "next";
import { applicationBranding } from "@/lib/branding";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: applicationBranding.applicationName,
  description: `Secure catalogue management for ${applicationBranding.companyName}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
