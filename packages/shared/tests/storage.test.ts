/**
 * Storage policy tests.
 *
 * La política de "público" es única y la consumen tres apps (route público del
 * api-worker, `getMediaUrl` de panel y console): si cambia aquí, cambia en todas
 * o el asset deja de verse / se filtra. Por eso se cubre como contrato.
 */
import { describe, expect, it } from 'vitest';
import {
  isOrgStorageKey,
  isPublicStorageKey,
  orgStoragePrefix,
  PLATFORM_BRANDING_PREFIX,
} from '../src/storage';

describe('isPublicStorageKey', () => {
  it('publishes only the site assets of an organization (`<orgId>/cms/…`)', () => {
    expect(isPublicStorageKey('org-1/cms/hero_abc123.png')).toBe(true);
    expect(isPublicStorageKey('org-1/cms/gallery/foto_abc123.png')).toBe(true);
  });

  it('publishes the platform branding (login/e-mails without session)', () => {
    expect(isPublicStorageKey(`${PLATFORM_BRANDING_PREFIX}logo_abc123.png`)).toBe(true);
  });

  it('keeps everything else private', () => {
    // Avatares y logos (carpeta por defecto = raíz del scope de la org).
    expect(isPublicStorageKey('org-1/avatar_abc123.png')).toBe(false);
    // Evidencia de pago.
    expect(isPublicStorageKey('org-1/receipts/pago_abc123.png')).toBe(false);
    // Comprobantes emitidos (namespace determinista del renderer).
    expect(isPublicStorageKey('org-1/receipts/2026/1.pdf')).toBe(false);
    expect(isPublicStorageKey('receipts/org-1/2026/1.pdf')).toBe(false);
    expect(isPublicStorageKey('platform/receipts/2026/FS-1.pdf')).toBe(false);
  });

  it('does not publish legacy `cms/<orgId>/…` keys (clean cut)', () => {
    expect(isPublicStorageKey('cms/org-1/hero_abc123.png')).toBe(false);
  });

  it('is not fooled by a key that merely contains "cms"', () => {
    expect(isPublicStorageKey('org-1/not-cms/hero.png')).toBe(false);
    expect(isPublicStorageKey('org-1')).toBe(false);
    expect(isPublicStorageKey('')).toBe(false);
  });
});

describe('org scope helpers', () => {
  it('bounds every org key with the org prefix', () => {
    expect(orgStoragePrefix('org-1')).toBe('org-1/');
    expect(isOrgStorageKey('org-1', 'org-1/cms/hero.png')).toBe(true);
    expect(isOrgStorageKey('org-1', 'org-1/receipts/2026/1.pdf')).toBe(true);
  });

  it('never accepts another organization key (or a prefix lookalike)', () => {
    expect(isOrgStorageKey('org-1', 'org-2/cms/hero.png')).toBe(false);
    // `org-1-extra` empieza por `org-1` pero NO por `org-1/`.
    expect(isOrgStorageKey('org-1', 'org-1-extra/cms/hero.png')).toBe(false);
    expect(isOrgStorageKey('org-1', 'receipts/org-1/2026/1.pdf')).toBe(false);
    expect(isOrgStorageKey('', 'cms/hero.png')).toBe(false);
  });
});
