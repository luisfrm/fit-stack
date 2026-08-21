import type { FeatureId, PlanFeaturesV2 } from "@workspace/shared";

export interface FeatureGatedNavItem {
  label: string;
  href: string;
  feature?: FeatureId;
}

/**
 * Filtra items de navegación por features (downgrade = hide).
 * Un item sin `feature` siempre se mantiene; un item con feature solo se
 * muestra si la feature está explícitamente habilitada.
 */
export function filterNavItemsByFeatures<T extends FeatureGatedNavItem>(
  items: readonly T[],
  features: PlanFeaturesV2 | null | undefined,
): T[] {
  if (!features) return [...items];
  return items.filter((item) => !item.feature || features[item.feature]?.enabled === true);
}