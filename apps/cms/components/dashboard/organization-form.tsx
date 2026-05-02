"use client";

import * as React from "react";
import {
  Input,
  Button,
  toast,
  Text,
  SimpleSelect,
  Separator,
  CountrySelector,
  ImageUpload,
} from "@workspace/ui/components";
import { Building2, Globe, ShieldCheck, Send, MapPin, Fingerprint, Clock } from "lucide-react";
import { LATAM_COUNTRIES, COUNTRY_LIST } from "@workspace/shared/constants";
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
    timezone: initialData?.timezone ?? "America/Caracas",
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
      <div className="col-span-full flex flex-col items-center justify-center py-4">
        <ImageUpload
          label="Logo de la organización"
          description={!isEdit && !previewUrl ? "Podrás subir el logo personalizado una vez creada la sede." : "Formatos sugeridos: SVG, PNG."}
          value={previewUrl}
          onChange={handleLogoChange}
          onRemove={removeImage}
          disabled={!isEdit && !previewUrl} // Following original flow: no upload during creation if no preview exists
        />
      </div>

      <Input
        label="Nombre de la Organización"
        placeholder="Ej: Premium Gym Central"
        value={formData.name ?? ""}
        onChange={(e) => handleChange("name", e.target.value)}
        required
        leftIcon={<Building2 size={16} />}
      />

      <Input
        label="Slug / Subdominio"
        placeholder="ej-premium-gym"
        value={formData.slug ?? ""}
        onChange={(e) => handleChange("slug", e.target.value)}
        leftIcon={<Globe size={16} />}
        hint="Se utilizará para la URL del portal. Si se deja en blanco, se generará a partir del nombre."
      />

      <Separator className="col-span-full bg-white/5 my-2" />

      <div className="col-span-full pt-2">
        <Text size="xs" weight="bold" className="uppercase tracking-widest text-primary/70">
          Información de la Entidad (Opcional)
        </Text>
      </div>

      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CountrySelector
          value={formData.countryCode || "VE"}
          onChange={(code: string) => {
            const config = LATAM_COUNTRIES.find(c => c.code === code);
            handleChange("countryCode", code);
            if (config) handleChange("timezone", config.timezone);
          }}
          countries={LATAM_COUNTRIES}
        />

        <SimpleSelect
          label="Zona Horaria"
          value={formData.timezone || "America/Caracas"}
          onChange={(val) => handleChange("timezone", val)}
          options={COUNTRY_LIST.map(c => ({ value: c.timezone, label: `${c.name} (${c.timezone})` }))}
          leftIcon={<Clock size={16} />}
        />
      </div>

      <Input
        label="Nombre Legal / Razón Social"
        placeholder="Ej: Iron Gym C.A."
        value={formData.legalName ?? ""}
        onChange={(e) => handleChange("legalName", e.target.value)}
        leftIcon={<Building2 size={16} />}
      />

      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="col-span-full pt-4">
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
