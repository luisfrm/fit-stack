"use client";

import * as React from "react";
import {
  Building2,
  Palette,
  Save,
  RotateCcw,
  Clock,
  Globe,
  ChevronRight,
  Moon,
  Sun
} from "lucide-react";
import {
  Card,
  Text,
  Input,
  Button,
  ColorPicker,
  Title,
  toast,
  SimpleSelect,
  Switch,
  Label,
  cn,
  CountrySelector
} from "@workspace/ui/components";
import { ColorUtils } from "@workspace/ui/lib/color-utils";
import { SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";
import { COUNTRY_LIST, COUNTRIES } from "@workspace/shared/constants";
import Link from "next/link";

const DEFAULT_BRANDING = {
  primary: "#FCD303",
};


interface OrganizationSettingsFormProps {
  readonly initialData: Record<string, string>;
  readonly onSave: (data: Record<string, string>) => Promise<void>;
  readonly isLoading?: boolean;
  readonly isUpdating?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly backUrl?: string;
}

export function OrganizationSettingsForm({
  initialData,
  onSave,
  isLoading,
  isUpdating,
  title = "Ajustes de Organización",
  description = "Configura la identidad y parámetros técnicos de la sede.",
  backUrl = "/dashboard"
}: OrganizationSettingsFormProps) {
  const [formData, setFormData] = React.useState<Record<string, string>>({});
  const hasInitialized = React.useRef(false);

  // Derive country code from timezone if possible, or fallback to VE
  const currentCountryCode = React.useMemo(() => {
    const tz = formData[SETTINGS_KEYS.TIMEZONE] || DEFAULT_TIMEZONE;
    const country = COUNTRY_LIST.find(c => c.timezone === tz);
    return country?.code || "VE";
  }, [formData]);

  // Sync state with initial data - only once
  React.useEffect(() => {
    if (!hasInitialized.current && Object.keys(initialData).length > 0) {
      setFormData(initialData);
      hasInitialized.current = true;
    }
  }, [initialData]);

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleCountryChange = (code: string) => {
    const config = COUNTRIES[code];
    if (config) {
      handleChange(SETTINGS_KEYS.TIMEZONE, config.timezone);
    }
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const dataToSave = { ...formData };

      // Ensure primary color is in OKLCH format before saving to DB
      const primaryColor = dataToSave[SETTINGS_KEYS.BRAND_PRIMARY];
      if (primaryColor) {
        dataToSave[SETTINGS_KEYS.BRAND_PRIMARY] = ColorUtils.toOklch(primaryColor);
      }

      await onSave(dataToSave);
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.message || "Error general al guardar");
    }
  };

  const handleReset = () => {
    setFormData((prev) => ({
      ...prev,
      [SETTINGS_KEYS.BRAND_PRIMARY]: DEFAULT_BRANDING.primary,
    }));
    toast.info("Valores de marca restaurados");
  };

  const currentPrimary = formData[SETTINGS_KEYS.BRAND_PRIMARY] || DEFAULT_BRANDING.primary;

  // Calculate derivatives ONLY for preview
  const previewHover = ColorUtils.getHoverColor(currentPrimary);
  const previewPrimaryFg = ColorUtils.getContrastForeground(currentPrimary);

  // Helper to show current time in a zone
  const getTimeInZone = (zone?: string) => {
    try {
      const targetZone = zone || DEFAULT_TIMEZONE;
      return new Intl.DateTimeFormat("es-VE", {
        timeStyle: "short",
        timeZone: targetZone,
      }).format(new Date());
    } catch {
      return "--:--";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
        <div className="h-96 bg-white/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-12 pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 sm:px-0">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">{title}</Title>
          <Text variant="muted">{description}</Text>
        </div>
      </div>

      <div className="space-y-8 max-w-3xl">

        {/* INFORMACIÓN DEL GIMNASIO */}
        <Card variant="settings" className="relative z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <Text size="lg" weight="bold">Configuración de Marca</Text>
                <Text variant="muted" size="sm">Configura los mensajes y lemas que definen a tu sede.</Text>
              </div>
            </div>

            <Button variant="ghost" size="sm" asChild className="group">
              <Link href={`${backUrl}/settings/organization`} className="flex items-center gap-2">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold uppercase tracking-tighter">Editar Identidad Legal</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-8">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-1 mt-1">
                  <Text size="sm" weight="bold">Identidad Corporativa</Text>
                  <Text variant="muted" size="xs">Nombre, logo y dirección gestionados en Organización.</Text>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* CONFIGURACIÓN REGIONAL */}
        <Card variant="settings" className="relative z-40">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
              <Globe className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <Text size="lg" weight="bold">Configuración Regional</Text>
              <Text variant="muted" size="sm">Define el país y zona horaria para agendas y recibos.</Text>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
            <CountrySelector
              label="Región / País"
              value={currentCountryCode}
              onChange={handleCountryChange}
              countries={COUNTRY_LIST}
            />

            <div className="bg-foreground/5 border border-border p-4 rounded-xl flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-foreground/5 text-foreground-muted">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-tighter">Hora Local (Sincronizada)</Text>
                <Text size="lg" weight="bold" className="tabular-nums">
                  {getTimeInZone(formData[SETTINGS_KEYS.TIMEZONE] || DEFAULT_TIMEZONE)}
                </Text>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <SimpleSelect
              label="Zona Horaria (Avanzado)"
              value={formData[SETTINGS_KEYS.TIMEZONE] || DEFAULT_TIMEZONE}
              onChange={(value) => handleChange(SETTINGS_KEYS.TIMEZONE, value)}
              options={COUNTRY_LIST.map(c => ({ value: c.timezone, label: `${c.name} (${c.timezone})` }))}
            />
          </div>
        </Card>

        {/* PREFERENCIA DE APARIENCIA */}
        <Card variant="settings" className="relative z-30">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
              {formData[SETTINGS_KEYS.THEME_MODE] === "light" ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </div>
            <div className="flex flex-col">
              <Text size="lg" weight="bold">Preferencia de Apariencia</Text>
              <Text variant="muted" size="sm">Elige el ambiente visual que mejor se adapte a tu sede.</Text>
            </div>
          </div>

          <div className="flex items-center justify-between p-6 rounded-xl border border-border bg-foreground/3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Modo Visual
              </Label>
              <Text variant="muted" size="xs">
                {formData[SETTINGS_KEYS.THEME_MODE] === "light"
                  ? "Tema claro activo para una mejor visibilidad diurna."
                  : "Tema oscuro activo (predeterminado de la sede)."}
              </Text>
            </div>

            <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-foreground/10 border border-border">
              <Moon
                className={cn(
                  "size-5 transition-all duration-300",
                  formData[SETTINGS_KEYS.THEME_MODE] === "light" ? "text-foreground/20 scale-90" : "text-primary fill-primary/20 scale-110"
                )}
              />
              <Switch
                checked={formData[SETTINGS_KEYS.THEME_MODE] === "light"}
                onCheckedChange={(checked) => handleChange(SETTINGS_KEYS.THEME_MODE, checked ? "light" : "dark")}
                className="data-[state=checked]:bg-yellow-500 data-[state=unchecked]:bg-primary scale-125"
              />
              <Sun
                className={cn(
                  "size-5 transition-all duration-300",
                  formData[SETTINGS_KEYS.THEME_MODE] === "light" ? "text-yellow-500 fill-yellow-500/20 scale-110" : "text-foreground/20 scale-90"
                )}
              />
            </div>
          </div>
        </Card>

        {/* COLOR DE MARCA */}
        <Card variant="settings" className="relative z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary/40">
                <Palette className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <Text size="lg" weight="bold">Color de Marca</Text>
                <Text variant="muted" size="sm">Define el tono primario que resaltará en toda la plataforma.</Text>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Restaurar Base
            </Button>
          </div>

          <div className="max-w-xs">
            <ColorPicker
              label="Tono Primario"
              value={currentPrimary}
              onChange={(val) => handleChange(SETTINGS_KEYS.BRAND_PRIMARY, val)}
            />
          </div>

          <div className="flex flex-col gap-4 mt-4">
            <div className="flex items-center justify-between px-2">
              <Text size="xs" weight="bold" className="uppercase tracking-widest opacity-50">Previsualización de Marca</Text>
            </div>

            <div
              className="rounded-2xl border p-10 flex flex-col gap-8 transition-all duration-700 border-input-border relative"
              style={{
                color: "#ffffff",
                borderColor: `${currentPrimary}20`,
                // @ts-ignore
                "--p": currentPrimary,
                "--ph": previewHover,
                "--pf": previewPrimaryFg
              } as React.CSSProperties}
            >
              <div className="space-y-2">
                <Text size="lg" weight="bold" className="tracking-tight" style={{ color: currentPrimary }}>Título de la Sección</Text>
                <Text size="sm" className="opacity-70 leading-relaxed max-w-md">
                  Este es un ejemplo de cómo verás el contraste de tu color sobre el fondo oscuro profesional del sistema.
                </Text>
              </div>

              <div className="max-w-xs">
                <Input
                  label="Campo de Ejemplo"
                  placeholder="Escribe algo aquí..."
                  readOnly
                />
              </div>

              <div className="flex items-center gap-4 mt-4">
                <Button
                  type="button"
                  className="bg-(--p)! text-(--pf)! hover:bg-(--ph)! transition-all h-12 px-10 font-bold"
                >
                  Botón de Acción
                </Button>

                <div className="flex flex-col">
                  <Text size="xs" weight="bold" style={{ color: currentPrimary }}>Interacción Automática</Text>
                  <Text size="xs" className="opacity-40 italic">Hover calculado matemáticamente</Text>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ACCIONES FINALES */}
        <Card variant="settings" className="justify-between relative z-10">
          <div className="flex flex-col gap-1">
            <Text weight="bold" size="lg">¿Deseas aplicar estos cambios?</Text>
            <Text variant="muted" size="sm">
              La identidad visual se actualizará para todos los usuarios de la sede inmediatamente.
            </Text>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <Button
              type="button"
              variant="ghost"
              asChild
              className="flex-1 md:flex-none"
            >
              <Link href={backUrl}>Cancelar</Link>
            </Button>
            <Button
              type="submit"
              loading={isUpdating}
              disabled={isUpdating}
              leftIcon={<Save className="w-4 h-4" />}
              className="flex-1 md:flex-none px-12 h-12"
            >
              Guardar Ajustes
            </Button>
          </div>
        </Card>

      </div>
    </form>
  );
}
