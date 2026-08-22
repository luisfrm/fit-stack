"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Modal, Button, Input, Text, toast } from "@workspace/ui/components";
import type { IPlatformOrganization } from "@workspace/shared/types";
import { organizationsService } from "@/lib/services/organizations-service";

interface GrantAiCreditsModalProps {
  readonly initialData: IPlatformOrganization;
  readonly onSuccess?: () => void;
  readonly trigger: React.ReactNode;
}

/**
 * Modal para otorgar créditos IA manuales a una org (tests / top-up).
 * Los créditos se suman al ciclo actual; el usuario del panel los ve al refrescar.
 */
export function GrantAiCreditsModal({ initialData: organization, onSuccess, trigger }: GrantAiCreditsModalProps) {
  const router = useRouter();
  const [credits, setCredits] = React.useState("1000");
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseInt(credits, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Ingresa una cantidad de créditos válida (mayor a 0)");
      return;
    }

    setIsLoading(true);
    try {
      const result = await organizationsService.grantAiCredits(organization.id, parsed);
      toast.success(`${result.granted} créditos IA otorgados a ${organization.name}`);
      await onSuccess?.(); // invalida tag console:orgs (server action del parent)
      router.refresh();    // re-fetchea la RSC
    } catch (error) {
      console.error("Error granting AI credits:", error);
      toast.error("Error al otorgar los créditos IA");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      title="Otorgar Créditos IA"
      description={`Suma créditos al ciclo actual de ${organization.name}. El límite del plan no cambia.`}
      trigger={trigger}
    >
      <form onSubmit={handleSubmit} className="space-y-5 py-2">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Zap className="size-3.5 text-primary" />
          </span>
          <Text size="xs" variant="muted" className="leading-relaxed">
            1 crédito = 1K tokens. Los créditos se acumulan sobre el consumo del ciclo vigente y
            quedan disponibles de inmediato (el usuario refresca el panel).
          </Text>
        </div>

        <Input
          label="Créditos a otorgar"
          type="number"
          min="1"
          max="1000000"
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          placeholder="Ej: 1000"
          required
        />

        <Button type="submit" fullWidth loading={isLoading}>
          Otorgar créditos
        </Button>
      </form>
    </Modal>
  );
}
