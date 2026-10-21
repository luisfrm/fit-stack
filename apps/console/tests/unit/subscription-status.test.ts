import { describe, expect, it } from "vitest";
import { hasActiveSubscription } from "@/lib/platform/subscription-status";

describe("hasActiveSubscription", () => {
  it.each(["active", "trial"])("accepts %s without cancelledAt", (status) => {
    expect(hasActiveSubscription({ status, cancelledAt: null })).toBe(true);
  });

  it.each(["past_due", "read_only", "suspended", "cancelled", "pending"])(
    "rejects %s",
    (status) => {
      expect(hasActiveSubscription({ status, cancelledAt: null })).toBe(false);
    },
  );

  it("rejects an active status with cancelledAt set", () => {
    expect(
      hasActiveSubscription({ status: "active", cancelledAt: "2026-01-01" }),
    ).toBe(false);
  });
});
