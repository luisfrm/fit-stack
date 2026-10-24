import { describe, expect, it } from "vitest";
import {
  effectivePriceCents,
  selectTopPlansByRevenue,
  selectRevenueGrowth,
  selectExpiringSoon,
  selectOrgCurrentMonth,
  selectOrgBilledTotal,
  selectOrgLatestPayment,
  selectPaymentDisplayAmount,
} from "@/lib/platform/subscription-selectors";
import type {
  PlatformPayment,
  SubscriptionWithDetails,
  SubscriptionStats,
} from "@/lib/services/platform-subscriptions-service";

function makeSub(
  overrides: Partial<SubscriptionWithDetails> = {},
): SubscriptionWithDetails {
  return {
    id: 1,
    organizationId: "org-1",
    planId: 10,
    status: "active",
    startDate: "2026-01-01",
    currentPeriodEnd: "2026-02-01",
    ...overrides,
  } as SubscriptionWithDetails;
}

function makeStats(
  overrides: Partial<SubscriptionStats> = {},
): SubscriptionStats {
  return {
    active: 0,
    pastDue: 0,
    readOnly: 0,
    suspended: 0,
    cancelled: 0,
    total: 0,
    monthlyRevenueCents: 0,
    previousMonthRevenueCents: 0,
    mrrCents: 0,
    unconvertedCount: 0,
    primaryCurrency: "USD",
    ...overrides,
  };
}

describe("effectivePriceCents", () => {
  it("uses the plan price", () => {
    expect(effectivePriceCents(makeSub({ planPrice: 5000 }))).toBe(5000);
  });

  it("is zero for missing prices", () => {
    expect(effectivePriceCents(makeSub({}))).toBe(0);
  });
});

