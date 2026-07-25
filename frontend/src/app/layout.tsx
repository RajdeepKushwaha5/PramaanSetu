import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PramaanSetu — Trust Layer for Securities Market Communications",
  description:
    "Verify that a financial communication is genuinely from SEBI, an exchange, or a listed company — and catch impersonations before you pay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
