"use client";

import * as React from "react";
import {
  Input,
  Button,
  Checkbox,
} from "@workspace/ui/components";
import { type ICoach } from "@/types/dashboard";
import { User, Briefcase, Star, Globe, Image as ImageIcon, Hash } from "lucide-react";

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

  const handleChange = (field: keyof ICoach, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();

    const specialitiesArray = specialitiesText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const payload: Partial<ICoach> = { 
      ...formData,
      specialities: specialitiesArray.length > 0 ? specialitiesArray : null
    };

    onSubmit(payload);
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 
          // TODO: Para implementar R2 directo, cambiaremos este Input de texto a un Input type="file"
          // y modificaremos handleSubmit para llamar primero a coachesService.uploadImage(file), 
          // luego inyectaremos el KEY generado en payload.imageUrl.
        */}
        <Input
          label="Clave de Imagen (Key o URL para Test)"
          placeholder="coaches/foto-test.jpg"
          value={formData.imageUrl ?? ""}
          onChange={(e) => handleChange("imageUrl", e.target.value)}
          leftIcon={<ImageIcon size={16} />}
        />
        <Input
          label="Orden de Visualización"
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
        <Button type="submit" fullWidth size="lg" loading={isLoading}>
          {isEdit ? "GUARDAR CAMBIOS" : "AÑADIR ENTRENADOR"}
        </Button>
      </div>
    </form>
  );
}
