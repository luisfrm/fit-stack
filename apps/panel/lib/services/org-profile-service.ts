import { api } from "@/lib/api/client";
import type { FiscalConfig } from "@workspace/shared";

const ORG_PROFILE_PATH = "/organizations/profile";

/**
 * Perfil org-scoped de la sede: identidad (nombre, logo, eslogan, zona
 * horaria, formato de moneda) + identidad emisora fiscal (`fiscalConfig`).
 *
 * `countryCode` NO va aquí: es inmutable post-creación (400 `IMMUTABLE_FIELD`).
 * `primaryCurrency` es editable por API (debe estar en `active_currencies`),
 * pero el panel no expone ese campo: la moneda principal se elige en Console.
 */
export interface OrgProfileInput {
  name?: string;
  slug?: string;
  logo?: string | null;
  slogan?: string | null;
  timezone?: string;
  currencyFormat?: "latam" | "usa";
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  /**
   * Tenant-owned fiscal keys only (`disclaimerOverride`, `documentLabel`).
   * The regime (`isFormalTaxpayer`) is Console-only: the API answers
   * `403 FISCAL_CONFIG_PLATFORM_ONLY`, so it is never typed here.
   */
  fiscalConfig?: FiscalConfig;
}

/**
 * Única vía de escritura del panel para la fila `organization`.
 * Nunca toca `/platform/organizations`: ese service es de nivel plataforma
 * (`console:manage`) y un owner de gym no tiene ese rol.
 */
export const orgProfileService = {
  async updateProfile(data: OrgProfileInput): Promise<unknown> {
    return await api(ORG_PROFILE_PATH, {
      method: "PATCH",
      body: data,
    });
  },
};
