"use client";

import * as React from "react";
import { 
  Input, 
  Button, 
  Checkbox,
} from "@workspace/ui/components";
import { type ICmsClass } from "@/types/dashboard";
import { Calendar, Clock, User, FileText, Globe } from "lucide-react";

interface ClassFormProps {
  readonly initialData?: ICmsClass;
  readonly onSubmit: (data: any) => void;
  readonly isLoading?: boolean;
}

export function ClassForm({ initialData, onSubmit, isLoading }: ClassFormProps) {
  const isEdit = !!initialData?.id;

  // Form State
  const [formData, setFormData] = React.useState({
    name: initialData?.name || "",
    timeInfo: initialData?.timeInfo || "",
    trainerName: initialData?.trainerName || "",
    description: initialData?.description || "",
    isVisible: initialData?.isVisible ?? true,
  });

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">
      <Input
        label="Nombre de la Clase"
        placeholder="Ej: Power Yoga, Boxeo..."
        value={formData.name}
        onChange={(e) => handleChange("name", e.target.value)}
        required
        leftIcon={<Calendar size={16} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Horario / Info de Tiempo"
          placeholder="Ej: 10:00 AM"
          value={formData.timeInfo}
          onChange={(e) => handleChange("timeInfo", e.target.value)}
          required
          leftIcon={<Clock size={16} />}
        />
        <Input
          label="Entrenador"
          placeholder="Ej: Carlos Ruiz"
          value={formData.trainerName}
          onChange={(e) => handleChange("trainerName", e.target.value)}
          leftIcon={<User size={16} />}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Descripción
        </label>
        <div className="relative">
          <FileText className="absolute left-3 top-3 text-white/30" size={16} />
          <textarea
            className="w-full min-h-[100px] bg-[#111111] border border-[#333333] rounded-lg p-3 pl-10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-none"
            placeholder="Describe brevemente la clase..."
            value={formData.description}
            onChange={(e) => handleChange("description", e.target.value)}
          />
        </div>
      </div>

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
            Determina si los clientes pueden ver esta clase en la aplicación móvil o sitio web.
          </p>
        </div>
      </div>

      <div className="pt-4">
        <Button 
          type="submit" 
          fullWidth 
          size="lg" 
          loading={isLoading}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "CREAR CLASE"}
        </Button>
      </div>
    </form>
  );
}
