"use client";

import * as React from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  Button,
  Input,
  toast,
  Text,
  Label
} from "@workspace/ui/components";
import { Building2, Save, Loader2, Globe } from "lucide-react";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { organizationsService } from "@/lib/services/organizations-service";

interface OrganizationModalProps {
  organizationData?: IPlatformOrganization;
  onSuccess: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OrganizationModal({ 
  organizationData, 
  onSuccess, 
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: OrganizationModalProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const [loading, setLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: "",
    slug: "",
    logo: "",
  });

  const isEdit = !!organizationData;

  React.useEffect(() => {
    if (organizationData && open) {
      setFormData({
        name: organizationData.name,
        slug: organizationData.slug || "",
        logo: organizationData.logo || "",
      });
    } else if (!isEdit && open) {
      setFormData({ name: "", slug: "", logo: "" });
    }
  }, [organizationData, open, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return toast.error("El nombre es requerido");

    try {
      setLoading(true);
      if (isEdit) {
        await organizationsService.update(organizationData.id, formData);
        toast.success("Organización actualizada con éxito");
      } else {
        await organizationsService.create(formData);
        toast.success("Organización creada con éxito");
      }
      onSuccess();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al procesar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-white/10 text-white p-0 overflow-hidden rounded-3xl">
        <div className="bg-primary/10 p-6 flex items-center gap-4 border-b border-white/5">
          <div className="p-3 bg-primary/20 rounded-2xl text-primary">
            <Building2 size={24} />
          </div>
          <DialogHeader className="p-0 border-none">
            <DialogTitle className="text-xl font-black uppercase tracking-tighter italic font-display">
              {isEdit ? "Editar Organización" : "Nueva Organización"}
            </DialogTitle>
            <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold opacity-60">
              Datos básicos de identidad corporativa
            </Text>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs uppercase font-black tracking-widest text-slate-400">Nombre de la Organización</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: PowerGym Center"
                className="bg-white/5 border-white/10 h-12 text-sm uppercase font-bold tracking-tight"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug" className="text-xs uppercase font-black tracking-widest text-slate-400">Subdominio / Slug</Label>
              <div className="relative">
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="powergym"
                  className="bg-white/5 border-white/10 h-12 text-sm lowercase font-bold tracking-tight pr-24"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-white/5 rounded text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                  .fit-stack.com
                </div>
              </div>
              <Text size="xs" variant="muted" className="italic flex items-center gap-1.5 mt-1">
                <Globe size={12} className="text-primary/50" />
                Identificador único para la URL de la plataforma.
              </Text>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo" className="text-xs uppercase font-black tracking-widest text-slate-400">URL del Logo (Opcional)</Label>
              <Input
                id="logo"
                value={formData.logo}
                onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                placeholder="https://su-web.com/logo.png"
                className="bg-white/5 border-white/10 h-12 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outlined"
              onClick={() => setOpen(false)}
              className="flex-1 uppercase font-black text-xs tracking-widest h-12 border-white/5 hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="flex-1 uppercase font-black text-xs tracking-widest h-12 shadow-lg shadow-primary/20"
            >
              {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
              {isEdit ? "Guardar Cambios" : "Crear Organización"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
