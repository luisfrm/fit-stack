"use client";

import * as React from "react";
import {
  Modal,
  Button,
  Input,
  toast,
  Text,
  Separator,
  Title,
  Eyebrow,
  Switch
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
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Gestionar Suscripción"
      description={organization.name}
      size="md"
      className="p-0 overflow-hidden border-t-4 border-primary rounded-2xl"
      contentClassName="p-0 bg-background"
      footer={
        <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3 w-full p-6 bg-muted/5 border-t border-border">
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
            form="add-subscription-form"
            variant="primary"
            disabled={loading || !formData.planId}
            className="flex-1 uppercase font-black text-xs tracking-widest h-12 shadow-lg shadow-primary/20"
          >
            {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
            Confirmar Plan
          </Button>
        </div>
      }
    >
      <div className="bg-primary/10 p-10 flex flex-col items-center gap-4 border-b border-white/5 text-center">
        <div className="size-20 bg-primary/20 rounded-full flex items-center justify-center text-primary animate-pulse">
          <CreditCard size={40} />
        </div>
        <Title size="card" accent="primary" className="mb-0">
          Suscribir Organización
        </Title>
      </div>

      <form id="add-subscription-form" onSubmit={handleSubmit} className="p-8 space-y-8">
        <div className="space-y-6">
          {/* Selector de Planes */}
          <div className="space-y-3">
            <Eyebrow size="sm" accent="muted">Seleccionar Plan SaaS</Eyebrow>
            <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
              {plansLoading ? (
                <div className="flex items-center justify-center py-8 bg-white/5 rounded-xl border border-white/5 text-slate-500 italic text-xs uppercase tracking-widest font-bold">
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
                    "flex items-center justify-between p-4 h-auto rounded-xl border transition-all cursor-pointer group text-left w-full outline-none normal-case tracking-normal hover:bg-white/10",
                    formData.planId === plan.id.toString()
                      ? "bg-primary/10 border-primary shadow-lg shadow-primary/5 hover:bg-primary/15"
                      : "bg-white/5 border-white/5 hover:border-white/20"
                  )}
                >
                  <div className="flex flex-col items-start pr-2">
                    <Text size="xs" weight="bold" className={cn("uppercase tracking-widest", formData.planId === plan.id.toString() ? "text-primary" : "text-white")}>
                      {plan.name}
                    </Text>
                    <Text size="xs" variant="muted" className="opacity-60 font-medium">
                      ${(Number(plan.price) / 100).toLocaleString()} / {getPlanDurationLabel(plan)}
                    </Text>
                  </div>
                  {formData.planId === plan.id.toString() && (
                    <div className="size-6 rounded-full bg-primary flex items-center justify-center text-black shadow-lg shrink-0">
                      <Check size={14} strokeWidth={4} />
                    </div>
                  )}
                </Button>
              ))}
            </div>
          </div>

          <Separator className="opacity-20" />

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <Eyebrow size="sm" accent="muted">Fecha Inicio</Eyebrow>
              <div className="relative">
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="bg-white/5 border-white/10 h-12 text-xs uppercase font-bold pl-10"
                  required
                />
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary opacity-60" />
              </div>
            </div>
            <div className="space-y-3">
              <Eyebrow size="sm" accent="muted">Fecha Fin</Eyebrow>
              <div className="relative">
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="bg-white/5 border-white/10 h-12 text-xs uppercase font-bold pl-10"
                  required
                />
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary opacity-60" />
              </div>
            </div>
          </div>

          {/* Trial & Price Override */}
          <div className="bg-white/5 p-6 rounded-3xl border border-white/5 space-y-6">
            <button
              type="button"
              className="flex items-center justify-between cursor-pointer group w-full text-left outline-none p-0 bg-transparent border-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-lg"
              onClick={() => setFormData({ ...formData, isTrial: !formData.isTrial })}
            >
              <div className="flex items-center gap-4">
                <div className={cn("p-3 rounded-xl transition-colors", formData.isTrial ? "bg-info/20 text-info" : "bg-white/5 text-slate-500")}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <Text size="xs" weight="bold" className="uppercase tracking-widest">Suscripción de Prueba</Text>
                  <Text size="xs" variant="muted" className="italic transition-opacity opacity-40 group-hover:opacity-100">Costo total $0.00</Text>
                </div>
              </div>
              <Switch checked={formData.isTrial} onCheckedChange={() => setFormData({ ...formData, isTrial: !formData.isTrial })} />
            </button>

            {!formData.isTrial && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-300">
                <Eyebrow size="sm" accent="muted" className="mb-2">Precio personalizado</Eyebrow>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">$</span>
                  <Input
                    id="priceOverride"
                    value={formData.priceOverride}
                    onChange={(e) => setFormData({ ...formData, priceOverride: e.target.value })}
                    placeholder="Ej: 99.99"
                    className="bg-white/5 border-white/5 h-12 text-sm font-bold pl-8"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
