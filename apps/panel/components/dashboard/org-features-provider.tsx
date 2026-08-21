"use client";

import * as React from "react";
import { resolveFeatures, type PlanFeaturesV2 } from "@workspace/shared";

export interface OrgFeaturesContextValue {
  features: PlanFeaturesV2;
  limits: Record<string, number>;
  isFreeTier: boolean;
  subscriptionStatus: string;
}

const OrgFeaturesContext = React.createContext<OrgFeaturesContextValue>({
  features: {},
  limits: {},
  isFreeTier: false,
  subscriptionStatus: "active",
});

interface OrgFeaturesProviderProps {
  readonly features?: PlanFeaturesV2 | null;
  readonly limits?: Record<string, number>;
  readonly isFreeTier?: boolean;
  readonly subscriptionStatus?: string;
  readonly children: React.ReactNode;
}

export function OrgFeaturesProvider({
  features,
  limits,
  isFreeTier = false,
  subscriptionStatus = "active",
  children,
}: OrgFeaturesProviderProps) {
  const value = React.useMemo<OrgFeaturesContextValue>(
    () => ({
      features: resolveFeatures(features),
      limits: limits ?? {},
      isFreeTier,
      subscriptionStatus,
    }),
    [features, limits, isFreeTier, subscriptionStatus],
  );

  return <OrgFeaturesContext.Provider value={value}>{children}</OrgFeaturesContext.Provider>;
}

export function useOrgFeatures(): OrgFeaturesContextValue {
  return React.useContext(OrgFeaturesContext);
}