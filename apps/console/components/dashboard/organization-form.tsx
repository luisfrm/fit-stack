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
  CheckboxCard,
  FormTabs,
} from "@workspace/ui/components";
import {
  Building2,
  Globe,
  ShieldCheck,
  Send,
  MapPin,
  Fingerprint,
  Clock,
  User,
  Mail,
  ArrowRight,
} from "lucide-react";
import { LATAM_COUNTRIES, COUNTRY_LIST } from "@workspace/shared/constants";
import { uploadService } from "@/lib/services/upload-service";
import { IOrganization } from "@workspace/shared/types";
import type { OwnerData } from "./organization-form-types";

export type { OwnerData };

interface OrganizationFormProps {
  readonly initialData?: IOrganization;
  readonly onSubmit: (orgData: Partial<IOrganization>, ownerData?: OwnerData, logoFile?: File | null) => Promise<void>;
  readonly isLoading?: boolean;
}

interface Step1Props {
  readonly isEdit: boolean;
  readonly previewUrl: string;
  readonly formData: Partial<IOrganization>;
  readonly onLogoChange: (file: File | null) => void;
  readonly onRemoveLogo: () => void;
  readonly onChange: (field: keyof IOrganization, value: unknown) => void;
}

function OrganizationStep1({
  isEdit,
  previewUrl,
  formData,
  onLogoChange,
  onRemoveLogo,
  onChange,
}: Step1Props) {
  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="col-span-full flex flex-col items-center justify-center py-4">
        <ImageUpload
          label="Logo de la organización"
          description={!isEdit && !previewUrl ? "Sube el logo de la sede (opcional)." : "Formatos sugeridos: SVG, PNG."}
          value={previewUrl}
          onChange={onLogoChange}
          onRemove={onRemoveLogo}
        />
      </div>

      <Input
        label="Nombre de la Organización"
        placeholder="Ej: Premium Gym Central"
        value={formData.name ?? ""}
        onChange={(e) => onChange("name", e.target.value)}
        required
        leftIcon={<Building2 size={16} />}
      />

      <Input
        label="Slug / Subdominio"
        placeholder="ej-premium-gym"
        value={formData.slug ?? ""}
        onChange={(e) => onChange("slug", e.target.value)}
        leftIcon={<Globe size={16} />}
        hint="Se utilizará para la URL del portal. Si se deja en blanco, se generará a partir del nombre."
      />

      <Separator className="col-span-full bg-border my-2" />

      <div className="col-span-full pt-2">
        <Text size="xs" weight="bold" className="uppercase tracking-widest text-primary/70">
          Información de la Entidad (Opcional)
        </Text>
      </div>

      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CountrySelector
          label="País de Operación"
          value={formData.countryCode || "VE"}
          onChange={(code: string) => {
            const config = LATAM_COUNTRIES.find((c) => c.code === code);
            onChange("countryCode", code);
            if (config) onChange("timezone", config.timezone);
          }}
          countries={LATAM_COUNTRIES}
        />

        <SimpleSelect
          label="Zona Horaria"
          value={formData.timezone || "America/Caracas"}
          onChange={(val) => onChange("timezone", val)}
          options={COUNTRY_LIST.map((c) => ({ value: c.timezone, label: `${c.name} (${c.timezone})` }))}
          leftIcon={<Clock size={16} />}
        />
      </div>

      <Input
        label="Nombre Legal / Razón Social"
        placeholder="Ej: Iron Gym C.A."
        value={formData.legalName ?? ""}
        onChange={(e) => onChange("legalName", e.target.value)}
        leftIcon={<Building2 size={16} />}
      />

      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="ID Fiscal (RIF / NIT)"
          placeholder="Ej: J-12345678-9"
          value={formData.taxId ?? ""}
          onChange={(e) => onChange("taxId", e.target.value)}
          leftIcon={<Fingerprint size={16} />}
        />
        <Input
          label="Dirección"
          placeholder="Ej: Av. Principal, Edif. X..."
          value={formData.address ?? ""}
          onChange={(e) => onChange("address", e.target.value)}
          leftIcon={<MapPin size={16} />}
        />
      </div>

      {!isEdit && (
        <div className="col-span-full pt-4">
          <Button type="submit" fullWidth size="lg" rightIcon={<ArrowRight size={18} />}>
            SIGUIENTE PASO: PROPIETARIO
          </Button>
        </div>
      )}
    </div>
  );
}

interface Step2Props {
  readonly ownerData: OwnerData;
  readonly onChange: (field: keyof OwnerData, value: unknown) => void;
  readonly isSubmitting: boolean;
}

