import { describe, expect, it } from "vitest";
import {
  effectivePriceCents,
  selectTopPlansByRevenue,
  selectRevenueGrowth,
  selectExpiringSoon,
  selectOrgCurrentMonth,
  selectOrgBilledTotal,
} from "@/lib/platform/subscription-selectors";
import type {
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
    isTrial: false,
    ...overrides,
  } as SubscriptionWithDetails;
}

function makeStats(
  overrides: Partial<SubscriptionStats> = {},
): SubscriptionStats {
  return {
    active: 0,
    trial: 0,
    pastDue: 0,
    readOnly: 0,
    suspended: 0,
    cancelled: 0,
    total: 0,
    monthlyRevenueCents: 0,
    previousMonthRevenueCents: 0,
    mrrCents: 0,
    ...overrides,
  };
}

describe("effectivePriceCents", () => {
  it("prefers priceOverride over planPrice", () => {
    expect(
      effectivePriceCents(makeSub({ priceOverride: 4000, planPrice: 5000 })),
    ).toBe(4000);
  });

  it("falls back to planPrice", () => {
    expect(effectivePriceCents(makeSub({ planPrice: 5000 }))).toBe(5000);
  });

  it("is zero for trials and missing prices", () => {
    expect(
      effectivePriceCents(makeSub({ isTrial: true, planPrice: 5000 })),
    ).toBe(0);
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
      amountPaid: 5000,
      baseAmount: 5000,
    },
    {
      status: "validated",
      paymentDate: "2026-09-15T00:00:00Z",
      amountPaid: 3000,
      baseAmount: null,
    },
    {
      status: "processing",
      paymentDate: "2026-09-20T00:00:00Z",
      amountPaid: 9999,
      baseAmount: 9999,
    },
    {
      status: "validated",
      paymentDate: "2026-08-10T00:00:00Z",
      amountPaid: 2000,
      baseAmount: 2000,
    },
  ] as const;

  it("sums validated payments of the current UTC month with baseAmount fallback", () => {
    expect(selectOrgCurrentMonth([...invoices], NOW)).toEqual({
      totalCents: 8000,
      count: 2,
    });
  });
});

describe("selectOrgBilledTotal", () => {
  it("sums validated payments only", () => {
    expect(
      selectOrgBilledTotal([
        { status: "validated", amountPaid: 5000, baseAmount: 5000 },
        { status: "validated", amountPaid: 3000, baseAmount: null },
        { status: "processing", amountPaid: 9999, baseAmount: 9999 },
      ]),
    ).toEqual({ totalCents: 8000, count: 2 });
  });
});
