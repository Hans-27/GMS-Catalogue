import type { Metadata } from "next";
import { applicationBranding } from "@/lib/branding";
import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider, THEME_STORAGE_KEY } from "@/lib/theme";
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},p=localStorage.getItem(k);if(p!=="light"&&p!=="dark"&&p!=="system")p="system";var t=p==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":p==="dark"?"dark":"light";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme="light";document.documentElement.style.colorScheme="light"}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
