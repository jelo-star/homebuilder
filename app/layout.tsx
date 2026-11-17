import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Gawa-Yad — Gawang Tapat, Gawang Bayad",
  description: "Gawang tapat, gawang bayad. Discover verified contractors, compare portfolios, track construction milestones and manage payments with Gawa-Yad.",
  icons: {
    icon: "/gawa-yad-icon.png",
    apple: "/gawa-yad-icon.png",
  },
};

import { ToastProvider } from "@/components/ui/ToastProvider";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
