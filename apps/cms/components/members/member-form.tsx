"use client";

import * as React from "react";
import {
  Input,
  Button,
  Checkbox,
  ToggleGroup,
  ToggleGroupItem,
  Label,
  Skeleton,
} from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";
import { User, Mail, CreditCard, ShieldCheck, Send } from "lucide-react";
import { useRoles } from "@/lib/hooks/use-rbac";

interface MemberFormProps {
  readonly initialData?: IMember;
  readonly onSubmit: (data: Partial<IMember>, sendInvite: boolean) => void;
  readonly isLoading?: boolean;
}

export function MemberForm({ initialData, onSubmit, isLoading }: MemberFormProps) {
  const isEdit = !!initialData?.id;
  const { data: roles = [], isLoading: isLoadingRoles } = useRoles();
  const [sendInvite, setSendInvite] = React.useState(!isEdit);

  const [formData, setFormData] = React.useState<Partial<IMember>>({
    firstName: initialData?.firstName ?? "",
    lastName: initialData?.lastName ?? "",
    email: initialData?.email ?? "",
    documentId: initialData?.documentId ?? "",
    roleId: initialData?.roleId ?? 0,
    isActive: initialData?.isActive ?? true,
  });

  // Asignar rol por defecto si es nuevo y cargan los roles
  React.useEffect(() => {
    if (!isEdit && !formData.roleId && roles.length > 0) {
      const defaultRole = roles.find((r) => r.name.toLowerCase() === "client") || roles[0];
      if (defaultRole) {
        setFormData(prev => ({ ...prev, roleId: defaultRole.id }));
      }
    }
  }, [isEdit, roles, formData.roleId]);

  const handleChange = (field: keyof IMember, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData, sendInvite);
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
          leftIcon={<User size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Correo Electrónico"
          type="email"
          placeholder="Ej: juan.perez@empresa.com"
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

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Rol del Miembro
        </Label>
        
        {isLoadingRoles ? (
          <div className="grid grid-cols-4 gap-2 w-full">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <ToggleGroup
            type="single"
            value={formData.roleId ? formData.roleId.toString() : ""}
            onValueChange={(val: any) => {
              if (val && typeof val === "string") {
                handleChange("roleId", Number.parseInt(val, 10));
              }
            }}
            className="grid grid-cols-4 gap-2 w-full"
          >
            {roles.map((r) => (
              <ToggleGroupItem
                key={r.id}
                value={r.id.toString()}
                className="h-10 w-full text-xs capitalize justify-center"
              >
                {r.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center space-x-3 rounded-lg border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.07]">
          <Checkbox
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => handleChange("isActive", checked)}
          />
          <div className="grid gap-1.5 leading-none">
            <Label
              htmlFor="isActive"
              className="text-sm font-medium leading-none text-white"
            >
              Estado Activo
            </Label>
            <p className="text-xs text-muted-foreground">
              Determina si el miembro tiene acceso actual al gimnasio.
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
              <Label
                htmlFor="sendEmail"
                className="text-sm font-bold leading-none text-primary"
              >
                Enviar correo de registro
              </Label>
              <p className="text-xs text-primary/60">
                Se enviarán las credenciales de acceso al correo vinculado para crear su contraseña.
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