describe("selectTopPlansByRevenue", () => {
  it("groups by plan and sorts desc", () => {
    const result = selectTopPlansByRevenue([
      makeSub({ id: 1, planId: 10, planName: "Basic", planPrice: 1000 }),
      makeSub({ id: 2, planId: 20, planName: "Pro", planPrice: 5000 }),
      makeSub({ id: 3, planId: 10, planName: "Basic", planPrice: 1000 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      planId: 20,
      revenueCents: 5000,
      count: 1,
    });
    expect(result[1]).toMatchObject({
      planId: 10,
      revenueCents: 2000,
      count: 2,
    });
  });
});

describe("selectRevenueGrowth", () => {
  it("computes pct growth", () => {
    expect(
      selectRevenueGrowth(
        makeStats({ monthlyRevenueCents: 150, previousMonthRevenueCents: 100 }),
      ),
    ).toEqual({ current: 150, previous: 100, pct: 50 });
  });

  it("returns null pct when previous is zero", () => {
    expect(
      selectRevenueGrowth(
        makeStats({ monthlyRevenueCents: 150, previousMonthRevenueCents: 0 }),
      ),
    ).toEqual({ current: 150, previous: 0, pct: null });
  });
});

describe("selectExpiringSoon", () => {
  const NOW = new Date("2026-09-09T12:00:00Z");

  it("returns subs expiring within the window sorted asc", () => {
    const result = selectExpiringSoon(
      [
        makeSub({ id: 1, currentPeriodEnd: "2026-09-12T23:00:00Z" }),
        makeSub({ id: 2, currentPeriodEnd: "2026-09-09T23:00:00Z" }),
        makeSub({ id: 3, currentPeriodEnd: "2026-12-01T23:00:00Z" }),
      ],
      NOW,
    );
    expect(result.map((r) => r.sub.id)).toEqual([2, 1]);
    expect(result[0]?.daysLeft).toBe(0);
    expect(result[1]?.daysLeft).toBe(3);
  });

  it("excludes expired and cancelled subs", () => {
    const result = selectExpiringSoon(
      [
        makeSub({ id: 1, currentPeriodEnd: "2026-09-01T00:00:00Z" }),
        makeSub({
          id: 2,
          currentPeriodEnd: "2026-09-10T00:00:00Z",
          cancelledAt: "2026-09-08T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(result).toEqual([]);
  });

  it("caps the list to the limit", () => {
    const subs = Array.from({ length: 10 }, (_, i) =>
      makeSub({ id: i + 1, currentPeriodEnd: "2026-09-10T00:00:00Z" }),
    );
    expect(selectExpiringSoon(subs, NOW, 7, 3)).toHaveLength(3);
  });
});

describe("selectOrgCurrentMonth", () => {
  const NOW = new Date("2026-09-09T12:00:00Z");
  const invoices = [
    {
      status: "validated",
      paymentDate: "2026-09-05T00:00:00Z",
      platformAmount: 5000,
    },
    {
      status: "validated",
      paymentDate: "2026-09-15T00:00:00Z",
      platformAmount: 3000,
    },
    {
      status: "processing",
      paymentDate: "2026-09-20T00:00:00Z",
      platformAmount: 9999,
    },
    {
      status: "validated",
      paymentDate: "2026-08-10T00:00:00Z",
      platformAmount: 2000,
    },
    // Unconverted historical row: no normalized amount, never assumed 1:1.
    {
      status: "validated",
      paymentDate: "2026-09-06T00:00:00Z",
      platformAmount: null,
    },
  ] as const;

  it("sums validated payments of the current UTC month with the platform amount", () => {
    expect(selectOrgCurrentMonth([...invoices], NOW)).toEqual({
      totalCents: 8000,
      count: 2,
    });
  });
});

describe("selectOrgBilledTotal", () => {
  it("sums validated payments only, skipping unconverted rows", () => {
    expect(
      selectOrgBilledTotal([
        { status: "validated", platformAmount: 5000 },
        { status: "validated", platformAmount: 3000 },
        { status: "processing", platformAmount: 9999 },
        { status: "validated", platformAmount: null },
      ]),
    ).toEqual({ totalCents: 8000, count: 2 });
  });
});

describe("selectOrgLatestPayment", () => {
  const payment = (
    overrides: Partial<PlatformPayment> = {},
  ): PlatformPayment =>
    ({
      id: 1,
      organizationId: "org-1",
      planId: 10,
      status: "validated",
      paymentDate: "2026-09-05T00:00:00Z",
      amountPaid: 5000,
      currencyPaid: "USD",
      planSnapshotPrice: 5000,
      ...overrides,
    }) as PlatformPayment;

  it("returns the most recent validated payment", () => {
    const result = selectOrgLatestPayment([
      payment({ id: 1, paymentDate: "2026-09-05T00:00:00Z" }),
      payment({ id: 2, paymentDate: "2026-10-05T00:00:00Z" }),
      payment({ id: 3, paymentDate: "2026-08-01T00:00:00Z" }),
    ]);
    expect(result?.id).toBe(2);
  });

  it("skips voided receipts even when they are the most recent", () => {
    const result = selectOrgLatestPayment([
      payment({ id: 1, paymentDate: "2026-09-05T00:00:00Z" }),
      payment({
        id: 2,
        paymentDate: "2026-10-05T00:00:00Z",
        receiptVoided: true,
      }),
    ]);
    expect(result?.id).toBe(1);
  });

  it("returns null when every validated payment has a voided receipt", () => {
    expect(
      selectOrgLatestPayment([
        payment({ id: 1, receiptVoided: true }),
        payment({ id: 2, paymentDate: "2026-10-05T00:00:00Z", receiptVoided: true }),
      ]),
    ).toBeNull();
  });

  it("ignores non-validated rows and invalid dates", () => {
    expect(
      selectOrgLatestPayment([
        payment({ id: 1, status: "processing", paymentDate: "2026-10-05T00:00:00Z" }),
        payment({ id: 2, paymentDate: "not-a-date" }),
      ]),
    ).toBeNull();
  });
});

describe("selectPaymentDisplayAmount", () => {
  it("uses the persisted platform amount with the primary currency, never currencyPaid", () => {
    expect(
      selectPaymentDisplayAmount(
        { platformAmount: 20000 },
        "USD",
      ),
    ).toEqual({ amountCents: 20000, currency: "USD" });
  });

  it("renders an unconverted payment as zero without inventing an amount", () => {
    expect(
      selectPaymentDisplayAmount(
        { platformAmount: null },
        "USD",
      ),
    ).toEqual({ amountCents: 0, currency: "USD" });
  });
});
