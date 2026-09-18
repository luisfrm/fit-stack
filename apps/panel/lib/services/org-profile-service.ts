import { api } from "@/lib/api/client";
import type { FiscalConfig } from "@workspace/shared";

const ORG_PROFILE_PATH = "/organizations/profile";

/**
 * Perfil org-scoped de la sede: identidad (nombre, logo, eslogan, zona
 * horaria, formato de moneda) + identidad emisora fiscal (`fiscalConfig`).
 *
 * `countryCode`/`primaryCurrency` NO van aquí: son inmutables post-creación
 * (el API responde 400 `IMMUTABLE_FIELD`).
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
  fiscalConfig?: FiscalConfig | null;
  confirmed?: boolean;
}

/**
 * Única vía de escritura del panel para la fila `organization`.
 * Nunca toca `/platform/organizations`: ese service es de nivel plataforma
 * (`requirePlatformAuth`) y un owner de gym no tiene ese rol.
 */
export const orgProfileService = {
  async updateProfile(data: OrgProfileInput): Promise<unknown> {
    return await api(ORG_PROFILE_PATH, {
      method: "PATCH",
      body: data,
    });
  },
};
