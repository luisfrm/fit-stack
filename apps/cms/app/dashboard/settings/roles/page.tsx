"use client";

import * as React from "react";
import {
  Button,
  Text,
  toast,
  Input,
  Checkbox,
  Modal,
  Label
} from "@workspace/ui/components";
import { Shield, Plus, Check, Loader2 } from "lucide-react";
import { rbacService, type Role } from "@/lib/services/rbac-service";
import { RolesTable } from "@/components/settings/roles-table";
import { useRoles, usePermissions } from "@/lib/hooks/use-rbac";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export default function RolesPage() {
  const queryClient = useQueryClient();

  // Queries
  const { data: roles = [], isLoading: loadingRoles } = useRoles();
  const { data: permissions = [], isLoading: loadingPermissions } = usePermissions();

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [currentRole, setCurrentRole] = React.useState<Partial<Role> | null>(null);
  const [selectedPermissions, setSelectedPermissions] = React.useState<number[]>([]);

  // Mutations
  const upsertMutation = useMutation({
    mutationFn: rbacService.upsertRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rbac", "roles"] });
      toast.success(currentRole?.id ? "Rol actualizado" : "Rol creado");
      setIsModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Error al guardar el rol");
    }
  });

  const seedMutation = useMutation({
    mutationFn: rbacService.seed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rbac", "roles"] });
      toast.success("Roles base inicializados.");
    },
    onError: () => {
      toast.error("Fallo al inicializar roles base");
    }
  });

  const handleOpenModal = (role?: Role) => {
    if (role) {
      setCurrentRole(role);
      setSelectedPermissions(role.rolePermissions?.map(rp => rp.permissionId) || []);
    } else {
      setCurrentRole({ name: "", description: "" });
      setSelectedPermissions([]);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!currentRole?.name) return;

    upsertMutation.mutate({
      id: currentRole.id,
      name: currentRole.name,
      description: currentRole.description || "",
      permissionIds: selectedPermissions
    });
  };

  const togglePermission = (id: number) => {
    setSelectedPermissions(prev =>
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const isLoading = loadingRoles || loadingPermissions;

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader
        title={
          <>
            ROLES Y <br />
            <span className="text-primary italic">PERMISOS</span>
          </>
        }
        description="Configura los niveles de acceso de tu equipo"
        iconName="Shield"
      >
        <Modal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          trigger={
            <Button onClick={() => handleOpenModal()} leftIcon={<Plus size={18} />}>
              NUEVO ROL
            </Button>
          }
          title={`${currentRole?.id ? "EDITAR" : "CREAR"} ROL`}
          size="lg"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>CANCELAR</Button>
              <Button 
                type="submit" 
                form="role-form" 
                loading={upsertMutation.isPending} 
                leftIcon={!upsertMutation.isPending && <Check size={18} />}
              >
                {upsertMutation.isPending ? "GUARDANDO..." : "GUARDAR ROL"}
              </Button>
            </div>
          }
        >
          <form id="role-form" onSubmit={handleSave} className="space-y-6 py-4">
            <div className="grid gap-4">
              <Input
                label="Nombre del Rol"
                placeholder="Ej: Manager, Entrenador..."
                value={currentRole?.name || ""}
                onChange={(e) => setCurrentRole({ ...currentRole, name: e.target.value })}
                required
                className="uppercase font-bold tracking-tight italic"
              />
              <Input
                label="Descripción"
                placeholder="Breve explicación de las funciones del rol"
                value={currentRole?.description || ""}
                onChange={(e) => setCurrentRole({ ...currentRole, description: e.target.value })}
              />
            </div>

            <div className="space-y-4">
              <Text size="sm" weight="bold" uppercase className="tracking-widest opacity-50">Permisos del Sistema</Text>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                {permissions.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${selectedPermissions.includes(p.id)
                      ? "bg-primary/5 border-primary/50 shadow-[0_0_20px_-10px_var(--color-primary)]"
                      : "bg-white/3 border-white/10 hover:border-white/20"
                      }`}
                  >
                    <Checkbox
                      id={`perm-${p.id}`}
                      checked={selectedPermissions.includes(p.id)}
                      onCheckedChange={() => togglePermission(p.id)}
                      className="mt-1"
                    />
                    <Label
                      htmlFor={`perm-${p.id}`}
                      className="flex flex-col gap-1 cursor-pointer"
                    >
                      <Text size="sm" weight="bold" className="tracking-tight uppercase italic">{p.name}</Text>
                      <Text size="xs" variant="muted" className="opacity-70">{p.description}</Text>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </Modal>
      </DashboardHeader>

      {roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-white/10 rounded-2xl bg-white/5 space-y-4">
          <Shield size={64} className="text-white/20" />
          <Text size="lg" weight="medium">No hay roles configurados</Text>
          <Button 
            variant="outlined" 
            loading={seedMutation.isPending}
            onClick={() => seedMutation.mutate()}
          >
            INICIALIZAR ROLES BASE
          </Button>
        </div>
      ) : (
        <RolesTable
          roles={roles}
          onEdit={handleOpenModal}
          loading={loadingRoles}
        />
      )}
    </div>
  );
}
