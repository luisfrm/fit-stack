"use client";

import * as React from "react";
import {
  Building2,
  Globe,
  ShieldCheck,
  Fingerprint,
  MapPin,
  Save,
} from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { ImageUpload } from "@workspace/ui/components/image-upload";
import { Textarea } from "@workspace/ui/components/textarea";
import { CountrySelector, toast, Title } from "@workspace/ui";
import { useAuth } from "@/lib/hooks/use-auth";
import { authClient } from "@/lib/auth-client";
import { uploadService } from "@/lib/services/upload-service";
import { LATAM_COUNTRIES } from "@workspace/shared/constants";
import { useRouter } from "next/navigation";

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const { isPending: sessionLoading, activeOrganization: activeOrg, refetch } = useAuth();

  const [formData, setFormData] = React.useState({
    name: "",
    slug: "",
    slogan: "",
    legalName: "",
    taxId: "",
    address: "",
    countryCode: "VE",
  });

  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const hasInitialized = React.useRef(false);

  // Sync with active organization data
  React.useEffect(() => {
    const org = activeOrg as any;
    if (org && !hasInitialized.current) {
      setFormData({
        name: org.name || "",
        slug: org.slug || "",
        slogan: org.slogan || "",
        legalName: org.legalName || "",
        taxId: org.taxId || "",
        address: org.address || "",
        countryCode: org.countryCode || "VE",
      });
      setLogoUrl(org.logo || null);
      hasInitialized.current = true;
    }
  }, [activeOrg]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setIsUpdating(true);

    try {
      let finalLogoUrl = logoUrl;

      // 1. Upload new logo if exists
      if (logoFile) {
        finalLogoUrl = await uploadService.uploadFile(logoFile);
      }

      // 2. Update organization via Better Auth
      const { error } = await authClient.organization.update({
        data: {
          name: formData.name,
          slug: formData.slug || undefined,
          logo: finalLogoUrl ?? undefined,
          metadata: {
            // Reserved for future use
            ...activeOrg?.metadata
          },
          // @ts-ignore - Better Auth might need these to be in metadata or root depending on schema config, 
          // but our database schema has them as root columns. Better Auth organization.update 
          // usually picks up schema columns if configured correctly.
          countryCode: formData.countryCode,
          taxId: formData.taxId,
          legalName: formData.legalName,
          address: formData.address,
          slogan: formData.slogan || undefined,
        }
      });

      if (error) throw new Error(error.message || "Error al actualizar la organización");

      toast.success("Información de la sede actualizada correctamente");
      setLogoFile(null);
      setLogoUrl(finalLogoUrl);

      // Refresh to sync layout/sidebar
      await refetch();
      router.refresh();

    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "No se pudo guardar la información");
    } finally {
      setIsUpdating(false);
    }
  };

  if (sessionLoading && !hasInitialized.current) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-64 bg-white/5 rounded-2xl" />
        <div className="h-96 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-12 pb-20 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 sm:px-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>Configuración de Sede</span>
          </div>
          <Title as="h3" size="card" className="tracking-tight">Detalles de la Organización</Title>
          <Text variant="muted">Gestiona la identidad legal y comercial de tu sede.</Text>
        </div>
      </div>

      <div className="space-y-8 max-w-4xl">

        {/* IDENTIDAD COMERCIAL */}
        <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl gap-8! flex flex-col relative overflow-hidden">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative z-10">
            <div className="md:col-span-2 space-y-6">
              <Input
                label="Nombre Comercial"
                placeholder="Elite Fitness Gym"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
                className="bg-white/5! border-white/10!"
              />

              <div className="space-y-2">
                <Input
                  label="Slug / Subdominio"
                  placeholder="elite-fitness"
                  value={formData.slug}
                  onChange={(e) => handleChange("slug", e.target.value)}
                  leftIcon={<Globe className="w-4 h-4" />}
                  className="bg-white/5! border-white/10!"
                />
                <Text size="xs" variant="muted" className="pl-1 flex items-center gap-1.5 font-medium opacity-60">
                  URL actual: <span className="text-primary/80 lowercase">{formData.slug}.fit-stack.com</span>
                </Text>
              </div>

              <Textarea
                label="Eslogan / Lema"
                placeholder="Tu mejor versión comienza aquí"
                value={formData.slogan}
                onChange={(e) => handleChange("slogan", e.target.value)}
                className="min-h-[100px] bg-white/5! border-white/10!"
              />
            </div>

            <div className="flex flex-col items-center justify-center bg-white/5 rounded-2xl p-6 border border-white/5 hover:border-white/10 transition-colors">
              <ImageUpload
                label="Logo Principal"
                description="Formatos sugeridos: SVG, PNG."
                value={uploadService.getMediaUrl(logoUrl || "")}
                onChange={(file) => setLogoFile(file)}
                onRemove={() => {
                  setLogoFile(null);
                  setLogoUrl("");
                }}
              />
            </div>
          </div>
        </Card>

        {/* DATOS FISCALES Y LOCALIZACIÓN */}
        <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl gap-8! flex flex-col">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
              <Fingerprint className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <Text size="lg" weight="bold">Información Legal y Fiscal</Text>
              <Text variant="muted" size="sm">Datos requeridos para facturación y reportes oficiales.</Text>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            <div className="space-y-6">
              <div className="space-y-2">
                <Text size="xs" weight="bold" className="uppercase tracking-widest opacity-50 ml-1">País de Operación</Text>
                <CountrySelector
                  value={formData.countryCode}
                  onChange={(code) => handleChange("countryCode", code)}
                  countries={LATAM_COUNTRIES}
                />
              </div>

              <Input
                label="Razón Social / Nombre Legal"
                placeholder="Elite Fitness C.A."
                value={formData.legalName}
                onChange={(e) => handleChange("legalName", e.target.value)}
                leftIcon={<Building2 className="w-4 h-4" />}
                className="bg-white/5! border-white/10!"
              />
            </div>

            <div className="space-y-6">
              <Input
                label="ID Fiscal (RIF / NIT)"
                placeholder="J-12345678-9"
                value={formData.taxId}
                onChange={(e) => handleChange("taxId", e.target.value)}
                leftIcon={<ShieldCheck className="w-4 h-4" />}
                className="bg-white/5! border-white/10!"
              />

              <Input
                label="Dirección Fiscal"
                placeholder="Av. Principal, Edificio Fit..."
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                leftIcon={<MapPin className="w-4 h-4" />}
                className="bg-white/5! border-white/10!"
              />
            </div>
          </div>
        </Card>

        {/* ACCIONES */}
        <Card className="p-8! bg-white/5 border-white/5 backdrop-blur-md rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <Text weight="bold" size="lg">¿Guardar cambios institucionales?</Text>
            <Text variant="muted" size="sm">
              Estos cambios afectarán la marca y facturación de la sede.
            </Text>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              className="flex-1 md:flex-none h-12 px-8"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isUpdating}
              disabled={isUpdating}
              leftIcon={<Save className="w-4 h-4" />}
              className="flex-1 md:flex-none h-12 px-12 shadow-[0_0_20px_rgba(252,211,3,0.1)]"
            >
              Actualizar Sede
            </Button>
          </div>
        </Card>

      </div>
    </form>
  );
}
