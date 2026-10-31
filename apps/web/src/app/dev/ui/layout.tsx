import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Lu à chaque requête : en production, le guide n'existe que si SHOW_DEV_UI=1 (tests E2E).
export default async function DevUiLayout({ children }: LayoutProps<"/dev/ui">) {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DEV_UI !== "1") {
    notFound();
  }
  return children;
}
