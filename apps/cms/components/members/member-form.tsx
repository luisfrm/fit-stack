"use client";

import * as React from "react";
import { 
  Input, 
  Button, 
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components";
import { type IMember, type Role } from "@/types/dashboard";
import { User, Mail, CreditCard, ShieldCheck, Send } from "lucide-react";

interface MemberFormProps {
  readonly initialData?: IMember;
  readonly onSubmit: (data: any) => void;
  readonly isLoading?: boolean;
}

export function MemberForm({ initialData, onSubmit, isLoading }: MemberFormProps) {
  const isEdit = !!initialData?.id;

  // Form State
  const [formData, setFormData] = React.useState({
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    email: initialData?.email || "",
    documentId: initialData?.documentId || "",
    role: (initialData?.role as Role) || "client",
    isActive: initialData?.isActive ?? true,
    sendEmail: false,
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
        />
      </div>

      <Input
        label="Correo Electrónico"
        type="email"
        placeholder="Ej: juan.perez@empresa.com"
        value={formData.email}
        onChange={(e) => handleChange("email", e.target.value)}
        required
        leftIcon={<Mail size={16} />}
        hint="Se usará para la facturación y acceso a la App"
      />

      <Input
        label="Identificación / DNI"
        placeholder="Nº de documento"
        value={formData.documentId}
        onChange={(e) => handleChange("documentId", e.target.value)}
        leftIcon={<CreditCard size={16} />}
      />

      <div className="flex flex-col gap-1.5">
        <label 
          htmlFor="role-select"
          className="text-xs font-semibold uppercase tracking-wider text-gray-400"
        >
          Rol del Miembro
        </label>
        <Select 
          value={formData.role} 
          onValueChange={(val: Role) => handleChange("role", val)}
        >
          <SelectTrigger id="role-select" className="w-full h-12 bg-[#111111] border-[#333333] text-white">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-white/30" />
              <SelectValue placeholder="Selecciona un rol" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="client">Cliente</SelectItem>
            <SelectItem value="trainer">Entrenador</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center space-x-3 rounded-lg border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.07]">
          <Checkbox 
            id="isActive" 
            checked={formData.isActive}
            onCheckedChange={(checked) => handleChange("isActive", checked)}
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="isActive"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Estado Activo
            </label>
            <p className="text-xs text-muted-foreground">
              Determina si el miembro tiene acceso actual al gimnasio.
            </p>
          </div>
        </div>

        {!isEdit && (
          <div className="flex items-center space-x-3 rounded-lg border border-primary/10 bg-primary/5 p-4">
            <Checkbox 
              id="sendEmail" 
              checked={formData.sendEmail}
              onCheckedChange={(checked) => handleChange("sendEmail", checked)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="sendEmail"
                className="text-sm font-medium leading-none text-primary"
              >
                Enviar correo de registro
              </label>
              <p className="text-xs text-primary/60">
                Se enviarán las credenciales de acceso al correo vinculado.
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
          loading={isLoading}
          rightIcon={!isLoading && (isEdit ? <ShieldCheck size={18} /> : <Send size={18} />)}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "CREAR MIEMBRO"}
        </Button>
      </div>
    </form>
  );
}
