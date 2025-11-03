import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Aura Creatures - X Profile NFTs",
  description: "AI-generated NFT collection on Base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

