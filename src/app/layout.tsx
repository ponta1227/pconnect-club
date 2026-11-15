import type { Metadata, Viewport } from "next";
import "@fontsource/barlow-semi-condensed/latin-600.css";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "P-CONNECT Jr.", template: "%s | P-CONNECT Jr." },
  description: "P-CONNECT Jr. のクラブ連絡アプリ",
  applicationName: "P-CONNECT Jr.",
  appleWebApp: { capable: true, title: "P-CONNECT Jr.", statusBarStyle: "default" },
  icons: { icon: "/icons/192", apple: "/icons/180" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c4fa0",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="ja" translate="no" data-font={user?.fontSize ?? "normal"} className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
