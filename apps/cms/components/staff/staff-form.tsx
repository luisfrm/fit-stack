"use client";

import * as React from "react";
import {
  Input,
  Button,
  CheckboxCard,
  toast,
  SimpleSelect,
} from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";
import { User, Mail, CreditCard, ShieldCheck, Send, Phone, Upload, X } from "lucide-react";
import { canAssignRole, ORG_ROLES, type OrgRole } from "@workspace/shared";
import { useAuth } from "@/lib/hooks/use-auth";
import { uploadService } from "@/lib/services/upload-service";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Text } from "@workspace/ui/components/text";

interface StaffFormProps {
  readonly initialData?: IMember;
  readonly onSubmit: (data: Partial<IMember>, sendInvite: boolean) => Promise<void>;
  readonly isLoading?: boolean;
}

const STAFF_ROLE_OPTIONS = [
  { value: ORG_ROLES.OWNER, label: "Owner / Propietario" },
  { value: ORG_ROLES.MANAGER, label: "Manager / Administrador" },
  { value: ORG_ROLES.COACH, label: "Entrenador" },
  { value: ORG_ROLES.CASHIER, label: "Cajero / Staff" },
] as const;

export function StaffForm({ initialData, onSubmit, isLoading }: StaffFormProps) {
  const { orgRole } = useAuth();
  const isEdit = !!initialData?.id;
  const [sendInvite, setSendInvite] = React.useState(!isEdit);
  const [isUploading, setIsUploading] = React.useState(false);

  const [formData, setFormData] = React.useState<Partial<IMember>>({
    firstName: initialData?.firstName ?? "",
    lastName: initialData?.lastName ?? "",
    email: initialData?.email ?? "",
    documentId: initialData?.documentId ?? "",
    role: initialData?.role ?? ORG_ROLES.MANAGER, // Default to Manager for staff
    isActive: initialData?.isActive ?? true,
    phoneNumber: initialData?.phoneNumber ?? "",
    birthday: initialData?.birthday ?? "",
    imageUrl: initialData?.imageUrl ?? "",
  });

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string>(
    initialData?.imageUrl ? uploadService.getMediaUrl(initialData.imageUrl) : ""
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Cleanup object URLs
  React.useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleChange = (field: keyof IMember, value: unknown) => {
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
    setFormData(prev => ({ ...prev, imageUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      let finalImageUrl = formData.imageUrl;

      // 1. If a new file is selected, upload it first
      if (selectedFile) {
        finalImageUrl = await uploadService.uploadFile(selectedFile);
      }

      const payload = {
        ...formData,
        imageUrl: finalImageUrl || null,
      };

      await onSubmit(payload, sendInvite);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error interno del servidor'
      toast.error(message || "Error al procesar el formulario");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 py-4">
      {/* ── Photo Upload Section ── */}
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="relative group">
          <Avatar size="2xl">
            {previewUrl ? (
              <AvatarImage src={previewUrl} className="object-cover" />
            ) : null}
            <AvatarFallback>
              <User className="size-10 opacity-30" />
            </AvatarFallback>
          </Avatar>

          {previewUrl && (
            <Button
              type="button"
              variant="danger"
              size="icon"
              rounded="full"
              onClick={removeImage}
              className="absolute -top-1 -right-1 h-6 w-6 shadow-lg hover:scale-110 transition-transform z-10"
            >
              <X className="size-3" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0 border-none hover:bg-black/60"
          >
            <Upload className="size-6 text-white" />
          </Button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
        <div className="text-center">
          <Text size="xs" variant="muted" className="mb-1">
            Foto de Perfil (Opcional)
          </Text>
          <Text size="xs" className="text-primary/60">
            JPG, PNG o WebP. Máx 2MB.
          </Text>
        </div>
      </div>

      {/* ── Personal Info ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nombre"
          placeholder="Ej: Juan"
          value={formData.firstName}
          onChange={(e) => handleChange("firstName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
        <Input
          label="Apellido"
          placeholder="Ej: Pérez"
          value={formData.lastName}
          onChange={(e) => handleChange("lastName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Correo Electrónico"
          type="email"
          placeholder="Ej: admin@elitefitness.com"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          required
          leftIcon={<Mail size={16} />}
          disabled={isEdit}
        />

        <SimpleSelect
          label="Rol Administrativo"
          value={formData.role ?? ORG_ROLES.MANAGER}
          onChange={(v) => handleChange("role", v)}
          options={STAFF_ROLE_OPTIONS.filter(
            (opt) => orgRole && canAssignRole(orgRole as OrgRole, opt.value as OrgRole),
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Identificación / DNI"
          placeholder="Nº de documento"
          value={formData.documentId ?? ""}
          onChange={(e) => handleChange("documentId", e.target.value)}
          leftIcon={<CreditCard size={16} />}
        />
        <Input
          label="Teléfono"
          placeholder="Ej: +58 412 1234567"
          value={formData.phoneNumber ?? ""}
          onChange={(e) => handleChange("phoneNumber", e.target.value)}
          leftIcon={<Phone size={16} />}
        />
      </div>

      <div className="col-span-full flex flex-col gap-3 pt-2">
        <CheckboxCard
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => handleChange("isActive", checked)}
          label="Estado Activo"
          description="Determina si el usuario tiene acceso actual al panel de administración."
        />

        {!isEdit && (
          <CheckboxCard
            id="sendEmail"
            checked={sendInvite}
            onCheckedChange={(checked) => setSendInvite(!!checked)}
            label="Enviar invitación de acceso"
            description="Se enviará un enlace al correo para que el nuevo staff cree su contraseña."
            className="border-primary/10 bg-primary/5 hover:bg-primary/10"
          />
        )}
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isLoading || isUploading}
          rightIcon={!(isLoading || isUploading) && (isEdit ? <ShieldCheck size={18} /> : <Send size={18} />)}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "AÑADIR AL STAFF"}
        </Button>
      </div>
    </form>
  );
}

