import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { GridBackdrop } from "@/components/GridBackdrop";
import { Providers } from "@/components/Providers";
import { StatusStrip } from "@/components/StatusStrip";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

// Pages render per request so the CSP nonce created in middleware.ts can be applied to them.
export const dynamic = "force-dynamic";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export const viewport: Viewport = {
  themeColor: "#04070A",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <GridBackdrop />
          <div className="relative flex min-h-screen flex-col">
            <TopBar />
            <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
            <StatusStrip />
          </div>
        </Providers>
      </body>
    </html>
  );
}
