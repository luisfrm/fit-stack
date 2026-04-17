"use client";

import * as React from "react";
import {
  Input,
  Button,
  CheckboxCard,
  toast,
} from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";
import { User, Mail, CreditCard, ShieldCheck, Send, Phone, Calendar, Camera, X, MapPin, Loader2 } from "lucide-react";
import { ORG_ROLES } from "@workspace/shared";
import { uploadService } from "@/lib/services/upload-service";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { cn } from "@workspace/ui/lib/utils";

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
      <div className="flex flex-col items-center gap-4 py-4">
        <button
          type="button"
          aria-label={previewUrl ? "Cambiar foto de perfil" : "Subir foto de perfil"}
          className={cn(
            "relative group cursor-pointer transition-all duration-300 outline-none rounded-full block",
            !previewUrl && "hover:border-primary/50"
          )}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <div className={cn(
            "rounded-full p-1 border-2 border-dashed border-white/10 group-hover:border-primary/40 transition-colors",
            previewUrl && "border-solid border-primary/20"
          )}>
            <Avatar size="2xl" className="size-24 border shadow-sm ring-1 ring-white/5 ring-inset">
              {previewUrl ? (
                <AvatarImage src={previewUrl} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-white/5">
                <User className="size-10 text-gray-600 opacity-20" />
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Hover Overlay */}
          <div className="absolute inset-1 rounded-full bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-1.5 z-10 overflow-hidden">
            {isUploading ? (
              <Loader2 className="size-6 text-white animate-spin" />
            ) : (
              <>
                <Camera className="size-6 text-white" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                  {previewUrl ? "Cambiar" : "Subir foto"}
                </span>
              </>
            )}
          </div>

          {previewUrl && (
            <Button
              type="button"
              variant="danger"
              size="icon"
              rounded="full"
              onClick={(e) => {
                e.stopPropagation();
                removeImage();
              }}
              className="absolute -top-1 -right-1 h-6 w-6 shadow-xl hover:scale-110 transition-transform z-20"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-gray-300">Foto de perfil</span>
          <span className="text-[10px] text-gray-400">JPG, PNG o WEBP (Máx. 2MB)</span>
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

      <div className="col-span-full flex flex-col gap-3 pt-2">
        <CheckboxCard
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => handleChange("isActive", checked)}
          label="Estado Activo"
          description="Determina si el cliente tiene acceso actual al gimnasio."
        />

        {!isEdit && (
          <CheckboxCard
            id="sendEmail"
            checked={sendInvite}
            onCheckedChange={(checked) => setSendInvite(!!checked)}
            label="Enviar correo de registro"
            description="Se enviarán las credenciales de acceso para que cree su contraseña."
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
          {isEdit ? "GUARDAR CAMBIOS" : "CREAR CLIENTE"}
        </Button>
      </div>
    </form>
  );
}
