"use client";

import * as React from "react";
import {
  Building2,
  Globe,
  ShieldCheck,
  Fingerprint,
  Save,
  Clock,
} from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { ImageUpload } from "@workspace/ui/components/image-upload";
import { Textarea } from "@workspace/ui/components/textarea";
import { CountrySelector, toast, Title, SimpleSelect, DocumentIdField } from "@workspace/ui";
import { useAuth, usePermissions } from "@workspace/auth/hooks";
import { uploadService } from "@/lib/services/upload-service";
import { orgProfileService } from "@/lib/services/org-profile-service";
import { requireOrgConfig } from "@/lib/org-config";
import {
  mutationError,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  defaultTaxDocumentType,
  FiscalConfigSchema,
  formatDocumentId,
  getCountryIdentity,
  parseDocumentId,
  resolveDocumentLabel,
  resolveFiscalProfile,
} from "@workspace/shared";
import { COUNTRY_LIST, COUNTRIES } from "@workspace/shared/constants";

import { useRouter } from "next/navigation";

/**
 * Read-only fact row of the fiscal identity: the issuer identity and the
 * fiscal regime are governed elsewhere (identity: this form; regime: Console).
 */
function FiscalFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="bg-foreground/5 border border-border p-4 rounded-xl space-y-1">
      <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-tighter">
        {label}
      </Text>
      <Text size="sm" weight="bold" className="break-words">
        {value}
      </Text>
    </div>
  );
}

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const { isPending: sessionLoading, activeOrganization: activeOrg, refetch } = useAuth();

  // Empty until the session fills it: the form NEVER renders invented values
  // (country/timezone/format are NOT NULL columns of the organization).
  const [formData, setFormData] = React.useState({
    name: "",
    slug: "",
    slogan: "",
    legalName: "",
    taxId: "",
    address: "",
    countryCode: "",
    timezone: "",
    currencyFormat: "",
  });

  /** Visible failure when the session does not expose the org config. */
  const [configError, setConfigError] = React.useState<string | null>(null);

  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const { can } = usePermissions();
  const canUpdateFiscal = can(PERMISSION_MODULES.ORGANIZATION, PERMISSION_ACTIONS.UPDATE);

  const [fiscalDisclaimer, setFiscalDisclaimer] = React.useState("");
  const [fiscalFormal, setFiscalFormal] = React.useState(false);
  const [fiscalProfile, setFiscalProfile] = React.useState<
    ReturnType<typeof resolveFiscalProfile> | null
  >(null);
  const [fiscalError, setFiscalError] = React.useState<string | null>(null);
  const [isSavingFiscal, setIsSavingFiscal] = React.useState(false);
  const fiscalInitialized = React.useRef(false);

  const hasInitialized = React.useRef(false);

  React.useEffect(() => {
    if (!activeOrg || hasInitialized.current) return;
    const org = activeOrg;
    hasInitialized.current = true;

    // Required org config (NOT NULL columns): lagging or corrupt data fails
    // visibly instead of rendering "VE"/"America/Caracas"/"latam" (AGENTS.md §9/§10).
    let config;
    try {
      config = requireOrgConfig(org);
      setConfigError(null);
    } catch (err) {
      setConfigError(
        err instanceof Error
          ? err.message
          : "No se pudo leer la configuración de la organización.",
      );
      console.error("[OrgSettings]", err);
      return;
    }

    setFormData({
      name: org.name || "",
      slug: org.slug || "",
      slogan: org.slogan || "",
      legalName: org.legalName || "",
      taxId: org.taxId || "",
      address: org.address || "",
      countryCode: config.countryCode,
      timezone: config.timezone,
      currencyFormat: config.currencyFormat,
    });
    setLogoUrl(org.logo || null);

    if (!fiscalInitialized.current) {
      fiscalInitialized.current = true;
      try {
        const countryCode = org.countryCode;
        if (!countryCode) {
          throw new Error("La organización no tiene país configurado.");
        }
        const stored = FiscalConfigSchema.safeParse(org.fiscalConfig ?? {});
        const config = stored.success ? stored.data : {};
        // Fiscal regime is read-only here: `COUNTRIES` is the tax SSOT and
        // `isFormalTaxpayer` is activated from Console.
        const profile = resolveFiscalProfile(countryCode, config);
        setFiscalProfile(profile);
        setFiscalDisclaimer((config.disclaimerOverride ?? []).join("\n"));
        setFiscalFormal(profile.isFormalTaxpayer);
        setFiscalError(null);
      } catch (err) {
        setFiscalError("No se pudo cargar la configuración fiscal.");
        console.error("[OrgFiscalSection]", err);
      }
    }
  }, [activeOrg]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.SubmitEvent) => {
    e.preventDefault();

    // NOT NULL columns: never submit an empty (or invented) zone/format.
    const { timezone, currencyFormat } = formData;
    if (!timezone || (currencyFormat !== "latam" && currencyFormat !== "usa")) {
      toast.error(
        "La organización no tiene zona horaria o formato de moneda configurado.",
      );
      return;
    }
    if (!formData.countryCode) {
      toast.error("La organización no tiene país configurado.");
      return;
    }

    setIsUpdating(true);

    try {
      let finalLogoUrl = logoUrl;

      // 1. Upload new logo if exists
      if (logoFile) {
        finalLogoUrl = await uploadService.uploadFile(logoFile);
      }

      // 2. Update via the ORG-SCOPED endpoint. Panel NEVER calls
      //    `/api/platform/*`: a gym owner/manager has no platform role
      //    and would receive 403 (with form falsely appearing to save).
      //    Empty fields are sent as `null` to clear them; country is omitted
      //    as it is immutable post-creation (400 if sent).
      await orgProfileService.updateProfile({
        name: formData.name,
        slug: formData.slug.trim() || undefined,
        logo: finalLogoUrl ?? null,
        slogan: formData.slogan.trim() || null,
        timezone: formData.timezone,
        currencyFormat,
        legalName: formData.legalName.trim() || null,
        taxId: formData.taxId.trim() || null,
        address: formData.address.trim() || null,
      });

      toast.success("Información de la sede actualizada correctamente");
      setLogoFile(null);
      setLogoUrl(finalLogoUrl);

      // Refresh to sync layout/sidebar
      await refetch();
      router.refresh();

    } catch (error) {
      toast.error(
        mutationError("OrgSettings", error, "No se pudo guardar la información de la sede"),
      );
    } finally {
      setIsUpdating(false);
    }
  };
  
  /**
   * Saves the tenant-owned fiscal data (the disclaimer; the issuer identity is
   * owned by the general form). The fiscal regime (`isFormalTaxpayer`) and the
   * tax rates are NOT sent: both are platform/`COUNTRIES` owned, and the API
   * answers `403 FISCAL_CONFIG_PLATFORM_ONLY` if a tenant tries to write them.
   */
  const saveFiscal = async () => {
    if (!activeOrg || !canUpdateFiscal || isSavingFiscal) return;
    if (!activeOrg.countryCode) {
      toast.error("La organización no tiene país configurado.");
      return;
    }

    const disclaimerLines = fiscalDisclaimer
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setIsSavingFiscal(true);
    try {
      await orgProfileService.updateProfile({
        ...(disclaimerLines.length > 0
          ? { fiscalConfig: { disclaimerOverride: disclaimerLines } }
          : {}),
      });

      toast.success("Configuración fiscal guardada correctamente");
      await refetch();
      router.refresh();
    } catch (err) {
      toast.error(mutationError("OrgFiscalSection", err, "No se pudo guardar la configuración fiscal"));
    } finally {
      setIsSavingFiscal(false);
    }
  };

  // Helper to show current time in the organization's zone (required).
  const getTimeInZone = (zone: string) => {
    try {
      return new Intl.DateTimeFormat("es-VE", {
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date());
    } catch {
      // Invalid/stale IANA value: show an explicit empty state, never another zone.
      return "--:--";
    }
  };

  // Country labels come from `COUNTRIES` (SSOT); an unknown country renders an
  // explicit empty state, never another country's labels.
  const countryIdentity = getCountryIdentity(formData.countryCode);
  const taxIdValue = parseDocumentId(
    formData.taxId,
    countryIdentity?.docTypes ?? [],
  );

  const fiscalCountry = activeOrg?.countryCode ? COUNTRIES[activeOrg.countryCode] : undefined;
  const appliedDocumentLabel = resolveDocumentLabel({
    taxId: formData.taxId.trim() || activeOrg?.taxId,
    isFormalTaxpayer: fiscalFormal,
  });

  const renderFiscalContent = () => {
    if (fiscalError) {
      return <Text variant="muted" size="sm">{fiscalError}</Text>;
    }

    if (!fiscalCountry) {
      return <Text variant="muted" size="sm">La organización no tiene país configurado.</Text>;
    }

    const countryTaxes = fiscalProfile?.taxes ?? [];

    return (
      <div className="space-y-8 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FiscalFact
            label="Nombre de Registro / Legal"
            value={formData.legalName.trim() || "Sin definir"}
          />
          <FiscalFact
            label={`Nro. Registro (${fiscalCountry.taxLabel})`}
            value={formData.taxId.trim() || "Sin definir"}
          />
        </div>

        <FiscalFact
          label="Dirección fiscal"
          value={formData.address.trim() || "Sin definir"}
        />

        <Text size="xs" variant="muted" className="italic">
          Estos datos se editan en “Información de Registro” y se guardan con “Actualizar Sede”.
        </Text>

        <div className="bg-foreground/5 border border-border p-4 rounded-xl space-y-1">
          <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-tighter">Etiqueta aplicada del documento</Text>
          <Text size="lg" weight="bold">{appliedDocumentLabel}</Text>
          <Text size="xs" variant="muted" className="italic">
            Mientras no exista homologación fiscal conectada, el sistema aplica “Comprobante de pago”.
          </Text>
        </div>

        {/* Fiscal regime: READ-ONLY. It is a platform decision (Console), and
            `COUNTRIES` is the single source of truth for the tax rates. */}
        <div
          className="space-y-3 bg-foreground/5 border border-border p-4 rounded-xl"
          data-testid="fiscal-regime"
        >
          <div className="flex flex-col gap-1">
            <Text weight="bold" size="sm" className="uppercase tracking-wider">Régimen fiscal</Text>
            <Text size="sm" weight="bold" data-testid="fiscal-regime-value">
              {fiscalFormal ? "Contribuyente formal" : "No declarado"}
            </Text>
            <Text size="xs" variant="muted">
              {fiscalFormal
                ? "Se detallan los impuestos del país en cada comprobante."
                : "Tu comprobante no detalla impuestos: se registra únicamente el total pagado."}
            </Text>
            <Text size="xs" variant="muted" className="italic">
              Solo el equipo de Fit-Stack puede modificar esta condición desde la consola de plataforma.
            </Text>
          </div>

          <div className="space-y-2">
            <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-tighter">
              Impuestos del país
            </Text>
            {countryTaxes.length === 0 ? (
              <Text size="xs" variant="muted">Este país no define impuestos.</Text>
            ) : (
              countryTaxes.map((tax) => (
                <div
                  key={tax.name}
                  data-testid={`fiscal-tax-${tax.name}`}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0"
                >
                  <Text size="xs">
                    {tax.name} ({Number((tax.rate * 100).toFixed(4))}%)
                  </Text>
                  <Text size="xs" variant="muted" className="italic">
                    {tax.condition
                      ? "Condicional según la moneda de pago"
                      : tax.enabled
                        ? "Aplicable"
                        : "No aplicable"}
                  </Text>
                </div>
              ))
            )}
          </div>
        </div>

        <Textarea
          label="Disclaimer legal alternativo"
          placeholder={fiscalCountry.legalDisclaimer.join("\n")}
          value={fiscalDisclaimer}
          onChange={(e) => setFiscalDisclaimer(e.target.value)}
        />

        <Button
          type="button"
          loading={isSavingFiscal}
          disabled={isSavingFiscal}
          onClick={() => void saveFiscal()}
          className="w-full md:w-auto font-bold uppercase tracking-widest text-xs"
        >
          Guardar facturación
        </Button>
      </div>
    );
  };

  if (sessionLoading && !hasInitialized.current) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-64 bg-foreground/5 rounded-2xl" />
        <div className="h-96 bg-foreground/5 rounded-2xl" />
      </div>
    );
  }

  // Visible failure instead of a form rendered with invented config.
  if (configError || !activeOrg) {
    return (
      <div
        role="alert"
        data-testid="org-config-error"
        className="bg-foreground/5 border border-border rounded-xl p-6 space-y-2"
      >
        <Text weight="bold" size="lg">No se pudo cargar la configuración de la sede</Text>
        <Text size="sm" variant="muted">
          {configError ?? "No hay una organización activa en la sesión."}
        </Text>
      </div>
    );
  }

  // The effect fills the form from the session on the next tick.
  if (!hasInitialized.current) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-64 bg-foreground/5 rounded-2xl" />
        <div className="h-96 bg-foreground/5 rounded-2xl" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-12 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>Configuración de Sede</span>
          </div>
          <Title as="h3" size="card" className="tracking-tight">Detalles de la Organización</Title>
          <Text variant="muted">Gestiona la identidad institucional y comercial de tu sede.</Text>
        </div>
      </div>

      <div className="space-y-8 max-w-4xl">

        {/* IDENTIDAD COMERCIAL */}
        <Card variant="settings" className="relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Building2 className="w-32 h-32" />
          </div>

          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <Text size="lg" weight="bold">Identidad Institucional</Text>
              <Text variant="muted" size="sm">Define cómo se ve tu gimnasio ante el público.</Text>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">
            <div className="lg:col-span-8 space-y-6">
              <Input
                label="Nombre Comercial"
                placeholder="Elite Fitness Gym"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
              />

              <div className="space-y-2">
                <Input
                  label="Slug / Subdominio"
                  placeholder="elite-fitness"
                  value={formData.slug}
                  onChange={(e) => handleChange("slug", e.target.value)}
                  leftIcon={<Globe className="w-4 h-4" />}
                />
                <Text size="xs" variant="muted" className="pl-1 flex items-center gap-1.5 font-medium opacity-70 italic">
                  URL actual: <span className="text-primary lowercase">{formData.slug}.fit-stack.com</span>
                </Text>
              </div>

              <Textarea
                label="Eslogan / Lema"
                placeholder="Tu mejor versión comienza aquí"
                value={formData.slogan}
                onChange={(e) => handleChange("slogan", e.target.value)}
              />
            </div>

            <div className="lg:col-span-4 flex flex-col items-center">
              <div className="p-2 rounded-xl bg-foreground/5 border border-foreground/10 backdrop-blur-sm self-center lg:self-end">
                <ImageUpload
                  label="Logo Principal"
                  description="Formatos sugeridos: SVG, PNG."
                  fallbackIcon={<Building2 className="h-8 w-8" />}
                  value={uploadService.getMediaUrl(logoUrl)}
                  onChange={(file) => setLogoFile(file)}
                  onRemove={() => {
                    setLogoFile(null);
                    setLogoUrl("");
                  }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* IDENTIFICATION AND LOCATION DATA */}
        <Card variant="settings">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-foreground/5 text-foreground-dim border border-border/50">
              <Fingerprint className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <Text size="lg" weight="bold">Información de Registro</Text>
              <Text variant="muted" size="sm">Datos requeridos para identificación corporativa y reportes.</Text>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-0 items-start">
            <div className="space-y-6">
              {/* Country immutable post-creation: changing it would recalculate
                  primary currency (platform-level operation). Read-only here,
                  with explicit rationale. */}
              <div className="space-y-2">
                <CountrySelector
                  label="País de Operación"
                  value={formData.countryCode}
                  onChange={() => undefined}
                  countries={COUNTRY_LIST}
                  disabled
                />
                <Text size="xs" variant="muted" className="italic opacity-70">
                  Definido al crear la sede. Cambiarlo recalcula la moneda principal: solicítalo a soporte.
                </Text>
              </div>

              <Input
                label="Nombre de Registro / Legal"
                placeholder="Elite Fitness C.A."
                value={formData.legalName}
                onChange={(e) => handleChange("legalName", e.target.value)}
                leftIcon={<Building2 className="w-4 h-4" />}
              />
            </div>

            <div className="space-y-6">
              {/* No `required`: an issuer without tax registry is valid (issues
                  "Payment Receipt"). Marking mandatory blocked native submit
                  for the entire form. */}
              <div className="space-y-2">
                {countryIdentity ? (
                  <DocumentIdField
                    label={`Nro. Registro (${countryIdentity.taxLabel})`}
                    types={countryIdentity.docTypes}
                    defaultType={defaultTaxDocumentType(formData.countryCode)}
                    value={taxIdValue}
                    onChange={(next) =>
                      handleChange("taxId", formatDocumentId(next.type, next.number))
                    }
                    placeholder="12345678-9"
                    leftIcon={<ShieldCheck className="w-4 h-4" />}
                  />
                ) : (
                  <Text size="sm" variant="muted">
                    La organización no tiene país configurado.
                  </Text>
                )}
                <Text size="xs" variant="muted" className="italic opacity-70">
                  Opcional. Requerido junto al nombre legal y la dirección para activar el contribuyente formal.
                </Text>
              </div>

              <Input
                label="Dirección fiscal"
                placeholder="Av. Principal, Caracas"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                leftIcon={<Building2 className="w-4 h-4" />}
              />

              <div className="bg-foreground/5 border border-border p-4 rounded-xl flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-foreground/5 text-foreground-muted">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-tighter">Hora Local (Sincronizada)</Text>
                  <Text size="lg" weight="bold" className="tabular-nums">
                    {getTimeInZone(formData.timezone)}
                  </Text>
                </div>
              </div>

              <SimpleSelect
                label="Zona Horaria (Avanzado)"
                value={formData.timezone}
                onChange={(value) => handleChange("timezone", value)}
                options={COUNTRY_LIST.map(c => ({ value: c.timezone, label: `${c.name} (${c.timezone})` }))}
                leftIcon={<Clock size={16} />}
              />

              <div className="bg-foreground/5 border border-border p-4 rounded-xl flex items-center gap-4">
                <div className="flex flex-col">
                  <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-tighter">Moneda Principal</Text>
                  <Text size="lg" weight="bold" className="tabular-nums">
                    {activeOrg?.primaryCurrency ?? ""}
                  </Text>
                  <Text size="xs" variant="muted" className="italic">Derivada del país. No editable.</Text>
                </div>
              </div>

              <SimpleSelect
                label="Formato de Moneda"
                value={formData.currencyFormat}
                onChange={(value) => handleChange("currencyFormat", value)}
                options={[
                  { value: "latam", label: "LATAM / EU (1.250,50)" },
                  { value: "usa", label: "USA / UK (1,250.50)" },
                ]}
                leftIcon={<Clock size={16} />}
              />
            </div>
          </div>
        </Card>

        {/* BILLING */}
        {canUpdateFiscal && (
          <Card variant="settings" data-testid="org-fiscal-section">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-foreground/5 text-foreground-dim border border-border/50">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <Text size="lg" weight="bold">Facturación</Text>
                <Text variant="muted" size="sm">Identidad emisora de los comprobantes. Esto no emite facturas fiscales.</Text>
              </div>
            </div>

            {renderFiscalContent()}
          </Card>
        )}

        {/* ACCIONES FINALES */}
        <Card variant="settings" className="justify-between relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <Text weight="bold" size="lg" className="tracking-tight">¿Guardar cambios institucionales?</Text>
            <Text variant="muted" size="sm" className="leading-relaxed">
              Estos cambios afectarán la marca y facturación de la sede inmediatamente.
            </Text>
          </div>

          <div className="flex flex-col-reverse md:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              className="w-full md:w-auto font-bold uppercase tracking-widest text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isUpdating}
              disabled={isUpdating}
              leftIcon={<Save className="w-4 h-4" />}
              className="w-full md:w-auto md:px-8 h-14 md:h-12 text-sm font-bold uppercase tracking-[0.1em] shadow-primary/10 shadow-lg"
            >
              Actualizar Sede
            </Button>
          </div>
        </Card>

      </div>
    </form>
  );
}
