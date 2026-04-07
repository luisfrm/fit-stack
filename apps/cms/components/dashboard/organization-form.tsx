"use client";

import * as React from "react";
import {
  Input,
  Button,
  toast,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Text,
  CountrySelector,
  Separator,
} from "@workspace/ui/components";
import { type Organization } from "./organization-mobile-card";
import { Building2, Globe, ShieldCheck, Send, Upload, X, MapPin, Fingerprint } from "lucide-react";
import { LATAM_COUNTRIES } from "@workspace/shared/constants";
import { coachesService } from "@/lib/services/coaches-service";
import { uploadService } from "@/lib/services/upload-service";

interface OrganizationFormProps {
  readonly initialData?: Organization;
  readonly onSubmit: (data: Partial<Organization>) => Promise<void>;
  readonly isLoading?: boolean;
}

export function OrganizationForm({ initialData, onSubmit, isLoading }: OrganizationFormProps) {
  const isEdit = !!initialData?.id;
  const [isUploading, setIsUploading] = React.useState(false);

  const [formData, setFormData] = React.useState<Partial<Organization>>({
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (field: keyof Organization, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewUrl("");
    setFormData(prev => ({ ...prev, logo: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      let finalLogoUrl = formData.logo;

      if (selectedFile) {
        finalLogoUrl = await coachesService.uploadImage(selectedFile);
      }

      // Convertimos null de vuelta a undefined para cumplir con la interfaz si es necesario,
      // aunque el API suele preferir null para limpiar campos.
      const payload: Partial<Organization> = {
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
      {/* Logo Upload */}
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="relative group">
          <Avatar className="size-20 border border-white/10 bg-white/5 ring-offset-background group-hover:ring-2 ring-primary/50 transition-all">
            {previewUrl ? (
              <AvatarImage src={previewUrl} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-white/5 text-slate-500 font-bold">
              <Building2 className="size-8 opacity-30" />
            </AvatarFallback>
          </Avatar>

          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0 border-none hover:bg-black/60"
          >
            <Upload className="size-5 text-white" />
          </Button>

          {previewUrl && (
            <Button
              type="button"
              variant="danger"
              size="icon"
              rounded="full"
              onClick={removeImage}
              className="absolute -top-1 -right-1 h-5 w-5 shadow-lg hover:scale-110 transition-transform z-10"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        <Text size="xs" variant="muted" className="font-medium uppercase tracking-wider">Logo de la organización</Text>
      </div>

      <div className="space-y-4">
        <Input
          label="Nombre de la Organización"
          placeholder="Ej: Premium Gym Central"
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          required
          leftIcon={<Building2 size={16} />}
        />

        <div className="space-y-1.5">
          <Input
            label="Slug / Subdominio"
            placeholder="ej-premium-gym"
            value={formData.slug}
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
            value={formData.legalName}
            onChange={(e) => handleChange("legalName", e.target.value)}
            leftIcon={<Building2 size={16} />}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="ID Fiscal (RIF / NIT)"
              placeholder="Ej: J-12345678-9"
              value={formData.taxId}
              onChange={(e) => handleChange("taxId", e.target.value)}
              leftIcon={<Fingerprint size={16} />}
            />
            <Input
              label="Dirección"
              placeholder="Ej: Av. Principal, Edif. X..."
              value={formData.address}
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
