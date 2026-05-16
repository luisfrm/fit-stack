"use client";

import * as React from "react";
import { ShieldOff, Phone, Mail, MessageCircle, LogOut } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { sessionService } from "@/lib/services/session-service";

const CONTACT_PHONE = "+58 424-1234567";
const CONTACT_WHATSAPP = "https://wa.me/584241234567";
const CONTACT_EMAIL = "soporte@fit-stack.com";

export default function NoSubscriptionPage() {
  const router = useRouter();

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_PHONE.replace(/[-\s]/g, ""));
    } catch {
      console.error("Failed to copy");
    }
  };

  const handleLogout = async () => {
    await sessionService.signOut(() => {
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div className="min-h-svh flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 mb-6">
            <ShieldOff className="w-10 h-10 text-red-400" />
          </div>
          <Text size="lg" weight="bold" className="text-white mb-2">
            Suscripción inactiva
          </Text>
          <Text size="sm" variant="muted" className="text-slate-400 max-w-sm">
            Tu plan ha vencido o fue cancelado. El acceso al sistema está temporalmente restringido.
          </Text>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-widest mb-4">
            Contacta al equipo de Fit-Stack
          </Text>

          <div className="flex flex-col gap-3">
            <a
              href={CONTACT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-colors"
            >
              <MessageCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-left">
                <Text size="sm" weight="semibold" className="text-emerald-200">
                  WhatsApp
                </Text>
                <Text size="xs" variant="muted" className="text-emerald-200/60 font-mono">
                  {CONTACT_PHONE}
                </Text>
              </div>
            </a>

            <button
              onClick={handleCopyPhone}
              className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors w-full text-left"
            >
              <Phone className="w-5 h-5 text-slate-400 shrink-0" />
              <div className="text-left">
                <Text size="sm" weight="semibold" className="text-slate-200">
                  Teléfono
                </Text>
                <Text size="xs" variant="muted" className="text-slate-400 font-mono">
                  {CONTACT_PHONE}
                </Text>
              </div>
            </button>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <Mail className="w-5 h-5 text-slate-400 shrink-0" />
              <div className="text-left">
                <Text size="sm" weight="semibold" className="text-slate-200">
                  Email
                </Text>
                <Text size="xs" variant="muted" className="text-slate-400 font-mono">
                  {CONTACT_EMAIL}
                </Text>
              </div>
            </a>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full text-slate-400 hover:text-slate-200 hover:bg-white/5"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}