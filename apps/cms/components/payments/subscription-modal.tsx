"use client";

import * as React from "react";
import { Modal, toast, Button } from "@workspace/ui/components";
import { SubscriptionForm } from "./subscription-form";
import { subscriptionsService } from "@/lib/services/subscriptions-service";
import { MemberForm } from "../members/member-form";
import { membersService } from "@/lib/services/members-service";
import { IMember } from "@/types/dashboard";

interface SubscriptionModalProps {
  readonly trigger: React.ReactNode;
  readonly onSuccess?: () => void;
  readonly initialMember?: IMember | null;
}

export function SubscriptionModal({ trigger, onSuccess, initialMember }: SubscriptionModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  
  // Workflow states
  const [view, setView] = React.useState<'payment' | 'member'>('payment');
  const [newMember, setNewMember] = React.useState<IMember | null>(initialMember ?? null);

  // Sync with prop when modal opens/changes
  React.useEffect(() => {
    if (initialMember) {
      setNewMember(initialMember);
    }
  }, [initialMember, isOpen]);

  // Reset workflow when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setView('payment');
        setNewMember(initialMember ?? null);
      }, 300); // Wait for animation to finish
    }
  }, [isOpen, initialMember]);

  const handleSubmit = async (formData: any) => {
    setIsLoading(true);
    try {
      await subscriptionsService.create(formData);
      toast.success("Suscripción registrada exitosamente.");
      onSuccess?.();
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Fallo al registrar la suscripción");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMemberCreate = async (memberData: Partial<IMember>, sendInvite: boolean) => {
    setIsLoading(true);
    try {
      const created = await membersService.createMember(memberData, sendInvite);
      toast.success(`Cliente ${created.firstName} creado correctamente.`);
      setNewMember(created);
      setView('payment'); // Go back to payment with the new member selected
    } catch (error: any) {
      toast.error(error.message || "Error al crear el cliente");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title={view === 'payment' ? "Registrar Nuevo Pago" : "Nuevo Cliente"}
      description={view === 'payment' 
        ? "Vincula un miembro a un nivel de membresía activo para gestionar su ingreso y ciclo de facturación."
        : "Completa los datos básicos para registrar al cliente en el sistema antes de procesar su pago."
      }
      isScrollable={true}
    >
      <div className="pt-3">
        {/* Subscription Form (Always mounted to preserve state, but hidden when creating member) */}
        <div className={view === 'payment' ? "animate-in fade-in duration-300" : "hidden"}>
          <SubscriptionForm 
            onSubmit={handleSubmit} 
            isLoading={isLoading} 
            initialMember={newMember}
            onAddMemberClick={() => setView('member')}
          />
        </div>

        {/* Member Form (Conditionally rendered for a fresh start each time) */}
        {view === 'member' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-4">
              <Button 
                variant="link"
                onClick={() => setView('payment')}
                className="text-[10px] flex items-center gap-1"
              >
                ← VOLVER AL PAGO
              </Button>
            </div>
            <MemberForm 
              onSubmit={handleMemberCreate}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
