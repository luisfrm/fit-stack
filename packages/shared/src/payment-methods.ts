/* ── Suggested payment methods — single source of truth ───────────────────
   Catalog offered when an organization (panel) or the platform (console)
   has no payment method configured yet. It lives HERE only: an app must
   never declare its own copy.

   Resolution rule (`getSuggestedPaymentMethods`):
   - a country contributes its own methods, then the UNIVERSAL ones;
   - a country may specialize a universal entry by reusing its `id`
     (e.g. VE/CO point-of-sale wording or currency): the specialization
     replaces it, so it is never listed twice;
   - an unknown/absent country resolves to the UNIVERSAL set only — it never
     inherits another country's methods.

   Entries are read-only data: callers put them in UI state and clone before
   editing, they never mutate the catalog.
   ─────────────────────────────────────────────────────────────────────── */

import type { IPaymentMethodConfig } from './types';

/** Methods available regardless of the country (no duplicates in a result). */
export const UNIVERSAL_SUGGESTED_PAYMENT_METHODS: readonly IPaymentMethodConfig[] = [
  {
    id: 'cash',
    name: 'Efectivo',
    fields: [],
    currency: null,
  },
  {
    id: 'transferencia',
    name: 'Transferencia Bancaria',
    fields: [
      { id: 'fld_tb1', label: 'Número de Referencia', type: 'text', required: true },
      { id: 'fld_tb2', label: 'Banco Destino', type: 'text', required: true },
    ],
    currency: null,
  },
  {
    id: 'card',
    name: 'Tarjeta / Punto de Venta',
    fields: [
      { id: 'fld_card1', label: 'Referencia de Transacción', type: 'text', required: true },
      { id: 'fld_card2', label: 'Captura del Comprobante', type: 'file', required: false },
    ],
    currency: null,
  },
];

/**
 * Country specific methods, keyed by ISO country code. `Efectivo`,
 * `Transferencia Bancaria` and the point of sale come from the universal set
 * unless the country specializes them (same `id`).
 */
export const COUNTRY_SUGGESTED_PAYMENT_METHODS: Record<
  string,
  readonly IPaymentMethodConfig[]
> = {
  VE: [
    {
      id: 'pago_movil',
      name: 'Pago Móvil',
      fields: [
        { id: 'fld_pm1', label: 'Referencia de Pago', type: 'text', required: true },
        { id: 'fld_pm2', label: 'Banco Emisor', type: 'text', required: true },
        { id: 'fld_pm3', label: 'Captura de Pantalla', type: 'file', required: false },
      ],
      currency: 'VES',
    },
    {
      id: 'zelle',
      name: 'Zelle',
      fields: [
        { id: 'fld_z1', label: 'Email de la cuenta emisora', type: 'text', required: true },
        { id: 'fld_z2', label: 'Nombre del titular', type: 'text', required: false },
      ],
      currency: 'USD',
    },
    {
      id: 'binance',
      name: 'Binance',
      fields: [
        {
          id: 'fld_b1',
          label: 'Instrucciones de Pago',
          type: 'visual',
          required: false,
          value:
            'Método de pago: Binance\nEnviar a: pagos@fitstack.app\nRed: BEP-20 (BNB)\n\nAdjunta el comprobante de la transferencia en los campos de abajo.',
        },
        { id: 'fld_b2', label: 'Email remitente', type: 'text', required: true },
        { id: 'fld_b3', label: 'Comprobante / Captura', type: 'file', required: true },
      ],
      currency: null,
    },
  ],
  CO: [
    {
      id: 'nequi',
      name: 'Nequi',
      fields: [
        { id: 'fld_nq1', label: 'Referencia de Pago', type: 'text', required: true },
        { id: 'fld_nq2', label: 'Captura de Pantalla', type: 'file', required: false },
      ],
      currency: 'COP',
    },
    {
      id: 'daviplata',
      name: 'DaviPlata',
      fields: [
        { id: 'fld_dp1', label: 'Referencia de Pago', type: 'text', required: true },
        { id: 'fld_dp2', label: 'Captura de Pantalla', type: 'file', required: false },
      ],
      currency: 'COP',
    },
    {
      id: 'pse',
      name: 'PSE / Link de Pago',
      fields: [
        { id: 'fld_pse1', label: 'Número de Transacción', type: 'text', required: true },
        { id: 'fld_pse2', label: 'Captura de Pantalla', type: 'file', required: false },
      ],
      currency: 'COP',
    },
    {
      id: 'bre_b',
      name: 'Bre-B / Transfiya',
      fields: [
        { id: 'fld_bb1', label: 'Referencia de Pago', type: 'text', required: true },
        { id: 'fld_bb2', label: 'Banco Destino', type: 'text', required: true },
      ],
      currency: 'COP',
    },
    {
      // Specialization of the universal point of sale (same `id`).
      id: 'card',
      name: 'Datáfono / Tarjeta',
      fields: [
        { id: 'fld_card1', label: 'Referencia de Transacción', type: 'text', required: true },
        { id: 'fld_card2', label: 'Captura del Comprobante', type: 'file', required: false },
      ],
      currency: 'COP',
    },
  ],
};

/**
 * Resolved catalog for a country: its own methods plus the universal ones not
 * already covered. Unknown or absent country → universals only.
 */
export function getSuggestedPaymentMethods(
  countryCode?: string | null,
): IPaymentMethodConfig[] {
  const countryMethods = countryCode
    ? COUNTRY_SUGGESTED_PAYMENT_METHODS[countryCode] ?? []
    : [];
  const covered = new Set(countryMethods.map((method) => method.id));

  return [
    ...countryMethods,
    ...UNIVERSAL_SUGGESTED_PAYMENT_METHODS.filter((method) => !covered.has(method.id)),
  ];
}
