"use client";

import * as React from "react";
import {
  Input,
  Button,
  CheckboxCard,
  toast,
  Textarea
} from "@workspace/ui/components";
import { type ITrainer } from "@/types/dashboard";
import { User, Star, Image as ImageIcon, Hash, Upload, X, Mail, CreditCard, Phone, Calendar, Plus } from "lucide-react";
import { uploadService } from "@/lib/services/upload-service";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { ORG_ROLES } from "@workspace/shared";

interface TrainerFormProps {
  readonly initialData?: ITrainer;
  readonly onSubmit: (data: Partial<ITrainer>) => void;
  readonly isLoading?: boolean;
}

export function TrainerForm({ initialData, onSubmit, isLoading }: TrainerFormProps) {
  const isEdit = !!initialData?.id;

  const [specialities, setSpecialities] = React.useState<string[]>(
    initialData?.specialities ?? []
  );
  const [newSpeciality, setNewSpeciality] = React.useState("");

  const [formData, setFormData] = React.useState<Partial<ITrainer>>({
    firstName: initialData?.firstName ?? "",
    lastName: initialData?.lastName ?? "",
    email: initialData?.email ?? "",
    documentId: initialData?.documentId ?? "",
    phoneNumber: initialData?.phoneNumber ?? "",
    birthday: initialData?.birthday ?? "",
    imageUrl: initialData?.imageUrl ?? "",
    bio: initialData?.bio ?? "",
    isVisible: initialData?.isVisible ?? true,
    displayOrder: initialData?.displayOrder ?? 0,
    role: initialData?.role ?? ORG_ROLES.COACH,
  });

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string>(
    initialData?.imageUrl ? uploadService.getMediaUrl(initialData.imageUrl) : ""
  );
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleChange = (field: keyof ITrainer, value: unknown) => {
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
    if (!formData.firstName?.trim() || !formData.lastName?.trim() || !formData.email?.trim()) {
      toast.error("Nombre, apellido y correo son obligatorios");
      return;
    }
    setIsUploading(true);

    try {
      let finalImageUrl = formData.imageUrl;

      if (selectedFile) {
        finalImageUrl = await uploadService.uploadFile(selectedFile);
      }

      const payload: Partial<ITrainer> = {
        ...formData,
        imageUrl: finalImageUrl,
        specialities: specialities.length > 0 ? specialities : null
      };

      onSubmit(payload);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Error al procesar el formulario. Por favor, revisa los datos.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">

      {/* ── Nombre y Apellido ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nombre"
          placeholder="Ej: Carlos"
          value={formData.firstName}
          onChange={(e) => handleChange("firstName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
        <Input
          label="Apellido"
          placeholder="Ej: Ruiz"
          value={formData.lastName}
          onChange={(e) => handleChange("lastName", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
      </div>

      {/* ── Email e Identificación ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Correo Electrónico"
          type="email"
          placeholder="Ej: trainer@empresa.com"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          required
          leftIcon={<Mail size={16} />}
        />
        <Input
          label="Identificación / DNI"
          placeholder="Nº de documento"
          value={formData.documentId ?? ""}
          onChange={(e) => handleChange("documentId", e.target.value)}
          leftIcon={<CreditCard size={16} />}
        />
      </div>

      {/* ── Teléfono y Fecha de Nacimiento ── */}
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

      {/* ── Especialidades ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Especialidades ({specialities.length}/6)</span>
          {specialities.length >= 6 && (
            <span className="text-[10px] text-yellow-500 font-bold uppercase animate-pulse">Límite alcanzado</span>
          )}
        </div>

        <Input
          placeholder={specialities.length < 6 ? "Ej: Yoga, CrossFit, Pilates..." : "Límite de 6 alcanzado"}
          value={newSpeciality}
          onChange={(e) => setNewSpeciality(e.target.value)}
          disabled={specialities.length >= 6}
          inputSize="sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const val = newSpeciality.trim();
              if (val && !specialities.includes(val) && specialities.length < 6) {
                setSpecialities([...specialities, val]);
                setNewSpeciality("");
              }
            }
          }}
          leftIcon={<Star size={16} />}
          rightElement={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-black bg-primary hover:bg-primary/80 hover:scale-95 -mr-2"
              disabled={!newSpeciality.trim() || specialities.length >= 6}
              onClick={() => {
                const val = newSpeciality.trim();
                if (val && !specialities.includes(val) && specialities.length < 6) {
                  setSpecialities([...specialities, val]);
                  setNewSpeciality("");
                }
              }}
            >
              <Plus size={16} /> Agregar
            </Button>
          }
        />

        {/* ── Tags Render ── */}
        <div className="flex flex-wrap gap-2 min-h-8 p-3 rounded-lg bg-white/5 border border-dashed border-white/10 mt-2">
          {specialities.length > 0 ? (
            specialities.map((tag) => (
              <span
                key={tag}
                className="group flex items-center gap-1.5 px-3 py-1 bg-surface-2 text-foreground-dim text-xs rounded-full border border-border-muted transition-all hover:border-primary/50 hover:bg-surface-3"
              >
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSpecialities(specialities.filter(s => s !== tag))}
                  className="h-auto p-0 text-foreground-dim hover:text-red-400 border-none bg-transparent"
                >
                  <X size={12} />
                </Button>
              </span>
            ))
          ) : (
            <p className="text-xs text-slate-500 italic ml-1">Escribe una especialidad arriba y presiona Enter o el botón para añadirla.</p>
          )}
        </div>
      </div>

      {/* ── Biografía ── */}
      <Textarea
        label="Biografía / Perfil Profesional"
        placeholder="Cuéntanos un poco sobre la trayectoria y enfoque del entrenador..."
        value={formData.bio ?? ""}
        onChange={(e) => handleChange("bio", e.target.value)}
        rows={4}
      />

      {/* ── Imagen y Orden ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="md:col-span-2 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Foto de Perfil</span>
          <div className="flex items-center gap-4">
            <Avatar size="lg" className="border-2 border-white/10 shrink-0">
              <AvatarImage src={previewUrl} />
              <AvatarFallback className="bg-white/5">
                <ImageIcon className="w-8 h-8 text-white/20" />
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col gap-2 w-full">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="glass"
                  size="sm"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                  leftIcon={<Upload size={14} />}
                >
                  {previewUrl ? "Cambiar Foto" : "Subir Foto"}
                </Button>
                {previewUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeImage}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 italic">Formatos: JPG, PNG, WEBP. Max 2MB.</p>
            </div>
          </div>
        </div>

        <Input
          label="Orden"
          type="number"
          placeholder="0"
          value={formData.displayOrder?.toString() ?? "0"}
          onChange={(e) => handleChange("displayOrder", Number(e.target.value))}
          leftIcon={<Hash size={16} />}
        />
      </div>

      {/* ── Visibilidad ── */}
      <div className="col-span-full flex flex-col gap-3 pt-2">
        <CheckboxCard
          id="isVisible"
          checked={formData.isVisible}
          onCheckedChange={(checked) => handleChange("isVisible", checked)}
          label="Visible en la Web Pública"
          description="Determina si el entrenador será visible en la página pública y en la app."
        />
      </div>

      {/* ── Submit ── */}
      <div className="pt-4">
        <Button type="submit" fullWidth size="lg" loading={isLoading || isUploading}>
          {isEdit ? "GUARDAR CAMBIOS" : "AÑADIR ENTRENADOR"}
        </Button>
      </div>
    </form>
  );
}