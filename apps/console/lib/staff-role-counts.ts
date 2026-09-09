import type { PlatformStaffMember } from "@/lib/services/staff-service";

export interface StaffRoleCounts {
  owner: number;
  admin: number;
  support: number;
  total: number;
}

/**
 * Conteo de staff de plataforma por rol. Solo owner/admin/support tienen
 * conteo propio (la lista ya viene filtrada a roles de plataforma);
 * `total` es el tamaño real de la lista.
 */
export function getStaffRoleCounts(
  staff: Pick<PlatformStaffMember, "role">[],
): StaffRoleCounts {
  const counts: StaffRoleCounts = { owner: 0, admin: 0, support: 0, total: staff.length };
  for (const member of staff) {
    if (member.role === "owner") counts.owner += 1;
    else if (member.role === "admin") counts.admin += 1;
    else if (member.role === "support") counts.support += 1;
  }
  return counts;
}
