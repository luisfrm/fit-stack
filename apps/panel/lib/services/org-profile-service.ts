import { api } from "@/lib/api/client";
import type { FiscalConfig } from "@workspace/shared";

const ORG_PROFILE_PATH = "/organizations/profile";

export interface OrgFiscalProfileInput {
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  fiscalConfig?: FiscalConfig | null;
  confirmed?: boolean;
}

/**
 * Perfil org-scoped de la sede (identidad emisora + `fiscalConfig`).
 * Nunca toca `/platform/organizations`: ese service es de nivel plataforma.
 */
export const orgProfileService = {
  async updateProfile(data: OrgFiscalProfileInput): Promise<unknown> {
    return await api(ORG_PROFILE_PATH, {
      method: "PATCH",
      body: data,
    });
  },
};
