"use client";

import * as React from "react";
import {
  Input,
  Button,
  ToggleGroup,
  ToggleGroupItem,
  Textarea,
  CheckboxCard,
} from "@workspace/ui/components";
import { type ICmsClass } from "@/types/dashboard";
import { Calendar, Clock, User, Repeat } from "lucide-react";
import { parseDateAsConfigTimezone } from "@/lib/config/display";

const DAYS_OF_WEEK = [
  { label: "Domingo", value: 0 },
  { label: "Lunes", value: 1 },
  { label: "Martes", value: 2 },
  { label: "Miércoles", value: 3 },
  { label: "Jueves", value: 4 },
  { label: "Viernes", value: 5 },
  { label: "Sábado", value: 6 },
];

interface ClassFormProps {
  readonly initialData?: ICmsClass;
  readonly onSubmit: (data: Partial<ICmsClass>) => void;
  readonly isLoading?: boolean;
}

export function ClassForm({ initialData, onSubmit, isLoading }: ClassFormProps) {
  const isEdit = !!initialData?.id;

  const initialDateStr = (() => {
    const raw = initialData?.scheduledDate;
    if (!raw) return "";
    return raw.includes("T")
      ? new Date(raw).toISOString().split("T")[0]
      : raw;
  })();

  const [formData, setFormData] = React.useState<Partial<ICmsClass>>({
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    trainerName: initialData?.trainerName ?? "",
    isVisible: initialData?.isVisible ?? true,
    startTime: initialData?.startTime ?? "",
    endTime: initialData?.endTime ?? "",
    frequencyType: initialData?.frequencyType ?? "weekly",
    scheduledDate: initialDateStr,
    daysOfWeek: initialData?.daysOfWeek ?? [],
    capacity: initialData?.capacity ?? undefined,
  });

  const handleChange = (field: keyof ICmsClass, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };


  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();

    // Clean up unused frequency fields before sending
    const payload: Partial<ICmsClass> = { ...formData };
    if (payload.frequencyType === "once") {
      delete payload.daysOfWeek;
      // Send as predictable ISO to backend if needed, or simply string if API handles string well
      if (payload.scheduledDate) {
        payload.scheduledDate = parseDateAsConfigTimezone(payload.scheduledDate).toISOString();
      }
    } else {
      delete payload.scheduledDate;
    }

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">

      {/* ── Nombre ── */}
      <Input
        label="Nombre de la Clase"
        placeholder="Ej: Power Yoga, Boxeo..."
        value={formData.name}
        onChange={(e) => handleChange("name", e.target.value)}
        required
        leftIcon={<Calendar size={16} />}
      />

      {/* ── Horario ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Hora de Inicio *"
          type="time"
          value={formData.startTime}
          onChange={(e) => handleChange("startTime", e.target.value)}
          required
          leftIcon={<Clock size={16} />}
        />
        <Input
          label="Hora de Fin"
          type="time"
          value={formData.endTime ?? ""}
          onChange={(e) => handleChange("endTime", e.target.value)}
          leftIcon={<Clock size={16} />}
        />
      </div>

      {/* ── Frecuencia ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Tipo de Frecuencia
        </span>
        <ToggleGroup
          type="single"
          value={formData.frequencyType ?? "weekly"}
          onValueChange={(val) => handleChange("frequencyType", val)}
        >
          <ToggleGroupItem value="weekly">
            <Repeat size={14} /> Semanal
          </ToggleGroupItem>
          <ToggleGroupItem value="once">
            <Calendar size={14} /> Fecha Específica
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* ── Condicional: días de la semana o fecha puntual ── */}
      {formData.frequencyType === "weekly" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Días de la Semana *
          </p>
          <ToggleGroup
            type="multiple"
            value={formData.daysOfWeek ?? []}
            onValueChange={(val) => handleChange("daysOfWeek", val)}
            className="grid grid-cols-4 gap-2"
          >
            {DAYS_OF_WEEK.map(({ label, value }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="py-2 px-3 text-xs"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {formData.daysOfWeek?.length === 0 && (
            <p className="text-xs text-red-400/80">Selecciona al menos un día.</p>
          )}
        </div>
      ) : (
        <Input
          label="Fecha Programada *"
          type="date"
          value={formData.scheduledDate ?? ""}
          onChange={(e) => handleChange("scheduledDate", e.target.value)}
          required
          leftIcon={<Calendar size={16} />}
        />
      )}

      {/* ── Entrenador + Capacidad ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Entrenador"
          placeholder="Ej: Carlos Ruiz"
          value={formData.trainerName ?? ""}
          onChange={(e) => handleChange("trainerName", e.target.value)}
          leftIcon={<User size={16} />}
        />
        <Input
          label="Capacidad Máxima"
          type="number"
          placeholder="Ej: 20"
          value={formData.capacity ?? ""}
          onChange={(e) =>
            handleChange("capacity", e.target.value ? Number(e.target.value) : undefined)
          }
        />
      </div>

      {/* ── Descripción ── */}
      <Textarea
        label="Descripción"
        placeholder="Describe brevemente la clase..."
        value={formData.description ?? ""}
        onChange={(e) => handleChange("description", e.target.value)}
        rows={4}
      />

      {/* ── Visibilidad ── */}
      <div className="col-span-full pt-2">
        <CheckboxCard
          id="isVisible"
          checked={formData.isVisible}
          onCheckedChange={(checked) => handleChange("isVisible", checked)}
          label="Visible en la Web Pública"
          description="Determina si los clientes pueden ver esta clase en la aplicación."
        />
      </div>

      {/* ── Submit ── */}
      <div className="pt-4">
        <Button type="submit" fullWidth size="lg" loading={isLoading}>
          {isEdit ? "GUARDAR CAMBIOS" : "CREAR CLASE"}
        </Button>
      </div>
    </form>
  );
}
