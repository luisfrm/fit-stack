"use server";

import { updateTag } from "next/cache";
import { sessionService } from "@/lib/services/session-service";

/**
 * Purga el data cache de Next para los ajustes de la organización activa.
 *
 * `updateTag` es **server-only** (`next/cache`): los consumidores de settings
 * son client components (páginas `settings/*` y el hook `useSettings`), así que
 * la invalidación viaja por este server action. Un client component NO puede
 * llamar `updateTag` directamente.
 *
 * El tag se deriva SIEMPRE de la sesión en el servidor — nunca de un valor que
 * mande el cliente (mismo criterio que las páginas RSC que invalidan inline).
 *
 * Recordatorio del patrón completo: servicio → esta purga → `router.refresh()`.
 * Sin la purga, `refresh()` relee una entrada de caché fresca por tag y la
 * pantalla queda vieja hasta que vence el TTL.
 */
export async function invalidateSettingsCache(): Promise<void> {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  if (!activeOrgId) return;
  updateTag(`org:${activeOrgId}:settings`);
}
