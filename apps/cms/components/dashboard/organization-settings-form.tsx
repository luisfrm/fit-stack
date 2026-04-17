"use client";

import * as React from "react";
import {
  Building2,
  Palette,
  Save,
  RotateCcw,
  Clock,
  Globe,
  ChevronRight
} from "lucide-react";
import {
  Card,
  Text,
  Input,
  Button,
  ColorPicker,
  Title,
  toast
} from "@workspace/ui/components";
import { ColorUtils } from "@workspace/ui/lib/color-utils";
import { SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { DEFAULT_TIMEZONE } from "@/lib/config/display";
import Link from "next/link";

const DEFAULT_BRANDING = {
  primary: "#FCD303",
};

// Common timezones for selection
const TIMEZONES = [
  { value: "America/Caracas", label: "Caracas (Venezuela)" },
  { value: "America/Bogota", label: "Bogotá (Colombia)" },
  { value: "America/Mexico_City", label: "Ciudad de México (México)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (Argentina)" },
  { value: "America/Santiago", label: "Santiago (Chile)" },
  { value: "America/Lima", label: "Lima (Perú)" },
  { value: "America/New_York", label: "Nueva York (USA)" },
  { value: "America/Los_Angeles", label: "Los Ángeles (USA)" },
  { value: "Europe/Madrid", label: "Madrid (España)" },
  { value: "Europe/London", label: "Londres (UK)" },
  { value: "UTC", label: "UTC (Universal)" },
];

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

  const handleReset = () => {
    setFormData((prev) => ({
      ...prev,
      [SETTINGS_KEYS.BRAND_PRIMARY]: DEFAULT_BRANDING.primary,
    }));
    toast.info("Valores de marca restaurados");
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

  const currentPrimary = formData[SETTINGS_KEYS.BRAND_PRIMARY] || DEFAULT_BRANDING.primary;

  // Calculate derivates ONLY for preview
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
        <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl gap-8! flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <Text size="lg" weight="bold">Información de Marca</Text>
                <Text variant="muted" size="sm">Configura los mensajes y lemas que definen a tu sede.</Text>
              </div>
            </div>

            <Button variant="ghost" size="sm" asChild className="group">
              <Link href={`${backUrl}/settings/organization`} className="flex items-center gap-2">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold uppercase tracking-tighter">Editar Identidad</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-8">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-1 mt-1">
                  <Text size="sm" weight="bold">Marca Institucional</Text>
                  <Text variant="muted" size="xs">Nombre, logo y eslogan gestionados en Organización.</Text>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* CONFIGURACIÓN REGIONAL */}
        <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl gap-8! flex flex-col">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
              <Globe className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <Text size="lg" weight="bold">Configuración Regional</Text>
              <Text variant="muted" size="sm">Define la zona horaria para agendas y reservas inteligentes.</Text>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
            <div className="space-y-2">
              <Text size="xs" weight="bold" className="uppercase tracking-widest opacity-50 ml-1">Zona Horaria (IANA)</Text>
              <select
                value={formData[SETTINGS_KEYS.TIMEZONE] || DEFAULT_TIMEZONE}
                onChange={(e) => handleChange(SETTINGS_KEYS.TIMEZONE, e.target.value)}
                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value} className="bg-zinc-900 text-white">
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-white/5 text-white/40">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-tighter">Hora Local Actual</Text>
                <Text size="lg" weight="bold" className="tabular-nums">
                  {getTimeInZone(formData[SETTINGS_KEYS.TIMEZONE] || DEFAULT_TIMEZONE)}
                </Text>
              </div>
            </div>
          </div>
        </Card>

        {/* COLOR DE MARCA */}
        <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl gap-8! flex flex-col">
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
              className="rounded-2xl border p-10 flex flex-col gap-8 transition-all duration-700 shadow-xl relative bg-zinc-950"
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
        <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl flex flex-col justify-between gap-6">
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
              className="flex-1 md:flex-none px-12"
            >
              Guardar Ajustes
            </Button>
          </div>
        </Card>

      </div>
    </form>
  );
}
