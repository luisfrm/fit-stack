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
  Label,
  Separator
} from "@workspace/ui/components";
import { CreditCard, Save, Loader2, Calendar, ShieldCheck, Check } from "lucide-react";
import { type IPlatformOrganization, type IPlatformPlan } from "@workspace/shared/types";
import { organizationsService } from "@/lib/services/organizations-service";
import { platformPlansService } from "@/lib/services/platform-plans-service";
import { format, addYears } from "date-fns";
import { cn } from "@workspace/ui/lib/utils";

interface AddSubscriptionModalProps {
  readonly organization: IPlatformOrganization;
  readonly onSuccess: () => void;
  readonly trigger?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function AddSubscriptionModal({
  organization,
  onSuccess,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: AddSubscriptionModalProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  const [loading, setLoading] = React.useState(false);
  const [plans, setPlans] = React.useState<IPlatformPlan[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(false);

  const [formData, setFormData] = React.useState({
    planId: "",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(addYears(new Date(), 1), "yyyy-MM-dd"),
    isTrial: false,
    priceOverride: "",
  });

  const loadPlans = React.useCallback(async () => {
    try {
      setPlansLoading(true);
      const data = await platformPlansService.getAll();
      setPlans(data.filter(p => p.isActive));
    } catch (err: any) {
      console.error("[LOAD_PLANS_ERROR]", err);
      toast.error("Error al cargar los planes disponibles");
    } finally {
      setPlansLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      loadPlans();
      // Reset dates on open
      setFormData(prev => ({
        ...prev,
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: format(addYears(new Date(), 1), "yyyy-MM-dd"),
      }));
    }
  }, [open, loadPlans]);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!formData.planId) return toast.error("Debes seleccionar un plan");

    try {
      setLoading(true);
      await organizationsService.addSubscription(organization.id, {
        planId: Number.parseInt(formData.planId),
        startDate: formData.startDate,
        endDate: formData.endDate,
        isTrial: formData.isTrial,
        priceOverride: formData.priceOverride || undefined,
      });
      toast.success("Nueva suscripción asignada con éxito");
      onSuccess();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al asignar suscripción");
    } finally {
      setLoading(false);
    }
  };

  const getPlanDurationLabel = (plan: IPlatformPlan) => {
    const { durationValue: v, durationUnit: u } = plan;
    const isSingular = v === 1;

    const unitMap: Record<string, { singular: string; plural: string }> = {
      day: { singular: "día", plural: "días" },
      week: { singular: "semana", plural: "semanas" },
      month: { singular: "mes", plural: "meses" },
      year: { singular: "año", plural: "años" }
    };

    const unit = unitMap[u] || { singular: u, plural: `${u}s` };
    return isSingular ? unit.singular : `${v} ${unit.plural}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-white/10 text-white p-0 overflow-hidden rounded-3xl">
        <div className="bg-primary/10 p-6 flex flex-col items-center gap-4 border-b border-white/5 text-center">
          <div className="p-4 bg-primary/20 rounded-full text-primary animate-pulse">
            <CreditCard size={32} />
          </div>
          <DialogHeader className="p-0 border-none items-center">
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic font-display">
              Gestionar Suscripción
            </DialogTitle>
            <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold opacity-60">
              {organization.name}
            </Text>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            {/* Selector de Planes */}
            <div className="space-y-2">
              <Label className="text-xs uppercase font-black tracking-widest text-slate-400">Seleccionar Plan SaaS</Label>
              <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                {plansLoading ? (
                  <div className="flex items-center justify-center py-4 bg-white/5 rounded-xl border border-white/5 text-slate-500 italic text-xs uppercase tracking-widest font-bold">
                    <Loader2 className="animate-spin mr-2" size={14} />
                    Consultando niveles...
                  </div>
                ) : plans.map((plan) => (
                  <Button
                    key={plan.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, planId: plan.id.toString() })}
                    variant="ghost"
                    className={cn(
                      "flex items-center justify-between p-3 h-auto rounded-xl border transition-all cursor-pointer group text-left w-full outline-none normal-case tracking-normal hover:bg-white/10",
                      formData.planId === plan.id.toString()
                        ? "bg-primary/10 border-primary shadow-lg shadow-primary/5 hover:bg-primary/15"
                        : "bg-white/5 border-white/5 hover:border-white/20"
                    )}
                  >
                    <div className="flex flex-col items-start">
                      <Text size="xs" weight="bold" className={cn("uppercase tracking-widest", formData.planId === plan.id.toString() ? "text-primary" : "text-white")}>
                        {plan.name}
                      </Text>
                      <Text size="xs" variant="muted" className="opacity-60 font-medium">
                        ${(Number(plan.price) / 100).toLocaleString()} / {getPlanDurationLabel(plan)}
                      </Text>
                    </div>
                    {formData.planId === plan.id.toString() && (
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-black shadow-lg shrink-0">
                        <Check size={14} strokeWidth={4} />
                      </div>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-xs uppercase font-black tracking-widest text-slate-400">Fecha Inicio</Label>
                <div className="relative">
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="bg-white/5 border-white/10 h-11 text-xs uppercase font-bold pl-10"
                    required
                  />
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-xs uppercase font-black tracking-widest text-slate-400">Fecha Fin</Label>
                <div className="relative">
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="bg-white/5 border-white/10 h-11 text-xs uppercase font-bold pl-10"
                    required
                  />
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
                </div>
              </div>
            </div>

            {/* Trial & Price Override */}
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-4">
              <button
                type="button"
                className="flex items-center justify-between cursor-pointer group w-full text-left outline-none p-0 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-lg"
                onClick={() => setFormData({ ...formData, isTrial: !formData.isTrial })}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg transition-colors", formData.isTrial ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-slate-500")}>
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <Text size="xs" weight="bold" className="uppercase tracking-widest">Suscripción de Prueba</Text>
                    <Text size="xs" variant="muted" className="italic transition-opacity opacity-60 group-hover:opacity-100">Establecer importe como $0.00</Text>
                  </div>
                </div>
                <div className={cn(
                  "w-10 h-5 rounded-full relative transition-colors",
                  formData.isTrial ? "bg-blue-500" : "bg-white/20"
                )}>
                  <div className={cn(
                    "absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-md",
                    formData.isTrial ? "right-1" : "left-1"
                  )} />
                </div>
              </button>

              {!formData.isTrial && (
                <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-300">
                  <Label htmlFor="priceOverride" className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1.5 block">Precio personalizado (Opcional)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">$</span>
                    <Input
                      id="priceOverride"
                      value={formData.priceOverride}
                      onChange={(e) => setFormData({ ...formData, priceOverride: e.target.value })}
                      placeholder="Ej: 99.99"
                      className="bg-white/5 border-white/5 h-10 text-sm font-bold pl-7"
                    />
                  </div>
                </div>
              )}
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
              disabled={loading || !formData.planId}
              className="flex-1 uppercase font-black text-xs tracking-widest h-12 shadow-lg shadow-primary/20"
            >
              {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
              Confirmar Plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
