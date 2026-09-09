import { describe, expect, it } from 'vitest';
import { getStaffRoleCounts } from '../../lib/staff-role-counts';

describe('getStaffRoleCounts', () => {
  it('counts staff by platform role', () => {
    expect(
      getStaffRoleCounts([
        { role: 'owner' },
        { role: 'admin' },
        { role: 'admin' },
        { role: 'support' },
      ]),
    ).toEqual({ owner: 1, admin: 2, support: 1, total: 4 });
  });

  it('ignores unknown roles in per-role counts but keeps the total', () => {
    expect(getStaffRoleCounts([{ role: 'user' }, { role: 'admin' }])).toEqual({
      owner: 0,
      admin: 1,
      support: 0,
      total: 2,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(getStaffRoleCounts([])).toEqual({ owner: 0, admin: 0, support: 0, total: 0 });
  });
});
