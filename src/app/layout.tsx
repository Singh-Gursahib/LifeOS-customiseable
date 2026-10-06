import type { Metadata, Viewport } from "next";
import { Saira_Condensed, Share_Tech_Mono, IBM_Plex_Mono } from "next/font/google";
import SWRegister from "@/components/SWRegister";
import "./globals.css";

const displayFont = Saira_Condensed({
  variable: "--font-display",
  weight: ["500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const dataFont = Share_Tech_Mono({
  variable: "--font-data",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const bodyFont = IBM_Plex_Mono({
  variable: "--font-body",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LifeOS",
  description: "Personal telemetry — a living journal and knowledge base.",
  applicationName: "LifeOS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LifeOS",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${dataFont.variable} ${bodyFont.variable}`}>
      <body>
        <SWRegister />
        {children}
      </body>
    </html>
  );
}
