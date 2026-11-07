import { DEVICE_COOKIE } from "@/lib/auth-paths";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ClassSessionsView } from "@/components/relais/class-sessions";
import { requireRole } from "@/lib/auth.server";
import { getRelaisSessions } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Sessions élèves" };

// RW-Session.dc.html : planifier, ouvrir, suivre et fermer une session élève.
export default async function RelaisSessionsPage({ searchParams }: PageProps<"/relais/sessions">) {
  await requireRole("relais");
  const [data, { planifiee }, jar] = await Promise.all([
    getRelaisSessions(),
    searchParams,
    cookies(),
  ]);
  return (
    <ClassSessionsView
      data={data}
      plannedId={typeof planifiee === "string" ? planifiee : null}
      onDevice={jar.has(DEVICE_COOKIE)}
    />
  );
}
