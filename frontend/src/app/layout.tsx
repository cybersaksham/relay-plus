import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Relay Plus",
  description:
    "Local-first AI workspace orchestration for multi-repository systems work.",
};

import { AppContextProvider } from "@/lib/app-context";
import { AppShell } from "@/components/app-shell";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <AppContextProvider>
          <AppShell>{children}</AppShell>
        </AppContextProvider>
      </body>
    </html>
  );
}
