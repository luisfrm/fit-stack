"use client";

import * as React from "react";
import { Sparkles, Building2, FileImage, AlertCircle, Info } from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { ImageUpload } from "@workspace/ui/components/image-upload";
import { NextImage } from "@workspace/ui/components/next/image";
import { Logotipo } from "@workspace/ui/components/logotipo";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { uploadService } from "@/lib/services/upload-service";
import { api } from "@/lib/api/client";
import { Title, toast } from "@workspace/ui";

interface PlatformGeneralSettingsProps {
  readonly initialSettings: Record<string, string>;
  readonly onSaved?: () => void | Promise<void>;
}

const MAX_NAME_LENGTH = 40;
const DEFAULT_NAME = "Fit Stack Console";

export function PlatformGeneralSettings({
  initialSettings,
  onSaved,
}: PlatformGeneralSettingsProps) {
  const [platformName, setPlatformName] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.PLATFORM_NAME] || "",
  );
  const [logoKey, setLogoKey] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.PLATFORM_LOGO] || "",
  );
  const [pendingLogo, setPendingLogo] = React.useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = React.useState<string>(
    () => uploadService.getMediaUrl(initialSettings[PLATFORM_SETTINGS_KEYS.PLATFORM_LOGO]),
  );
  const [isUpdating, setIsUpdating] = React.useState(false);

  React.useEffect(() => {
    if (!pendingLogo) {
      setLogoPreviewUrl(uploadService.getMediaUrl(logoKey));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setLogoPreviewUrl(reader.result as string);
    reader.readAsDataURL(pendingLogo);
  }, [pendingLogo, logoKey]);

  const handleLogoChange = (file: File | null) => {
    setPendingLogo(file);
  };

  const handleLogoRemove = () => {
    setPendingLogo(null);
    setLogoKey("");
  };

  const handleSave = async () => {
    const trimmedName = platformName.trim();
    if (!trimmedName) {
      toast.error("El nombre de la plataforma es obligatorio");
      return;
    }

    setIsUpdating(true);
    let nextLogoKey = logoKey;

    try {
      if (pendingLogo) {
        nextLogoKey = await uploadService.uploadPlatformFile(
          pendingLogo,
          "logo",
          "branding",
        );
      }

      // Best-effort cleanup of the previous asset (platform admins can delete
      // platform-scoped files; failure here must not block the save).
      const previousKey = initialSettings[PLATFORM_SETTINGS_KEYS.PLATFORM_LOGO];
      if (previousKey && previousKey !== nextLogoKey) {
        uploadService.deletePlatformFile(previousKey).catch(() => {});
      }

      await api("/platform/settings", {
        method: "POST",
        body: {
          [PLATFORM_SETTINGS_KEYS.PLATFORM_NAME]: trimmedName,
          [PLATFORM_SETTINGS_KEYS.PLATFORM_LOGO]: nextLogoKey,
        },
      });

      setLogoKey(nextLogoKey);
      setPendingLogo(null);
      toast.success("Identidad de marca actualizada correctamente");
      await onSaved?.();
    } catch (error) {
      console.error("Error saving platform branding:", error);
      toast.error("Error al guardar la identidad de marca");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">General</Title>
          <Text variant="muted">
            Define la identidad visual de la plataforma: nombre y logo que se muestran
            en la barra lateral y en los futuros puntos de marca del ecosistema.
          </Text>
        </div>
      </div>

      <div className="space-y-8 max-w-4xl">
        <Card variant="settings">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <Text className="font-bold">Identidad de Marca</Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">Nombre y logo de la plataforma</Text>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-4">
              <div className="flex items-center gap-2">
                <FileImage className="w-4 h-4 text-primary" />
                <Text className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Logo de la Plataforma</Text>
              </div>
              <ImageUpload
                value={logoPreviewUrl}
                onChange={handleLogoChange}
                onRemove={handleLogoRemove}
                disabled={isUpdating}
                label=""
                description="PNG o SVG con fondo transparente recomendado. Se muestra en la barra lateral de la consola."
                fallbackIcon={<Building2 className="w-6 h-6 text-foreground/40" />}
              />
            </div>

            <div className="p-4 bg-white/1 border border-white/5 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <Text className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Nombre de la Plataforma</Text>
              </div>
              <div className="relative">
                <Input
                  placeholder={DEFAULT_NAME}
                  maxLength={MAX_NAME_LENGTH}
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="px-4 pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-foreground/30">
                  {platformName.length}/{MAX_NAME_LENGTH}
                </span>
              </div>
              <div className="flex gap-2">
                <Info className="w-3.5 h-3.5 text-white/20 shrink-0" />
                <Text className="text-[9px] text-white/40 leading-relaxed italic">
                  Si se deja vacío, se usa &quot;{DEFAULT_NAME}&quot; como nombre por defecto.
                </Text>
              </div>
            </div>
          </div>
        </Card>

        {/* VISTA PREVIA */}
        <Card variant="settings">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <Text className="font-bold">Vista Previa</Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">Así se verá en la barra lateral</Text>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-background p-6">
            <div className="flex items-center gap-3">
              {logoPreviewUrl ? (
                <NextImage src={logoPreviewUrl} alt="Logo de la plataforma" width={40} height={40} className="object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border overflow-hidden shadow-lg shadow-primary/5 bg-primary/10 border-primary/20">
                  <div className="text-primary w-5 h-5">
                    <Building2 className="w-full h-full" />
                  </div>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <Logotipo />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
            <Text className="text-[9px] text-white/40 leading-relaxed italic">
              El logo se aplica al instante en la consola tras guardar. El nombre queda disponible
              para los futuros puntos de marca del ecosistema (footers, emails, etc.).
            </Text>
          </div>
        </Card>

        {/* ACCIONES FINALES */}
        <Card variant="settings" className="justify-between relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <Text weight="bold" size="lg" className="tracking-tight">¿Deseas aplicar estos cambios?</Text>
            <Text variant="muted" size="sm" className="leading-relaxed">
              La identidad de marca será la configuración global de la plataforma.
            </Text>
          </div>

          <div className="flex flex-col-reverse md:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              onClick={handleSave}
              loading={isUpdating}
              className="w-full md:w-auto md:px-8 h-14 md:h-12 text-sm font-bold uppercase tracking-[0.1em]"
            >
              Guardar Cambios de Marca
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}