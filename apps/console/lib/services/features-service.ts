import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { FeatureCatalog } from "@workspace/shared";

export interface PlatformFeaturesResponse {
  catalog: FeatureCatalog;
  version: number;
}

/**
 * Service para el catálogo de features de la plataforma
 * (`GET /api/platform/features` — platform auth).
 */
export const featuresService = {
  async getCatalog(options?: ApiFetchOptions): Promise<PlatformFeaturesResponse | null> {
    try {
      return await api<PlatformFeaturesResponse>("/platform/features", options);
    } catch (err) {
      console.error("Error fetching platform features catalog:", err);
      return null;
    }
  },
};