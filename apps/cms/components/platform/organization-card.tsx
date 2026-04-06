"use client";

import * as React from "react";
import { 
  Text,
  Badge,
  Button,
  Separator
} from "@workspace/ui/components";
import { ExternalLink, Edit2, CreditCard, Building2, Calendar, ShieldCheck } from "lucide-react";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@workspace/ui/lib/utils";

interface OrganizationCardProps {
  organization: IPlatformOrganization;
  onEdit: (org: IPlatformOrganization) => void;
  onAddSubscription: (org: IPlatformOrganization) => void;
}

export function OrganizationCard({ 
  organization: org, 
  onEdit, 
  onAddSubscription 
}: OrganizationCardProps) {
  const sub = org.latestSubscription;
  const hasSub = !!sub;
  
  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:border-primary/20 transition-all space-y-4">
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 overflow-hidden">
            {org.logo ? (
              <img src={org.logo} alt={org.name} className="w-full h-full object-cover" />
            ) : (
              <Building2 size={24} />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <Text size="sm" weight="bold" className="text-white truncate uppercase tracking-tight font-display italic leading-tight">
              {org.name}
            </Text>
            <Text size="xs" variant="muted" className="truncate opacity-60">
              {org.slug}.fit-stack.com
            </Text>
          </div>
        </div>
        <Button 
          variant="primary" 
          size="sm" 
          onClick={() => window.location.href = `/dashboard/platform/organizations/${org.id}`}
          className="h-10 w-10 p-0 flex items-center justify-center shrink-0 rounded-xl"
        >
          <ExternalLink size={18} />
        </Button>
      </div>

      <Separator className="bg-white/5" />

      <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <Text size="xs" weight="bold" variant="muted" className="uppercase tracking-widest leading-none">Suscripción</Text>
          {hasSub ? (
            <div className="flex gap-1.5 items-center">
              <Badge variant={sub.status === 'active' ? 'success' : 'warning'} className="uppercase text-[9px] font-black tracking-tighter h-5">
                {sub.planName || 'Personalizada'}
              </Badge>
              {sub.isTrial && (
                <Badge variant="info" className="uppercase text-[9px] font-black tracking-tighter h-5 bg-blue-500/20 text-blue-400 border-blue-500/20">
                  Prueba
                </Badge>
              )}
            </div>
          ) : (
             <Badge variant="outlined" className="uppercase text-[9px] font-black tracking-tighter h-5 border-white/10 text-slate-500">
               Inactiva
             </Badge>
          )}
        </div>

        {hasSub ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar size={14} className="text-primary/50" />
            <Text size="xs" className="font-semibold italic">
              Expira: <span className="text-white font-black uppercase tracking-tighter">
                {format(new Date(sub.endDate), "dd MMM yyyy", { locale: es })}
              </span>
            </Text>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500 opacity-50">
            <ShieldCheck size={14} />
            <Text size="xs" weight="bold" className="uppercase italic tracking-tighter">Esperando primera suscripción</Text>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button 
          variant="outlined" 
          size="sm" 
          onClick={() => onAddSubscription(org)}
          className="bg-transparent border-white/10 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest py-3 h-auto"
        >
          <CreditCard size={14} className="mr-2" />
          Plan
        </Button>
        <Button 
          variant="outlined" 
          size="sm" 
          onClick={() => onEdit(org)}
          className="bg-transparent border-white/10 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest py-3 h-auto"
        >
          <Edit2 size={14} className="mr-2" />
          Editar
        </Button>
      </div>
    </div>
  );
}
