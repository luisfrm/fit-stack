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
import { Building2, Globe, ShieldCheck, Send, MapPin, Fingerprint, Clock, User, Mail, ArrowRight } from "lucide-react";
import { LATAM_COUNTRIES, COUNTRY_LIST } from "@workspace/shared/constants";
import { uploadService } from "@/lib/services/upload-service";
import { IOrganization } from "@workspace/shared/types";

export interface OwnerData {
  firstName: string;
  lastName: string;
  email: string;
  sendInvite: boolean;
}

interface OrganizationFormProps {
  readonly initialData?: IOrganization;
  readonly onSubmit: (orgData: Partial<IOrganization>, ownerData?: OwnerData, logoFile?: File | null) => Promise<void>;
  readonly isLoading?: boolean;
}

export function OrganizationForm({ initialData, onSubmit, isLoading }: OrganizationFormProps) {
  const isEdit = !!initialData?.id;
  const [isUploading, setIsUploading] = React.useState(false);

  // Wizard State
  const [activeStep, setActiveStep] = React.useState(0);
  const [maxReachedStep, setMaxReachedStep] = React.useState(0);

  // Form Data
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

  // Owner Data
  const [ownerData, setOwnerData] = React.useState<OwnerData>({
    firstName: "",
    lastName: "",
    email: "",
    sendInvite: true,
  });

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string>(
    initialData?.logo ? uploadService.getMediaUrl(initialData.logo) : ""
  );

  const handleChange = (field: keyof IOrganization, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleOwnerChange = (field: keyof OwnerData, value: unknown) => {
    setOwnerData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoChange = (file: File | null) => {
    setSelectedFile(file);
    if (!file) {
      setPreviewUrl("");
      setFormData(prev => ({ ...prev, logo: "" }));
    } else {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewUrl("");
    setFormData(prev => ({ ...prev, logo: "" }));
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();

    // If it's a wizard and not on the last step, proceed to next step
    if (!isEdit && activeStep === 0) {
      setActiveStep(1);
      setMaxReachedStep((prev) => Math.max(prev, 1));
      return;
    }

    setIsUploading(true);

    try {
      let finalLogoUrl = formData.logo;

      // Only upload inside the form if it's an EDIT (we already have orgId)
      // For creation, we pass the file to the modal to do it after creation
      if (isEdit && selectedFile) {
        finalLogoUrl = await uploadService.uploadFile(selectedFile, undefined, initialData?.id);
      }

      const payload: Partial<IOrganization> = {
        ...formData,
        logo: finalLogoUrl || undefined,
      };

      await onSubmit(payload, isEdit ? undefined : ownerData, selectedFile);
    } catch (error: any) {
      toast.error(error.message || "Error al procesar el formulario");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStepChange = (step: number) => {
    // Only allow going back or jumping to a previously reached step
    if (step <= maxReachedStep) {
      setActiveStep(step);
    }
  };

  // ---------------------------------------------------------------------------
  // STEP 1: SEDE
  // ---------------------------------------------------------------------------
  const renderStep1 = () => (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Logo Section */}
      <div className="col-span-full flex flex-col items-center justify-center py-4">
        <ImageUpload
          label="Logo de la organización"
          description={!isEdit && !previewUrl ? "Sube el logo de la sede (opcional)." : "Formatos sugeridos: SVG, PNG."}
          value={previewUrl}
          onChange={handleLogoChange}
          onRemove={removeImage}
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
      
      {!isEdit && (
        <div className="col-span-full pt-4">
          <Button type="submit" fullWidth size="lg" rightIcon={<ArrowRight size={18} />}>
            SIGUIENTE PASO: PROPIETARIO
          </Button>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // STEP 2: PROPIETARIO
  // ---------------------------------------------------------------------------
  const renderStep2 = () => (
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
          onChange={(e) => handleOwnerChange("firstName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
        <Input
          label="Apellido"
          placeholder="Ej: Pérez"
          value={ownerData.lastName}
          onChange={(e) => handleOwnerChange("lastName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
      </div>

      <Input
        label="Correo Electrónico"
        type="email"
        placeholder="Ej: owner@gimnasio.com"
        value={ownerData.email}
        onChange={(e) => handleOwnerChange("email", e.target.value)}
        required
        leftIcon={<Mail size={16} />}
      />

      <div className="col-span-full pt-2">
        <CheckboxCard
          id="sendInviteOrg"
          checked={ownerData.sendInvite}
          onCheckedChange={(checked) => handleOwnerChange("sendInvite", !!checked)}
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
          loading={isLoading || isUploading}
          rightIcon={!(isLoading || isUploading) && <Send size={18} />}
        >
          CREAR SEDE Y PROPIETARIO
        </Button>
      </div>
    </div>
  );

  return (
    <div className="py-2">
      {/* Show Tabs ONLY in Creation Mode */}
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
            {renderStep1()}
            <div className="col-span-full pt-6">
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={isLoading || isUploading}
                rightIcon={!(isLoading || isUploading) && <ShieldCheck size={18} />}
              >
                GUARDAR CAMBIOS
              </Button>
            </div>
          </>
        ) : (
          <>
            {activeStep === 0 && renderStep1()}
            {activeStep === 1 && renderStep2()}
          </>
        )}
      </form>
    </div>
  );
}