function OrganizationStep2({ ownerData, onChange, isSubmitting }: Step2Props) {
  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="col-span-full pb-2">
        <Text size="sm" variant="muted">
          Define el usuario que será el administrador principal (Dueño) de esta sede.
        </Text>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Nombre"
          placeholder="Ej: Juan"
          value={ownerData.firstName}
          onChange={(e) => onChange("firstName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
        <Input
          label="Apellido"
          placeholder="Ej: Pérez"
          value={ownerData.lastName}
          onChange={(e) => onChange("lastName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
      </div>

      <Input
        label="Correo Electrónico"
        type="email"
        placeholder="Ej: owner@gimnasio.com"
        value={ownerData.email}
        onChange={(e) => onChange("email", e.target.value)}
        required
        leftIcon={<Mail size={16} />}
      />

      <div className="col-span-full pt-2">
        <CheckboxCard
          id="sendInviteOrg"
          checked={ownerData.sendInvite}
          onCheckedChange={(checked) => onChange("sendInvite", !!checked)}
          label="Enviar invitación de acceso"
          description="Se enviará un enlace al correo para que el dueño establezca su contraseña."
          className="border-primary/10 bg-primary/5 hover:bg-primary/10"
        />
      </div>

      <div className="col-span-full pt-4">
        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isSubmitting}
          rightIcon={!isSubmitting && <Send size={18} />}
        >
          CREAR SEDE Y PROPIETARIO
        </Button>
      </div>
    </div>
  );
}

export function OrganizationForm({ initialData, onSubmit, isLoading }: OrganizationFormProps) {
  const isEdit = !!initialData?.id;
  const [isUploading, setIsUploading] = React.useState(false);

  const [activeStep, setActiveStep] = React.useState(0);
  const [maxReachedStep, setMaxReachedStep] = React.useState(0);

  const [formData, setFormData] = React.useState<Partial<IOrganization>>({
    name: initialData?.name ?? "",
    slug: initialData?.slug ?? "",
    logo: initialData?.logo ?? "",
    status: initialData?.status ?? "active",
    countryCode: initialData?.countryCode ?? "VE",
    taxId: initialData?.taxId ?? "",
    legalName: initialData?.legalName ?? "",
    address: initialData?.address ?? "",
    timezone: initialData?.timezone ?? "America/Caracas",
  });

  const [ownerData, setOwnerData] = React.useState<OwnerData>({
    firstName: "",
    lastName: "",
    email: "",
    sendInvite: true,
  });

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string>(
    initialData?.logo ? uploadService.getMediaUrl(initialData.logo) : "",
  );

  const handleChange = React.useCallback((field: keyof IOrganization, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleOwnerChange = React.useCallback((field: keyof OwnerData, value: unknown) => {
    setOwnerData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleLogoChange = React.useCallback((file: File | null) => {
    setSelectedFile(file);
    if (!file) {
      setPreviewUrl("");
      setFormData((prev) => ({ ...prev, logo: "" }));
    } else {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }, []);

  const removeImage = React.useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl("");
    setFormData((prev) => ({ ...prev, logo: "" }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEdit && activeStep === 0) {
      setActiveStep(1);
      setMaxReachedStep((prev) => Math.max(prev, 1));
      return;
    }

    setIsUploading(true);
    try {
      let finalLogoUrl = formData.logo;

      if (isEdit && selectedFile) {
        finalLogoUrl = await uploadService.uploadFile(selectedFile, undefined, initialData?.id);
      }

      const payload: Partial<IOrganization> = {
        ...formData,
        logo: previewUrl ? (finalLogoUrl || null) : null,
      };

      await onSubmit(payload, isEdit ? undefined : ownerData, selectedFile);
    } catch (error: any) {
      console.error("Error al procesar el formulario de organización:", error);
      toast.error("No se pudo guardar la organización. Por favor, verifica la información e intenta nuevamente.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStepChange = React.useCallback(
    (step: number) => {
      if (step <= maxReachedStep) {
        setActiveStep(step);
      }
    },
    [maxReachedStep],
  );

  const submitting = isLoading || isUploading;

  return (
    <div className="py-2">
      {!isEdit && (
        <div className="mb-6">
          <FormTabs
            steps={["Datos de la Sede", "Cuenta del Propietario"]}
            activeStep={activeStep}
            onStepChange={handleStepChange}
            variant="glass"
          />
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {isEdit ? (
          <>
            <OrganizationStep1
              isEdit
              previewUrl={previewUrl}
              formData={formData}
              onLogoChange={handleLogoChange}
              onRemoveLogo={removeImage}
              onChange={handleChange}
            />
            <div className="col-span-full pt-6">
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={submitting}
                rightIcon={!submitting && <ShieldCheck size={18} />}
              >
                GUARDAR CAMBIOS
              </Button>
            </div>
          </>
        ) : (
          <>
            {activeStep === 0 && (
              <OrganizationStep1
                isEdit={false}
                previewUrl={previewUrl}
                formData={formData}
                onLogoChange={handleLogoChange}
                onRemoveLogo={removeImage}
                onChange={handleChange}
              />
            )}
            {activeStep === 1 && (
              <OrganizationStep2
                ownerData={ownerData}
                onChange={handleOwnerChange}
                isSubmitting={submitting}
              />
            )}
          </>
        )}
      </form>
    </div>
  );
}
