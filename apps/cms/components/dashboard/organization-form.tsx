"use client";

import * as React from "react";
import {
  Input,
  Button,
  toast,
  Text,
  CountrySelector,
  Separator,
  ImageUpload,
} from "@workspace/ui/components";
import { Building2, Globe, ShieldCheck, Send, MapPin, Fingerprint } from "lucide-react";
import { LATAM_COUNTRIES } from "@workspace/shared/constants";
import { uploadService } from "@/lib/services/upload-service";
import { IOrganization } from "@workspace/shared/types";

interface OrganizationFormProps {
  readonly initialData?: IOrganization;
  readonly onSubmit: (data: Partial<IOrganization>) => Promise<void>;
  readonly isLoading?: boolean;
}

export function OrganizationForm({ initialData, onSubmit, isLoading }: OrganizationFormProps) {
  const isEdit = !!initialData?.id;
  const [isUploading, setIsUploading] = React.useState(false);

  const [formData, setFormData] = React.useState<Partial<IOrganization>>({
    name: initialData?.name ?? "",
    slug: initialData?.slug ?? "",
    logo: initialData?.logo ?? "",
    status: initialData?.status ?? 'active',
    countryCode: initialData?.countryCode ?? "VE",
    taxId: initialData?.taxId ?? "",
    legalName: initialData?.legalName ?? "",
    address: initialData?.address ?? "",
  });

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string>(
    initialData?.logo ? uploadService.getMediaUrl(initialData.logo) : ""
  );

  const handleChange = (field: keyof IOrganization, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoChange = (file: File | null) => {
    setSelectedFile(file);
    if (!file) {
      setPreviewUrl("");
      setFormData(prev => ({ ...prev, logo: "" }));
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewUrl("");
    setFormData(prev => ({ ...prev, logo: "" }));
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      let finalLogoUrl = formData.logo;

      if (selectedFile) {
        finalLogoUrl = await uploadService.uploadFile(selectedFile, undefined, initialData?.id);
      } else if (!isEdit && !formData.logo) {
        // Default logo for new organizations in R2
        finalLogoUrl = "";
      }

      // Convertimos null de vuelta a undefined para cumplir con la interfaz si es necesario,
      // aunque el API suele preferir null para limpiar campos.
      const payload: Partial<IOrganization> = {
        ...formData,
        logo: finalLogoUrl || undefined,
      };

      await onSubmit(payload);
    } catch (error: any) {
      toast.error(error.message || "Error al procesar el formulario");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">
      {/* Logo Section */}
      <div className="flex flex-col items-center justify-center py-4">
        <ImageUpload
          label="Logo de la organización"
          description={!isEdit && !previewUrl ? "Podrás subir el logo personalizado una vez creada la sede." : "Formatos sugeridos: SVG, PNG."}
          value={previewUrl}
          onChange={handleLogoChange}
          onRemove={removeImage}
          disabled={!isEdit && !previewUrl} // Following original flow: no upload during creation if no preview exists
        />
      </div>

      <div className="space-y-4">
        <Input
          label="Nombre de la Organización"
          placeholder="Ej: Premium Gym Central"
          value={formData.name ?? ""}
          onChange={(e) => handleChange("name", e.target.value)}
          required
          leftIcon={<Building2 size={16} />}
        />

        <div className="space-y-1.5">
          <Input
            label="Slug / Subdominio"
            placeholder="ej-premium-gym"
            value={formData.slug ?? ""}
            onChange={(e) => handleChange("slug", e.target.value)}
            leftIcon={<Globe size={16} />}
          />
          <Text size="xs" variant="muted" className="pl-1">
            Se utilizará para la URL del portal. Si se deja en blanco, se generará a partir del nombre.
          </Text>
        </div>

        <Separator className="bg-white/5 my-2" />

        <div className="space-y-4 pt-2">
          <Text size="xs" weight="bold" className="uppercase tracking-widest text-primary/70">
            Información de la Entidad (Opcional)
          </Text>

          <CountrySelector
            value={formData.countryCode || "VE"}
            onChange={(code) => handleChange("countryCode", code)}
            countries={LATAM_COUNTRIES}
          />

          <Input
            label="Nombre Legal / Razón Social"
            placeholder="Ej: Iron Gym C.A."
            value={formData.legalName ?? ""}
            onChange={(e) => handleChange("legalName", e.target.value)}
            leftIcon={<Building2 size={16} />}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="ID Fiscal (RIF / NIT)"
              placeholder="Ej: J-12345678-9"
              value={formData.taxId ?? ""}
              onChange={(e) => handleChange("taxId", e.target.value)}
              leftIcon={<Fingerprint size={16} />}
            />
            <Input
              label="Dirección"
              placeholder="Ej: Av. Principal, Edif. X..."
              value={formData.address ?? ""}
              onChange={(e) => handleChange("address", e.target.value)}
              leftIcon={<MapPin size={16} />}
            />
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isLoading || isUploading}
          rightIcon={!(isLoading || isUploading) && (isEdit ? <ShieldCheck size={18} /> : <Send size={18} />)}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "CREAR ORGANIZACIÓN"}
        </Button>
      </div>
    </form>
  );
}
