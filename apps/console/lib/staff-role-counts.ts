import type { PlatformStaffMember } from "@/lib/services/staff-service";

export interface StaffRoleCounts {
  owner: number;
  admin: number;
  support: number;
  total: number;
}

/**
 * Counts of platform staff by role. Only owner/admin/support have
 * dedicated counters (the list is already filtered to platform roles);
 * `total` is the actual list size.
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
