"use client";

import * as React from "react";
import { type IMembershipPlan } from "@/types/dashboard";
import { 
  Button, 
  Checkbox, 
  Modal, 
  toast, 
  PlanCard as SharedPlanCard, 
  Text 
} from "@workspace/ui/components";
import { Eye, EyeOff, Trash2 } from "lucide-react";
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
    <SharedPlanCard
      plan={plan}
      activeMembersCount={activeMembersCount}
      showMembersCount
      statusBadge={
        !plan.isActive && (
          <span className="text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase text-[9px]">
            Borrador
          </span>
        )
      }
      headerExtra={
        <div className="flex flex-col items-end gap-1.5">
          <Checkbox 
            checked={plan.isVisibleOnSite} 
            disabled 
          />
          <Text as="span" size="xs" className="text-white/40 text-[9px] uppercase font-bold tracking-wide">
            {plan.isVisibleOnSite ? "Web Visible" : "Web Oculto"}
          </Text>
        </div>
      }
      footer={
        <>
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
        </>
      }
    />
  );
}
