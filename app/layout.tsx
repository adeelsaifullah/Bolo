import type { Metadata, Viewport } from "next";
import { requireConfig } from "@/lib/config";
import { defaultLocale, localeDirection, t } from "@/lib/i18n";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: t("app.name"),
    description: t("app.description"),
    applicationName: t("app.name"),
    appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: requireConfig("app", "pwa.theme_color"),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={defaultLocale()} dir={localeDirection()}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
