"use client";

import * as React from "react";
import { type IMembershipPlan } from "@/types/dashboard";
import { Card, Text, Button, Checkbox, Title, Modal, toast } from "@workspace/ui/components";
import { CheckCircle2, Eye, EyeOff, Trash2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { PlanModal } from "@/components/memberships/plan-modal";
import { plansService } from "@/lib/services/plans-service";

interface PlanCardProps {
  readonly plan: IMembershipPlan;
  readonly onUpdate: () => void;
  readonly activeMembersCount?: number; 
}

export function PlanCard({ plan, onUpdate, activeMembersCount = 0 }: PlanCardProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isToggling, setIsToggling] = React.useState(false);

  const priceFormatted = new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: plan.currency || "USD",
  }).format(plan.price / 100);

  const handleToggleVisibility = async () => {
    if (!plan.id) return;
    try {
      setIsToggling(true);
      await plansService.update(plan.id, { 
        isVisibleOnSite: !plan.isVisibleOnSite 
      });
      toast.success(
        plan.isVisibleOnSite 
          ? "Plan ocultado correctamente" 
          : "Plan publicado correctamente"
      );
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Error al cambiar visibilidad");
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!plan.id) return;
    try {
      setIsDeleting(true);
      await plansService.delete(plan.id);
      toast.success("Plan eliminado correctamente");
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar el plan");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card 
      className={cn(
        "relative flex flex-col p-6 rounded-2xl border-2 transition-all overflow-hidden bg-zinc-900",
        plan.isPopular 
          ? "border-primary shadow-lg shadow-primary/5" 
          : "border-white/5 hover:border-white/10"
      )}
    >
      {/* Etiqueta Popular */}
      {plan.isPopular && (
        <div className="absolute top-0 right-0 bg-primary text-black text-[10px] font-bold tracking-widest px-8 py-1 uppercase transform translate-x-10 translate-y-4 rotate-45 shadow-lg z-20">
          Popular
        </div>
      )}

      {/* Cabecera */}
      <div className="flex items-start justify-between mb-2 z-10">
        <div className="flex flex-col">
          <Text as="span" size="xs" variant="muted" className="uppercase tracking-widest text-slate-500 mb-1 font-bold text-[9px]">
            Nivel de Suscripción
          </Text>
          <Title as="h3" size="sm" className="uppercase text-white leading-none font-black tracking-tighter">
            {plan.name}
          </Title>
        </div>
        <div className="flex flex-col items-end gap-1.5 mt-1">
          <div className="flex items-center gap-2">
            {!plan.isActive && (
              <span className="text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase text-[9px]">
                Borrador
              </span>
            )}
            <Checkbox 
              checked={plan.isVisibleOnSite} 
              disabled 
            />
          </div>
          <Text as="span" size="xs" className="text-white/40 text-[9px] uppercase font-bold tracking-wide">
            {plan.isVisibleOnSite ? "Web Visible" : "Web Oculto"}
          </Text>
        </div>
      </div>

      {/* Precio */}
      <div className="flex items-baseline gap-2 my-8">
        <Text as="p" className="text-4xl font-black text-white tracking-tighter">
          {priceFormatted}
        </Text>
        <div className="flex flex-col">
          <Text as="span" size="xs" className="text-primary font-bold uppercase leading-none mb-0.5 text-[10px]">
            {plan.currency}
          </Text>
          <Text as="span" size="xs" variant="muted" className="text-white/30 uppercase text-[9px] font-bold">
            /mes
          </Text>
        </div>
      </div>

      {/* Módulo de Features (Lista de Checks) */}
      <div className="flex flex-col gap-3 mb-8 flex-1">
        {plan.features?.map((feature) => (
          <div key={`${plan.id}-${feature.substring(0, 5)}`} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 opacity-80" />
            <Text as="span" size="sm" className="text-white/70 leading-tight font-medium">
              {feature}
            </Text>
          </div>
        ))}
      </div>

      {/* Indicador de Miembros Activos */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 rounded-xl mb-6 border border-white/5",
        plan.isPopular ? "bg-primary/5 border-primary/10" : "bg-black/20"
      )}>
        <Text as="span" size="xs" className="uppercase tracking-widest text-slate-500 font-black text-[9px]">
          Miembros
        </Text>
        <Text as="span" weight="bold" className={plan.isPopular ? "text-primary" : "text-white"}>
          {activeMembersCount}
        </Text>
      </div>

      {/* Botonera Inferior */}
      <div className="flex items-center gap-2 mt-auto">
        <PlanModal 
          planData={plan} 
          onSuccess={onUpdate}
          trigger={
            <Button 
              className={cn(
                "flex-1 uppercase font-black tracking-widest h-11 text-xs transition-all",
                plan.isPopular 
                  ? "bg-primary text-black hover:bg-primary/90 shadow-lg shadow-primary/10" 
                  : "bg-white/5 text-white hover:bg-white/10"
              )}
            >
              Editar
            </Button>
          }
        />
        
        <Button 
          variant="outlined" 
          size="icon" 
          className={cn(
            "h-11 w-11 shrink-0 border-white/5 hover:bg-white/5 bg-transparent transition-colors",
            isToggling && "opacity-50 cursor-not-allowed"
          )}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleVisibility();
          }}
          disabled={isToggling}
          title={plan.isVisibleOnSite ? "Ocultar en Web" : "Mostrar en Web"}
        >
          {plan.isVisibleOnSite ? (
            <Eye className="size-4 text-primary" />
          ) : (
            <EyeOff className="size-4 text-slate-500" />
          )}
        </Button>

        <Modal
          title="Eliminar Plan"
          description={`¿Deseas eliminar el plan "${plan.name}"?`}
          trigger={
            <Button 
              variant="outlined" 
              size="icon" 
              className="h-11 w-11 shrink-0 border-red-500/10 hover:bg-red-500/10 bg-transparent"
              title="Eliminar Plan"
            >
              <Trash2 className="size-4 text-red-500/70" />
            </Button>
          }
          footer={
            <div className="flex justify-end gap-3 w-full">
              <Button 
                variant="outlined" 
                onClick={() => {}} 
                className="border-white/5"
              >
                Cancelar
              </Button>
              <Button 
                variant="danger" 
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 font-bold"
              >
                {isDeleting ? "..." : "Eliminar"}
              </Button>
            </div>
          }
        >
          <div className="py-2">
            <Text size="sm" variant="muted">
              Esta acción es irreversible y afectará a los miembros asociados.
            </Text>
          </div>
        </Modal>
      </div>
    </Card>
  );
}
