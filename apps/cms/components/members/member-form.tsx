"use client";

import * as React from "react";
import {
  Input,
  Button,
  Checkbox,
  Label,
  toast,
} from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";
import { User, Mail, CreditCard, ShieldCheck, Send, Phone, Calendar, Upload, X, MapPin } from "lucide-react";
import { ORG_ROLES } from "@workspace/shared";
import { uploadService } from "@/lib/services/upload-service";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";

interface MemberFormProps {
  readonly initialData?: IMember;
  readonly onSubmit: (data: Partial<IMember>, sendInvite: boolean) => Promise<void>;
  readonly isLoading?: boolean;
}

export function MemberForm({ initialData, onSubmit, isLoading }: MemberFormProps) {
  const isEdit = !!initialData?.id;
  const [sendInvite, setSendInvite] = React.useState(!isEdit);
  const [isUploading, setIsUploading] = React.useState(false);

  const [formData, setFormData] = React.useState<Partial<IMember>>({
    firstName: initialData?.firstName ?? "",
    lastName: initialData?.lastName ?? "",
    email: initialData?.email ?? "",
    documentId: initialData?.documentId ?? "",
    role: initialData?.role ?? ORG_ROLES.MEMBER,
    isActive: initialData?.isActive ?? true,
    phoneNumber: initialData?.phoneNumber ?? "",
    birthday: initialData?.birthday ?? "",
    imageUrl: initialData?.imageUrl ?? "",
    address: initialData?.address ?? "",
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

      if (selectedFile) {
        finalImageUrl = await uploadService.uploadFile(selectedFile);
      }

      const payload = {
        ...formData,
        imageUrl: finalImageUrl || null,
      };

      await onSubmit(payload, sendInvite);
    } catch (error: any) {
      toast.error(error.message || "Error al procesar el formulario");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">
      {/* Photo Upload */}
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="relative group">
          <Avatar className="size-20 border border-white/10 bg-white/5 ring-offset-background group-hover:ring-2 ring-primary/50 transition-all">
            {previewUrl ? (
              <AvatarImage src={previewUrl} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-white/5 text-slate-500">
              <User className="size-8 opacity-30" />
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
      </div>

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
          placeholder="Ej: juan.perez@gmail.com"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          required
          leftIcon={<Mail size={16} />}
          disabled={isEdit}
        />

        <Input
          label="Identificación / DNI"
          placeholder="Nº de documento"
          value={formData.documentId ?? ""}
          onChange={(e) => handleChange("documentId", e.target.value)}
          leftIcon={<CreditCard size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Teléfono"
          placeholder="Ej: +58 412 1234567"
          value={formData.phoneNumber ?? ""}
          onChange={(e) => handleChange("phoneNumber", e.target.value)}
          leftIcon={<Phone size={16} />}
        />

        <Input
          label="Fecha de Nacimiento"
          type="date"
          value={formData.birthday ?? ""}
          onChange={(e) => handleChange("birthday", e.target.value)}
          leftIcon={<Calendar size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Input
          label="Dirección"
          placeholder="Ej: Calle 123, Urb. Las Flores..."
          value={formData.address ?? ""}
          onChange={(e) => handleChange("address", e.target.value)}
          leftIcon={<MapPin size={16} />}
        />
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center space-x-3 rounded-lg border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.07]">
          <Checkbox
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => handleChange("isActive", checked)}
          />
          <div className="grid gap-1.5 leading-none">
            <Label htmlFor="isActive" className="text-sm font-medium leading-none text-white">
              Estado Activo
            </Label>
            <p className="text-xs text-muted-foreground">
              Determina si el cliente tiene acceso actual al gimnasio.
            </p>
          </div>
        </div>

        {!isEdit && (
          <div className="flex items-center space-x-3 rounded-lg border border-primary/10 bg-primary/5 p-4">
            <Checkbox
              id="sendEmail"
              checked={sendInvite}
              onCheckedChange={(checked) => setSendInvite(!!checked)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="sendEmail" className="text-sm font-bold leading-none text-primary">
                Enviar correo de registro
              </Label>
              <p className="text-xs text-primary/60">
                Se enviarán las credenciales de acceso para que cree su contraseña.
              </p>
            </div>
          </div>
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
          {isEdit ? "GUARDAR CAMBIOS" : "CREAR CLIENTE"}
        </Button>
      </div>
    </form>
  );
}
