/**
 * Shared Organization Additional Fields
 * Used by both API (server) and CMS (client metadata/types)
 */
export const ORGANIZATION_ADDITIONAL_FIELDS = {
  slogan: { type: "string", required: false },
  countryCode: { type: "string", required: false },
  taxId: { type: "string", required: false },
  legalName: { type: "string", required: false },
  address: { type: "string", required: false },
  fiscalConfig: { type: "string", required: false },
} as const;

export type OrganizationAdditionalFields = typeof ORGANIZATION_ADDITIONAL_FIELDS;
