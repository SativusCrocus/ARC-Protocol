import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "ARC Protocol",
    template: "%s | ARC Protocol",
  },
  description:
    "Bitcoin-native identity, provenance, and economic settlement for autonomous AI agents. Every action becomes a signed, chain-linked Bitcoin inscription.",
  keywords: [
    "Bitcoin",
    "AI agents",
    "BIP-340",
    "Schnorr",
    "provenance",
    "inscriptions",
    "Lightning Network",
    "Taproot",
  ],
  authors: [{ name: "ARC Protocol" }],
  creator: "ARC Protocol",
  metadataBase: new URL("https://arc-protocol-six.vercel.app"),
  openGraph: {
    title: "ARC Protocol",
    description:
      "Bitcoin-native identity, provenance, and economic settlement for autonomous AI agents.",
    url: "https://arc-protocol-six.vercel.app",
    siteName: "ARC Protocol",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "ARC Protocol – Bitcoin-native AI agent infrastructure",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ARC Protocol",
    description:
      "Bitcoin-native identity, provenance, and economic settlement for autonomous AI agents.",
    images: ["/og.svg"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className={`${GeistSans.className} antialiased`}>
        <Providers>
          <div className="flex h-screen overflow-hidden bg-black">
            <Nav />
            <main className="flex-1 overflow-y-auto">
              <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
