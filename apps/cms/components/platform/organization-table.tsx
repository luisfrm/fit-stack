"use client";

import * as React from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  Text,
  Badge,
  Button
} from "@workspace/ui/components";
import { ExternalLink, Edit2, CreditCard, Building2 } from "lucide-react";
import { type IPlatformOrganization } from "@workspace/shared/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface OrganizationTableProps {
  organizations: IPlatformOrganization[];
  loading: boolean;
  onEdit: (org: IPlatformOrganization) => void;
  onAddSubscription: (org: IPlatformOrganization) => void;
}

export function OrganizationTable({ 
  organizations, 
  loading, 
  onEdit, 
  onAddSubscription 
}: OrganizationTableProps) {
  
  if (loading) {
    return (
      <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden animate-pulse">
        <div className="h-12 bg-white/5 w-full mb-px" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-white/5 w-full mb-px opacity-50" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader className="bg-white/5">
          <TableRow className="hover:bg-transparent border-white/10">
            <TableHead className="w-[300px] uppercase text-[10px] font-black tracking-widest text-slate-400">Organización</TableHead>
            <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400">Suscripción Actual</TableHead>
            <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => {
            const sub = org.latestSubscription;
            const hasSub = !!sub;
            
            return (
              <TableRow key={org.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 overflow-hidden">
                      {org.logo ? (
                        <img src={org.logo} alt={org.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 size={20} />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <Text size="sm" weight="bold" className="text-white truncate uppercase tracking-tight font-display italic">
                        {org.name}
                      </Text>
                      <Text size="xs" variant="muted" className="truncate opacity-60">
                        {org.slug}.fit-stack.com
                      </Text>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {hasSub ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={sub.status === 'active' ? 'success' : 'warning'} className="uppercase text-[9px] font-black tracking-tighter h-5">
                          {sub.planName || 'Plan Personalizado'}
                        </Badge>
                        {sub.isTrial && (
                          <Badge variant="info" className="uppercase text-[9px] font-black tracking-tighter h-5 bg-blue-500/20 text-blue-400 border-blue-500/20">
                            Prueba
                          </Badge>
                        )}
                      </div>
                      <Text size="xs" className="text-slate-500 font-medium">
                        Expira: <span className="text-slate-300 font-bold">
                          {format(new Date(sub.endDate), "dd MMM yyyy", { locale: es })}
                        </span>
                      </Text>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <Text size="xs" weight="bold" className="text-slate-600 uppercase tracking-widest italic">Sin Suscripción</Text>
                      <Text size="xs" variant="muted">No se han detectado planes activos.</Text>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button 
                      variant="outlined" 
                      size="sm" 
                      onClick={() => onAddSubscription(org)}
                      className="bg-transparent border-white/10 hover:bg-white/10 h-9 text-[10px] font-black uppercase tracking-widest px-3"
                    >
                      <CreditCard size={14} className="mr-2" />
                      Plan
                    </Button>
                    <Button 
                      variant="outlined" 
                      size="sm" 
                      onClick={() => onEdit(org)}
                      className="bg-transparent border-white/10 hover:bg-white/10 h-9 text-[10px] font-black uppercase tracking-widest px-3"
                    >
                      <Edit2 size={14} className="mr-2" />
                      Editar
                    </Button>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => window.location.href = `/dashboard/platform/organizations/${org.id}`}
                      className="h-9 w-9 p-0 flex items-center justify-center shrink-0"
                    >
                      <ExternalLink size={16} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
