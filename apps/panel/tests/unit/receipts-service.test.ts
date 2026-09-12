import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
const apiBlobMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: apiMock,
  apiBlob: apiBlobMock,
}));

import { receiptsService } from '../../lib/services/receipts-service';

beforeEach(() => {
  apiMock.mockReset();
  apiBlobMock.mockReset();
});

describe('receiptsService', () => {
  it('getReceipt propaga los 3 estados del contrato', async () => {
    const ready = {
      available: true,
      pdfStatus: 'ready',
      receiptNumber: 'fit-1',
      receipt: { document: { number: 'fit-1' } },
      pdfUrl: '/api/payments/7/receipt/pdf',
    };
    apiMock.mockResolvedValue(ready);
    await expect(receiptsService.getReceipt(7)).resolves.toEqual(ready);
    expect(apiMock).toHaveBeenCalledWith('/payments/7/receipt');

    const pending = { available: true, pdfStatus: 'pending', receiptNumber: 'fit-1' };
    apiMock.mockResolvedValue(pending);
    await expect(receiptsService.getReceipt(7)).resolves.toEqual(pending);

    const preSystem = { available: false, reason: 'pre_system' };
    apiMock.mockResolvedValue(preSystem);
    await expect(receiptsService.getReceipt(8)).resolves.toEqual(preSystem);
  });

  it('downloadReceipt descarga el binario contra /receipt/pdf', async () => {
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' });
    apiBlobMock.mockResolvedValue(blob);
    // jsdom no implementa URL.createObjectURL: stub puntual del test.
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const clicks: string[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, ...rest: unknown[]) => {
      const el = (origCreate as (...a: unknown[]) => HTMLElement)(tag, ...rest);
      if (tag === 'a') {
        el.click = () => {
          clicks.push((el as HTMLAnchorElement).download);
        };
      }
      return el;
    }) as typeof document.createElement);

    await receiptsService.downloadReceipt(7, 'fit-stack-2026-1.pdf');

    expect(apiBlobMock).toHaveBeenCalledWith('/payments/7/receipt/pdf');
    expect(clicks).toEqual(['fit-stack-2026-1.pdf']);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sendReceiptEmail mapea queued:true y pending (202)', async () => {
    apiMock.mockResolvedValue({ success: true, queued: true, attachment: true });
    await expect(receiptsService.sendReceiptEmail(7)).resolves.toEqual({
      queued: true,
      attachment: true,
    });

    apiMock.mockResolvedValue({ success: true, queued: false, pdfStatus: 'pending' });
    await expect(receiptsService.sendReceiptEmail(7)).resolves.toEqual({
      queued: false,
      pdfStatus: 'pending',
    });
  });

  it('issueReceipt hace POST a /issue', async () => {
    apiMock.mockResolvedValue({ receiptNumber: 'fit-1', pdfStatus: 'pending' });
    await receiptsService.issueReceipt(7);
    expect(apiMock).toHaveBeenCalledWith('/payments/7/issue', { method: 'POST' });
  });
});
