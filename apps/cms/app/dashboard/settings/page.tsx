"use client";

import * as React from "react";
import {
  Building2,
  Palette,
  Save,
  RotateCcw,
  Clock,
  Globe
} from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { ColorPicker } from "@workspace/ui/components/color-picker";
import { ImageUpload } from "@workspace/ui/components/image-upload";
import { ColorUtils } from "@workspace/ui/lib/color-utils";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { uploadFile } from "@/lib/utils/upload-utils";
import { getMediaUrl } from "@/lib/utils/media-utils";
import { Title, toast } from "@workspace/ui";

const DEFAULT_BRANDING = {
  primary: "#FCD303",
};

import { DEFAULT_TIMEZONE } from "@/lib/config/display";

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

export default function GeneralSettingsPage() {
  const { settings, isLoading, isUpdating, updateSettings } = useSettings();
  const [formData, setFormData] = React.useState<Record<string, string>>({});
  const [logoFile, setLogoFile] = React.useState<File | null>(null);

  // Sync state with settings hook
  React.useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      setFormData(settings);
    }
  }, [settings]);

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

  const handleSave = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const dataToSave = { ...formData };

      // 1. Upload logo if changed
      if (logoFile) {
        const logoKey = await uploadFile(logoFile, "gym");
        dataToSave[SETTINGS_KEYS.GYM_LOGO] = logoKey;
      }

      // 2. Ensure primary color is in OKLCH format before saving to DB
      const primaryColor = dataToSave[SETTINGS_KEYS.BRAND_PRIMARY];
      if (primaryColor) {
        dataToSave[SETTINGS_KEYS.BRAND_PRIMARY] = ColorUtils.toOklch(primaryColor);
      }

      // 3. Save all settings
      await updateSettings(dataToSave);
      setLogoFile(null); // Clear pending file
    } catch (error) {
      console.error("Error saving settings:", error);
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
      <div className="space-y-6">
        <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
        <div className="h-96 bg-white/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-12 pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 sm:px-0">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">Ajustes Generales</Title>
          <Text variant="muted">Configura la identidad y parámetros regionales de Elite Fitness.</Text>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* IDENTIDAD VISUAL */}
        <div className="xl:col-span-2 space-y-8">
          <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl gap-8! flex flex-col">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <Text size="lg" weight="bold">Información del Gimnasio</Text>
                <Text variant="muted" size="sm">Identifica tu sede ante los miembros y el equipo.</Text>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <Input
                  label="Nombre Comercial"
                  placeholder="Elite Fitness Gym"
                  value={formData[SETTINGS_KEYS.GYM_NAME] || ""}
                  onChange={(e) => handleChange(SETTINGS_KEYS.GYM_NAME, e.target.value)}
                />
                <Textarea
                  label="Eslogan / Lema"
                  placeholder="Tu mejor versión comienza aquí"
                  value={formData[SETTINGS_KEYS.GYM_SLOGAN] || ""}
                  onChange={(e) => handleChange(SETTINGS_KEYS.GYM_SLOGAN, e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-center md:justify-end">
                <ImageUpload
                  label="Logo del Gimnasio"
                  description="Se recomienda usar formatos SVG o PNG con transparencia."
                  value={getMediaUrl(formData[SETTINGS_KEYS.GYM_LOGO])}
                  onChange={(file) => setLogoFile(file)}
                  onRemove={() => {
                    setLogoFile(null);
                    handleChange(SETTINGS_KEYS.GYM_LOGO, "");
                  }}
                />
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
                <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400">
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
                {/* Título y Texto */}
                <div className="space-y-2">
                  <Text size="lg" weight="bold" className="tracking-tight" style={{ color: currentPrimary }}>Título de la Sección</Text>
                  <Text size="sm" className="opacity-70 leading-relaxed max-w-md">
                    Este es un ejemplo de cómo verás el contraste de tu color sobre el fondo oscuro profesional del sistema.
                  </Text>
                </div>

                {/* Input y Label */}
                <div className="max-w-xs space-y-2">
                  <Text size="xs" weight="bold" className="uppercase tracking-widest opacity-50">Campo de Ejemplo</Text>
                  <div className="relative">
                    <div className="h-12 w-full bg-white/5 border border-white/10 rounded-xl px-4 flex items-center text-white/30 text-sm">
                      Escribe algo aquí...
                    </div>
                  </div>
                </div>

                {/* Botón con Hover Real */}
                <div className="flex items-center gap-4 mt-4">
                  <Button
                    type="button"
                    className="bg-(--p)! text-(--pf)! hover:bg-(--ph)! transition-all h-12 px-10 rounded-xl font-bold shadow-lg shadow-(--p)/10"
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
        </div>

        {/* COLUMNA DERECHA / ACCIONES */}
        <div className="space-y-8">
          <Card className="p-6! bg-white/5 border-white/10 rounded-2xl flex flex-col gap-6 sticky top-24">
            <div className="flex flex-col gap-2">
              <Text weight="bold">Guardar Cambios</Text>
              <Text variant="muted" size="xs">
                Recuerda que los cambios en la identidad visual se aplicarán a todos los usuarios inmediatamente.
              </Text>
            </div>

            <div className="space-y-3">
              <Button
                type="submit"
                fullWidth
                loading={isUpdating}
                disabled={isUpdating}
                leftIcon={<Save className="w-4 h-4" />}
                size="xs"
              >
                Actualizar Ajustes
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                asChild
                size="xs"
              >
                <a href="/dashboard">Cancelar y Volver</a>
              </Button>
            </div>
          </Card>
        </div>

      </div>
    </form>
  );
}
