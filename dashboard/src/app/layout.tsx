import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { SafetyBanner } from "@/components/safety-banner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rouge Dashboard",
  description: "Flight control tower for AI product factory",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <SafetyBanner />
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
