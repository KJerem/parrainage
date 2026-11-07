import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth.server";

// Toute adresse inconnue de l'espace relais : 404, dans la coquille du relais.
export default async function RelaisInconnuPage() {
  await requireRole("relais");
  notFound();
}
