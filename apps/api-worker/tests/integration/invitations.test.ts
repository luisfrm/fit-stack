/**
 * Organization invitation flow (better-auth organization plugin).
 *
 * Covers the path enabled by migration `0032`: `POST /api/members` with
 * `sendInvite: true` calls `auth.api.createInvitation`, which persists
 * `invitation.created_at` — and the `admin` plugin expects
 * `session.impersonated_by` to exist on every session read. Without those
 * columns the Drizzle adapter rejects the request with a schema mismatch, and
 * `membersService` swallows the error (`catch` + `console.error`), so the
 * invitee silently never receives a pending invitation.
 *
 * The acceptance half goes through the real endpoint the panel uses
 * (`/organization/accept-invitation`), so the `organizationHooks`
 * (`afterAcceptInvitation` linking `gym_member.user_id`) are exercised too.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertSchemaReady, skipReason, testQuery, truncateAll } from '../helpers/db';
import { createGymTenant, registerUser, uniqueEmail, type GymTenant } from '../helpers/auth';

interface InvitationRow {
  id: string;
  status: string;
  created_at: string | null;
}

describe.skipIf(skipReason !== null)('Organization invitations', () => {
  let tenant: GymTenant;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    tenant = await createGymTenant('invitations-owner');
  });

  it('persists created_at, then acceptance activates the org and links the member', async () => {
    const invitee = await registerUser({ email: uniqueEmail('invitee-cashier') });

    // Inviting an EXISTING user takes the better-auth invitation path; a brand
    // new email takes the JWT invite-token path instead.
    const created = await tenant.owner.client.post('/api/members', {
      firstName: 'Invited',
      lastName: 'Cashier',
      email: invitee.email,
      role: 'cashier',
      sendInvite: true,
    });
    expect(created.status, created.text).toBe(201);

    const rows = await testQuery<InvitationRow>(
      `SELECT id, status, created_at FROM "invitation"
       WHERE organization_id = $1 AND email = $2`,
      [tenant.organization.id, invitee.email],
    );
    expect(rows, 'createInvitation must persist exactly one pending invitation').toHaveLength(1);
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.created_at, 'invitation.created_at must be written').not.toBeNull();

    const invitationId = rows[0]!.id;

    // Same call the panel makes from /accept-invitation/[id].
    const accepted = await invitee.client.post('/api/auth/organization/accept-invitation', {
      invitationId,
    });
    expect(accepted.status, accepted.text).toBe(200);

    const sessionRes = await invitee.client.get('/api/auth/get-session');
    expect(sessionRes.status, sessionRes.text).toBe(200);
    const session = sessionRes.body as
      | {
          session?: { activeOrganizationId?: string | null };
          member?: { role?: string } | null;
        }
      | undefined;
    expect(session?.session?.activeOrganizationId).toBe(tenant.organization.id);
    expect(session?.member?.role).toBe('cashier');

    // afterAcceptInvitation links the existing gym_member row to the new user.
    const linked = await testQuery<{ user_id: string | null }>(
      `SELECT user_id FROM gym_member WHERE organization_id = $1 AND email = $2`,
      [tenant.organization.id, invitee.email],
    );
    expect(linked[0]?.user_id).toBe(invitee.userId);

    const finalRows = await testQuery<{ status: string }>(
      `SELECT status FROM "invitation" WHERE id = $1`,
      [invitationId],
    );
    expect(finalRows[0]?.status).toBe('accepted');
  });
});
