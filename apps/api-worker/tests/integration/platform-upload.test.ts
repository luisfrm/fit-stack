/**
 * Platform upload integration tests.
 *
 * Covers: /api/platform/upload (presigned/direct/list/delete) — the
 * platform-scoped R2 routes for assets with no organization context
 * (e.g. branding), guarded by `requirePlatformAuth`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '../helpers/client';
import { assertSchemaReady, skipReason, truncateAll } from '../helpers/db';
import {
  registerPlatformUser,
  registerUser,
  type AuthedUser,
} from '../helpers/auth';

describe.skipIf(skipReason !== null)('Platform Upload API', () => {
  let admin: AuthedUser;
  let normalUser: AuthedUser;

  beforeAll(async () => {
    await assertSchemaReady();
    await truncateAll();
    // Shared fixtures: one admin (platform role) + one org-level user.
    admin = await registerPlatformUser('admin');
    normalUser = await registerUser();
  });

  it('issues a presigned upload URL scoped to platform assets', async () => {
    const res = await admin.client.post('/api/platform/upload/presigned', {
      filename: 'logo.png',
      contentType: 'image/png',
      folder: 'branding',
      customName: 'logo',
    });

    expect(res.status, res.text).toBe(200);
    expect(res.body).toHaveProperty('presignedUrl');
    expect(res.body.key).toMatch(/^platform\/branding\/logo_[a-f0-9]+\.png$/);
  });

  it('stores the file via direct upload and serves it publicly', async () => {
    const presigned = await admin.client.post('/api/platform/upload/presigned', {
      filename: 'logo.png',
      contentType: 'image/png',
      folder: 'branding',
      customName: 'logo',
    });

    const key = presigned.body.key;
    const upload = await admin.client.put('/api/platform/upload/direct', 'fake-png-bytes', {
      query: { key },
      headers: { 'content-type': 'image/png' },
    });

    expect(upload.status, upload.text).toBe(200);
    expect(admin.client.r2.objects.has(key)).toBe(true);

    const publicRes = await admin.client.get(`/api/public/files/${key}`);
    expect(publicRes.status, publicRes.text).toBe(200);
    expect(publicRes.text).toContain('fake-png-bytes');
  });

  it('lists platform assets by folder', async () => {
    const presigned = await admin.client.post('/api/platform/upload/presigned', {
      filename: 'logo.png',
      contentType: 'image/png',
      folder: 'branding',
      customName: 'logo',
    });

    await admin.client.put('/api/platform/upload/direct', 'png', {
      query: { key: presigned.body.key },
      headers: { 'content-type': 'image/png' },
    });

    const res = await admin.client.get('/api/platform/upload', {
      query: { folder: 'branding' },
    });

    expect(res.status, res.text).toBe(200);
    const keys = res.body.map((f: { key: string }) => f.key);
    expect(keys).toContain(presigned.body.key);
  });

  it('deletes a platform asset', async () => {
    const presigned = await admin.client.post('/api/platform/upload/presigned', {
      filename: 'logo.png',
      contentType: 'image/png',
      folder: 'branding',
      customName: 'logo',
    });

    const key = presigned.body.key;
    await admin.client.put('/api/platform/upload/direct', 'png', {
      query: { key },
      headers: { 'content-type': 'image/png' },
    });
    expect(admin.client.r2.objects.has(key)).toBe(true);

    const del = await admin.client.delete('/api/platform/upload', {
      query: { key },
    });

    expect(del.status, del.text).toBe(200);
    expect(admin.client.r2.objects.has(key)).toBe(false);
  });

  it('rejects deleting keys outside the platform scope', async () => {
    const res = await admin.client.delete('/api/platform/upload', {
      query: { key: 'cms/org123/branding/logo.png' },
    });

    expect(res.status, res.text).toBe(403);
  });

  it('rejects unauthenticated requests', async () => {
    const client = createClient();
    const res = await client.post('/api/platform/upload/presigned', {
      filename: 'logo.png',
      contentType: 'image/png',
    }, { anonymous: true });

    expect(res.status, res.text).toBe(401);
  });

  it('rejects org-level users without platform role', async () => {
    const res = await normalUser.client.post('/api/platform/upload/presigned', {
      filename: 'logo.png',
      contentType: 'image/png',
    });

    expect(res.status, res.text).toBe(403);
  });
});