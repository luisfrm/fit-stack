import { describe, expect, it } from "vitest";
import {
  selectNewOrgsThisMonth,
  selectPaymentsReview,
  selectRenewals,
  selectTrials,
} from "../../lib/dashboard/selectors";
import type {
  IPlatformOrganization,
  IPlatformSubscription,
} from "@workspace/shared/types";
import type { SubscriptionWithDetails } from "../../lib/services/platform-subscriptions-service";

const NOW = new Date("2026-09-09T12:00:00Z");

function makeSub(
  overrides: Partial<IPlatformSubscription> = {},
): IPlatformSubscription & { planName?: string } {
  return {
    id: 1,
    organizationId: "org-1",
    planId: 1,
    status: "active",
    startDate: "2026-08-09T12:00:00Z",
    currentPeriodEnd: "2026-10-09T12:00:00Z",
    isTrial: false,
    cancelledAt: null,
    createdAt: "2026-08-09T12:00:00Z",
    ...overrides,
  };
}

function makeOrg(
  id: string,
  overrides: Partial<IPlatformOrganization> = {},
): IPlatformOrganization {
  return {
    id,
    name: `Org ${id}`,
    slug: `org-${id}`,
    logo: null,
    countryCode: "VE",
    timezone: "America/Caracas",
    primaryCurrency: "VES",
    currencyFormat: "latam",
    createdAt: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

describe("selectNewOrgsThisMonth", () => {
  it("includes orgs created in the current UTC month, most recent first", () => {
    const orgs = [
      makeOrg("a", { createdAt: "2026-09-02T10:00:00Z" }),
      makeOrg("b", { createdAt: "2026-08-31T23:00:00Z" }),
      makeOrg("c", { createdAt: "2026-09-05T10:00:00Z" }),
    ];
    const result = selectNewOrgsThisMonth(orgs, NOW);
    expect(result.map((o) => o.id)).toEqual(["c", "a"]);
  });
});

describe("selectRenewals", () => {
  it("orders overdue first (most overdue on top), then expiring", () => {
    const orgs = [
      makeOrg("expiring-far", {
        latestSubscription: makeSub({
          status: "active",
          currentPeriodEnd: "2026-09-29T12:00:00Z",
        }),
      }),
      makeOrg("overdue-recent", {
        latestSubscription: makeSub({
          status: "past_due",
          currentPeriodEnd: "2026-09-07T12:00:00Z",
        }),
      }),
      makeOrg("overdue-old", {
        latestSubscription: makeSub({
          status: "suspended",
          currentPeriodEnd: "2026-08-01T12:00:00Z",
        }),
      }),
      makeOrg("expiring-soon", {
        latestSubscription: makeSub({
          status: "active",
          currentPeriodEnd: "2026-09-12T12:00:00Z",
        }),
      }),
    ];
    const result = selectRenewals(orgs, NOW);
    expect(result.map((r) => r.org.id)).toEqual([
      "overdue-old",
      "overdue-recent",
      "expiring-soon",
    ]);
    expect(result[0]?.urgency).toBe("overdue");
    expect(result[2]?.urgency).toBe("expiring");
  });

  it("excludes trials, cancelled and orgs without subscription", () => {
    const orgs = [
      makeOrg("trial", {
        latestSubscription: makeSub({
          status: "trial",
          isTrial: true,
          currentPeriodEnd: "2026-09-10T12:00:00Z",
        }),
      }),
      makeOrg("cancelled", {
        latestSubscription: makeSub({
          status: "cancelled",
          cancelledAt: "2026-09-01T12:00:00Z",
          currentPeriodEnd: "2026-09-05T12:00:00Z",
        }),
      }),
      makeOrg("no-sub", { latestSubscription: null }),
      makeOrg("read-only", {
        latestSubscription: makeSub({
          status: "read_only",
          currentPeriodEnd: "2026-08-30T12:00:00Z",
        }),
      }),
    ];
    const result = selectRenewals(orgs, NOW);
    expect(result.map((r) => r.org.id)).toEqual(["read-only"]);
  });
});

describe("selectTrials", () => {
  it("splits expiring trials from all trials", () => {
    const orgs = [
      makeOrg("trial-soon", {
        latestSubscription: makeSub({
          status: "trial",
          isTrial: true,
          currentPeriodEnd: "2026-09-12T12:00:00Z",
        }),
      }),
      makeOrg("trial-late", {
        latestSubscription: makeSub({
          status: "trial",
          isTrial: true,
          currentPeriodEnd: "2026-10-20T12:00:00Z",
        }),
      }),
      makeOrg("trial-cancelled", {
        latestSubscription: makeSub({
          status: "cancelled",
          isTrial: true,
          cancelledAt: "2026-09-01T12:00:00Z",
          currentPeriodEnd: "2026-09-12T12:00:00Z",
        }),
      }),
      makeOrg("paid", {
        latestSubscription: makeSub({
          status: "active",
          currentPeriodEnd: "2026-09-12T12:00:00Z",
        }),
      }),
    ];
    const { expiring, all } = selectTrials(orgs, NOW);
    expect(expiring.map((t) => t.org.id)).toEqual(["trial-soon"]);
    expect(all.map((t) => t.org.id)).toEqual(["trial-soon", "trial-late"]);
  });
});

describe("selectPaymentsReview", () => {
  it("keeps only processing payments, most recent first", () => {
    const base: SubscriptionWithDetails = {
      id: 1,
      organizationId: "org-1",
      organizationName: "Org 1",
      organizationSlug: "org-1",
      planId: 1,
      planName: "Pro",
      planPrice: 2900,
      planCurrency: "USD",
      planDurationValue: 1,
      planDurationUnit: "month",
      status: "past_due",
      startDate: "2026-08-09T12:00:00Z",
      currentPeriodEnd: "2026-09-09T12:00:00Z",
      isTrial: false,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: "2026-08-09T12:00:00Z",
      latestPaymentStatus: "processing",
      paymentsCount: 1,
    };
    const subs: SubscriptionWithDetails[] = [
      { ...base, id: 1, createdAt: "2026-08-09T12:00:00Z" },
      {
        ...base,
        id: 2,
        latestPaymentStatus: "validated",
        createdAt: "2026-09-08T12:00:00Z",
      },
      { ...base, id: 3, createdAt: "2026-09-07T12:00:00Z" },
    ];
    const result = selectPaymentsReview(subs);
    expect(result.map((s) => s.id)).toEqual([3, 1]);
  });
});
