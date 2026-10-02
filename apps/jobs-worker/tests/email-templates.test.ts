/**
 * Tests de las plantillas de email (RD-109): el CTA se resuelve desde el
 * handler (env), nunca desde un placeholder dentro del template, y todo
 * valor de operador/usuario interpolado se escapa.
 *
 * Este es el test que habría cazado `@@PANEL_URL@@` en
 * `renderOrgPaymentReceived` y la inyección de HTML en los nombres.
 */
import { describe, expect, it } from 'vitest';
import { renderOrgPaymentReceived } from '../src/templates/org-payment-received';
import { renderOrgInvite } from '../src/templates/org-invite';
import { renderRegistrationInvite } from '../src/templates/send-invitation';

const INJECTION = '<img src=x onerror=alert(1)>';
const ESCAPED_INJECTION = '&lt;img src=x onerror=alert(1)&gt;';
const PANEL_URL = 'https://panel.fit-stack.test';

describe('renderOrgPaymentReceived', () => {
  it('usa el panelUrl recibido en el href (nunca un placeholder)', () => {
    const { html } = renderOrgPaymentReceived({
      orgName: 'Gym Fit Stack',
      planName: 'Plan Pro',
      amountPaid: '50,00 USD',
      paymentMethod: 'Binance',
      paymentDate: '01 de enero de 2026',
      payerName: 'Ana',
      pendingReview: true,
      panelUrl: PANEL_URL,
    });

    expect(html).toContain(`href="${PANEL_URL}"`);
    expect(html).not.toContain('@@PANEL_URL@@');
    expect(html).not.toContain('localhost');
  });

  it('escapa los valores de usuario en el cuerpo y en el asunto', () => {
    const { html, subject } = renderOrgPaymentReceived({
      orgName: `Gym ${INJECTION}`,
      planName: INJECTION,
      amountPaid: '50,00 USD',
      paymentMethod: INJECTION,
      paymentDate: '01 de enero de 2026',
      payerName: INJECTION,
      pendingReview: false,
      panelUrl: PANEL_URL,
    });

    expect(html).not.toContain('<img');
    expect(html).toContain(ESCAPED_INJECTION);
    expect(subject).not.toContain('<img');
    expect(subject).toContain(ESCAPED_INJECTION);
  });
});

describe('renderOrgInvite', () => {
  it('escapa orgName/inviterName y el inviteLink en el href', () => {
    const { html, subject } = renderOrgInvite({
      email: 'invite@example.com',
      orgName: `Gym ${INJECTION}`,
      inviterName: INJECTION,
      inviteLink: 'https://panel.fit-stack.test/invite?token=abc&next=1',
    });

    expect(html).not.toContain('<img');
    expect(html).toContain(ESCAPED_INJECTION);
    expect(html).toContain('href="https://panel.fit-stack.test/invite?token=abc&amp;next=1"');
    expect(subject).not.toContain('<img');
  });
});

describe('renderRegistrationInvite', () => {
  it('escapa token y baseUrl antes de componer el link', () => {
    const { html } = renderRegistrationInvite({
      email: 'invite@example.com',
      token: 'a"b<c',
      target: 'panel',
      baseUrl: PANEL_URL,
    });

    expect(html).toContain(`href="${PANEL_URL}/register?token=a&quot;b&lt;c"`);
    expect(html).not.toContain('token=a"b<c');
  });
});
