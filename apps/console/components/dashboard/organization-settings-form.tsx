"use client";

import * as React from "react";
import {
  Building2,
  Palette,
  Save,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  Text,
  Input,
  Button,
  ColorPicker,
  Title,
  toast,
} from "@workspace/ui/components";
import { ColorUtils } from "@workspace/ui/lib/color-utils";
import { SETTINGS_KEYS } from "@/lib/hooks/use-settings";
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

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
        <div className="h-96 bg-white/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-12 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">{title}</Title>
          <Text variant="muted">{description}</Text>
        </div>
      </div>

      <div className="space-y-8 max-w-4xl">

        {/* INFORMACIÓN DEL GIMNASIO */}
        <Card variant="settings" className="relative z-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <Text size="lg" weight="bold">Configuración de Marca</Text>
                <Text variant="muted" size="sm" className="leading-tight">Configura los mensajes y lemas que definen a tu sede.</Text>
              </div>
            </div>

            <Button variant="outlined" size="sm" asChild className="w-full sm:w-auto h-10 border-primary/20 hover:bg-primary/5 group">
              <Link href={`${backUrl}/settings/organization`} className="flex items-center justify-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary sm:text-foreground/60 sm:group-hover:text-primary transition-colors">
                  Editar Identidad Legal
                </span>
                <ChevronRight className="w-4 h-4 text-primary" />
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

        {/* COLOR DE MARCA */}
        <Card variant="settings" className="relative z-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              className="w-fit"
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
              className="rounded-2xl border p-6 sm:p-10 flex flex-col gap-8 transition-all duration-700 border-input-border relative"
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

              <div className="flex flex-col sm:flex-row sm:items-center gap-6 mt-4">
                <Button
                  type="button"
                  className="bg-(--p)! text-(--pf)! hover:bg-(--ph)! transition-all h-12 px-10 font-bold w-full sm:w-fit"
                >
                  Botón de Acción
                </Button>

                <div className="flex flex-col">
                  <Text size="xs" weight="bold" style={{ color: currentPrimary }} className="uppercase tracking-widest">Interacción Automática</Text>
                  <Text size="xs" className="opacity-40 italic">Hover calculado matemáticamente</Text>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ACCIONES FINALES */}
        <Card variant="settings" className="justify-between relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <Text weight="bold" size="lg" className="tracking-tight">¿Deseas aplicar estos cambios?</Text>
            <Text variant="muted" size="sm" className="leading-relaxed">
              La identidad visual se actualizará para todos los usuarios de la sede inmediatamente.
            </Text>
          </div>

          <div className="flex flex-col-reverse md:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              type="button"
              variant="ghost"
              asChild
              className="w-full md:w-auto font-bold uppercase tracking-widest text-xs"
            >
              <Link href={backUrl}>Cancelar</Link>
            </Button>
            <Button
              type="submit"
              loading={isUpdating}
              disabled={isUpdating}
              leftIcon={<Save className="w-4 h-4" />}
              className="w-full md:w-auto md:px-8 h-14 md:h-12 text-sm font-bold uppercase tracking-[0.1em]"
            >
              Guardar Ajustes
            </Button>
          </div>
        </Card>

      </div>
    </form>
  );
}