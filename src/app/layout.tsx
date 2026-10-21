import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/providers/providers";
import { AuthProvider } from "@/providers/auth-provider";
import { OfflineSyncProvider } from "@/providers/offline-sync-provider";
import { BlockYieldSettingsBridge } from "@/providers/block-yield-settings-provider";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, BRAND_COLORS } from "@/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: APP_SHORT_NAME,
    template: `%s · ${APP_SHORT_NAME}`,
  },
  description: APP_DESCRIPTION,
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
  manifest: "/manifest.webmanifest",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_COLORS.green },
    { media: "(prefers-color-scheme: dark)", color: BRAND_COLORS.navy },
  ],
  applicationName: APP_NAME,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <AuthProvider>
            <BlockYieldSettingsBridge>
              <OfflineSyncProvider>{children}</OfflineSyncProvider>
            </BlockYieldSettingsBridge>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
