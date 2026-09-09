import { describe, expect, it } from "vitest";
import {
  selectOrgKpis,
  selectOrgHealth,
  selectPortalAdoption,
  filterOrgsBySubStatus,
  filterOrgsByCountry,
} from "@/lib/platform/organization-selectors";
import type {
  IPlatformOrganization,
  IPlatformSubscription,
  PlatformSubscriptionStatus,
} from "@workspace/shared/types";

const NOW = new Date("2026-09-09T12:00:00Z");

function makeOrg(
  overrides: Partial<IPlatformOrganization> = {},
): IPlatformOrganization {
  return {
    id: "org-1",
    name: "Org 1",
    slug: "org-1",
    logo: null,
    countryCode: "VE",
    timezone: "America/Caracas",
    primaryCurrency: "VES",
    currencyFormat: "latam",
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  } as IPlatformOrganization;
}

function makeSub(
  overrides: Partial<IPlatformSubscription> = {},
): IPlatformSubscription {
  return {
    id: 1,
    organizationId: "org-1",
    planId: 10,
    status: "active",
    startDate: "2026-08-01",
    currentPeriodEnd: "2026-10-01T00:00:00Z",
    isTrial: false,
    cancelledAt: null,
    ...overrides,
  };
}

describe("selectOrgKpis", () => {
  it("counts totals, new this month and sub splits", () => {
    const orgs = [
      makeOrg({
        id: "a",
        createdAt: "2026-09-02T00:00:00Z",
        latestSubscription: makeSub(),
      }),
      makeOrg({
        id: "b",
        createdAt: "2026-08-10T00:00:00Z",
        latestSubscription: makeSub({ status: "suspended" }),
      }),
      makeOrg({ id: "c", createdAt: "2026-09-05T00:00:00Z" }),
    ];
    expect(selectOrgKpis(orgs, NOW)).toEqual({
      total: 3,
      newThisMonth: 2,
      withActiveSub: 1,
      withoutActiveSub: 2,
    });
  });
});

describe("selectOrgHealth", () => {
  it("returns down without subscription", () => {
    expect(selectOrgHealth(makeOrg({}), NOW)).toBe("down");
  });

  it.each(["suspended", "cancelled"] as PlatformSubscriptionStatus[])(
    "returns down for %s",
    (status) => {
      expect(
        selectOrgHealth(
          makeOrg({ latestSubscription: makeSub({ status }) }),
          NOW,
        ),
      ).toBe("down");
    },
  );

  it("returns down when cancelledAt is set even with active status", () => {
    expect(
      selectOrgHealth(
        makeOrg({ latestSubscription: makeSub({ cancelledAt: "2026-09-01" }) }),
        NOW,
      ),
    ).toBe("down");
  });

  it.each(["past_due", "read_only"] as PlatformSubscriptionStatus[])(
    "returns warn for %s",
    (status) => {
      expect(
        selectOrgHealth(
          makeOrg({ latestSubscription: makeSub({ status }) }),
          NOW,
        ),
      ).toBe("warn");
    },
  );

  it("returns warn when expiring within 7 days", () => {
    expect(
      selectOrgHealth(
        makeOrg({
          latestSubscription: makeSub({
            currentPeriodEnd: "2026-09-12T00:00:00Z",
          }),
        }),
        NOW,
      ),
    ).toBe("warn");
  });

  it.each(["active", "trial"] as PlatformSubscriptionStatus[])(
    "returns ok for healthy %s",
    (status) => {
      expect(
        selectOrgHealth(
          makeOrg({
            latestSubscription: makeSub({
              status,
              currentPeriodEnd: "2026-12-01T00:00:00Z",
            }),
          }),
          NOW,
        ),
      ).toBe("ok");
    },
  );
});

describe("selectPortalAdoption", () => {
  it("computes the outside-portal pct", () => {
    expect(
      selectPortalAdoption({
        activeSubMembers: 10,
        portal: { used: 4, pending: 1 },
      }),
    ).toEqual({ outsidePct: 60, inPortal: 4, pending: 1 });
  });

  it("returns null pct without base", () => {
    expect(
      selectPortalAdoption({
        activeSubMembers: 0,
        portal: { used: 0, pending: 0 },
      }),
    ).toEqual({ outsidePct: null, inPortal: 0, pending: 0 });
  });

  it("clamps at zero when portal exceeds active subs", () => {
    expect(
      selectPortalAdoption({
        activeSubMembers: 2,
        portal: { used: 5, pending: 0 },
      }),
    ).toEqual({ outsidePct: 0, inPortal: 5, pending: 0 });
  });
});

describe("filterOrgsBySubStatus", () => {
  const orgs = [
    makeOrg({ id: "a", latestSubscription: makeSub({ status: "active" }) }),
    makeOrg({ id: "b", latestSubscription: makeSub({ status: "past_due" }) }),
    makeOrg({ id: "c" }),
  ];

  it("returns all without filter", () => {
    expect(filterOrgsBySubStatus(orgs, null)).toHaveLength(3);
  });

  it("filters active as healthy subs", () => {
    expect(filterOrgsBySubStatus(orgs, "active").map((o) => o.id)).toEqual([
      "a",
    ]);
  });

  it("filters none as without active sub", () => {
    expect(filterOrgsBySubStatus(orgs, "none").map((o) => o.id)).toEqual([
      "b",
      "c",
    ]);
  });

  it("filters by raw status", () => {
    expect(filterOrgsBySubStatus(orgs, "past_due").map((o) => o.id)).toEqual([
      "b",
    ]);
  });
});

describe("filterOrgsByCountry", () => {
  const orgs = [
    makeOrg({ id: "a", countryCode: "VE" }),
    makeOrg({ id: "b", countryCode: "CO" }),
  ];

  it("returns all without filter", () => {
    expect(filterOrgsByCountry(orgs, null)).toHaveLength(2);
  });

  it("filters by country", () => {
    expect(filterOrgsByCountry(orgs, "CO").map((o) => o.id)).toEqual(["b"]);
  });
});
