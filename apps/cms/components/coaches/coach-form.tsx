"use client";

import * as React from "react";
import {
  Input,
  Button,
  Checkbox,
} from "@workspace/ui/components";
import { type ICoach } from "@/types/dashboard";
import { User, Briefcase, Star, Globe, Image as ImageIcon, Hash, Upload, X } from "lucide-react";
import { coachesService } from "@/lib/services/coaches-service";
import { getMediaUrl } from "@/lib/utils/media-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { toast } from "@workspace/ui/components";
import { Label } from "@workspace/ui/components/label";

interface CoachFormProps {
  readonly initialData?: ICoach;
  readonly onSubmit: (data: Partial<ICoach>) => void;
  readonly isLoading?: boolean;
}

export function CoachForm({ initialData, onSubmit, isLoading }: CoachFormProps) {
  const isEdit = !!initialData?.id;

  // specialities in DB is jsonb. For now, we process it as a comma-separated string.
  const [specialitiesText, setSpecialitiesText] = React.useState(
    initialData?.specialities?.join(", ") ?? ""
  );

  const [formData, setFormData] = React.useState<Partial<ICoach>>({
    name:         initialData?.name         ?? "",
    role:         initialData?.role         ?? "",
    imageUrl:     initialData?.imageUrl     ?? "",
    isVisible:    initialData?.isVisible    ?? true,
    displayOrder: initialData?.displayOrder ?? 0,
  });

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string>(
    initialData?.imageUrl ? getMediaUrl(initialData.imageUrl) : ""
  );
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Cleanup object URLs to avoid memory leaks
  React.useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleChange = (field: keyof ICoach, value: unknown) => {
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
        finalImageUrl = await coachesService.uploadImage(selectedFile);
      }

      const specialitiesArray = specialitiesText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const payload: Partial<ICoach> = { 
        ...formData,
        imageUrl: finalImageUrl,
        specialities: specialitiesArray.length > 0 ? specialitiesArray : null
      };

      onSubmit(payload);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Error al subir la imagen. Por favor, revisa tu conexión.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">

      {/* ── Nombre y Rol ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nombre del Entrenador"
          placeholder="Ej: Carlos Ruiz"
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          required
          leftIcon={<User size={16} />}
        />
        <Input
          label="Rol"
          placeholder="Ej: Head Coach"
          value={formData.role}
          onChange={(e) => handleChange("role", e.target.value)}
          required
          leftIcon={<Briefcase size={16} />}
        />
      </div>

      {/* ── Especialidades ── */}
      <Input
        label="Especialidades (separadas por coma)"
        placeholder="Ej: Yoga, Pilates, Fuerza"
        value={specialitiesText}
        onChange={(e) => setSpecialitiesText(e.target.value)}
        leftIcon={<Star size={16} />}
      />

      {/* ── Imagen y Orden ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="md:col-span-2 space-y-2">
          <Label className="text-sm font-medium text-slate-300 ml-1 block">Foto de Perfil</Label>
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
                    className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
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
      <div className="flex items-center space-x-3 rounded-lg border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.07]">
        <Checkbox
          id="isVisible"
          checked={formData.isVisible}
          onCheckedChange={(checked) => handleChange("isVisible", checked)}
        />
        <div className="grid gap-1.5 leading-none">
          <label
            htmlFor="isVisible"
            className="text-sm font-medium leading-none flex items-center gap-2"
          >
            <Globe size={14} className="text-primary" />
            Visible en la Web
          </label>
          <p className="text-xs text-muted-foreground">
            Determina si el entrenador será visible en la página pública y en la app.
          </p>
        </div>
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
