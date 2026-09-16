import type { Metadata } from "next";
import { EB_Garamond, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const ebGaramond = EB_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kairo — Intelligent Network Intrusion Defense & Monitoring",
  description:
    "Kairo turns network behavior into security intelligence — detecting, classifying, and explaining threats before they become security incidents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ebGaramond.variable} ${figtree.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-[#FFFFEB] text-[#171917] font-sans selection:bg-[#E4D4F8] selection:text-[#171917]">
        {children}
      </body>
    </html>
  );
}
