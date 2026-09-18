/**
 * Keys R2 deterministas: misma entrada → misma key (idempotencia del paso 2).
 */
import { describe, expect, it } from 'vitest';
import {
  panelReceiptKey,
  platformReceiptKey,
} from '../../src/documents/receipt-storage-keys';

describe('panelReceiptKey', () => {
  it('arma receipts/<slug>/<año>/<numero>.pdf', () => {
    expect(panelReceiptKey('fit-stack', 2026, 'fit-stack-2026-000045')).toBe(
      'receipts/fit-stack/2026/fit-stack-2026-000045.pdf',
    );
  });

  it('normaliza el slug y rechaza inválidos', () => {
    expect(panelReceiptKey('  Fit-Stack ', 2026, 'fit-stack-2026-000045')).toBe(
      'receipts/fit-stack/2026/fit-stack-2026-000045.pdf',
    );
    expect(() => panelReceiptKey('fit stack', 2026, 'fit-stack-2026-000045')).toThrow();
    expect(() => panelReceiptKey('fit-stack', 99, 'fit-stack-2026-000045')).toThrow();
    expect(() => panelReceiptKey('fit-stack', 2026, 'FS-0000001')).toThrow();
  });
});

describe('platformReceiptKey', () => {
  it('arma platform/receipts/<año>/<numero>.pdf (reservado C2)', () => {
    expect(platformReceiptKey(2026, 'FS-0000001')).toBe(
      'platform/receipts/2026/FS-0000001.pdf',
    );
  });
});
