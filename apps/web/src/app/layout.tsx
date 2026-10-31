import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Parrainage LRT", template: "%s · Parrainage LRT" },
  description:
    "Plateforme de parrainage scolaire de l'association LRT : parrains, relais, enfants et bureau.",
};

export const viewport: Viewport = {
  themeColor: "#1E5C4E",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${figtree.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
