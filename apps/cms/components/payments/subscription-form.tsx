"use client";

import * as React from "react";
import { type ISubscription, type IMembershipPlan, type PaginatedMembers } from "@/types/dashboard";
import { membersService } from "@/lib/services/members-service";
import { plansService } from "@/lib/services/plans-service";

import {
  Input,
  Button,
  ToggleGroup,
  ToggleGroupItem
} from "@workspace/ui/components";
import { Search } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { Label } from "@workspace/ui/components/label";

interface SubscriptionFormProps {
  readonly onSubmit: (data: Omit<ISubscription, "id" | "memberName" | "planName">) => Promise<void>;
  readonly isLoading?: boolean;
}

export function SubscriptionForm({ onSubmit, isLoading }: SubscriptionFormProps) {
  const [plans, setPlans] = React.useState<IMembershipPlan[]>([]);
  
  // States 
  const [memberId, setMemberId] = React.useState<number | null>(null);
  const [planId, setPlanId] = React.useState<number | null>(null);
  
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  
  const [startDate, setStartDate] = React.useState(todayStr);
  const [status, setStatus] = React.useState<"active" | "canceled">("active");

  const [memberSearch, setMemberSearch] = React.useState("");
  const debouncedSearch = useDebounce(memberSearch, 500);
  const [searchResults, setSearchResults] = React.useState<PaginatedMembers["data"]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  React.useEffect(() => {
    plansService.getAll().then(setPlans);
  }, []);

  // Buscar miembros dinámicamente
  React.useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      return;
    }
    
    let isMounted = true;
    const fetchMembers = async () => {
      setIsSearching(true);
      try {
        const res = await membersService.getMembers({ query: debouncedSearch, limit: 5 });
        if (isMounted) setSearchResults(res.data);
      } catch (err) {
        console.error("Error buscando miembros", err);
      } finally {
        if (isMounted) setIsSearching(false);
      }
    };

    fetchMembers();
    return () => { isMounted = false; };
  }, [debouncedSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !planId) return;

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(startDateObj);
    endDateObj.setMonth(endDateObj.getMonth() + 1);

    await onSubmit({
      memberId,
      planId,
      startDate: startDateObj.toISOString(),
      endDate: endDateObj.toISOString(),
      status
    });
  };

  const handleSelectMember = (id: number, name: string) => {
    setMemberId(id);
    setMemberSearch(name);
    setSearchResults([]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Selector de Miembro */}
      <div className="space-y-3 relative">
        <Label htmlFor="member-search" className="text-sm font-medium">Buscar Miembro</Label>
        <div className="relative">
          <Search className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input 
            id="member-search"
            placeholder="Escribe el nombre o email..." 
            value={memberSearch}
            onChange={(e) => {
              setMemberSearch(e.target.value);
              if (memberId) setMemberId(null);
            }}
            className="pl-9"
            state={isSearching ? "loading" : "default"}
          />
        </div>
        
        {searchResults.length > 0 && (
          <div className="absolute z-10 w-full bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-xl mt-1">
            {searchResults.map(member => (
              <button
                key={member.id}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-white/5 flex flex-col transition-colors border-b border-white/5 last:border-0"
                onClick={() => member.id && handleSelectMember(member.id, `${member.firstName} ${member.lastName}`)}
              >
                <span className="text-sm font-semibold text-white">{member.firstName} {member.lastName}</span>
                <span className="text-xs text-slate-400">{member.email}</span>
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Planes Toggle Group */}
      <div className="space-y-3">
        <Label id="plan-selection-label" className="text-sm font-medium">Plan de Membresía</Label>
        {plans.length === 0 ? (
          <p className="text-sm text-yellow-500 bg-yellow-500/10 p-3 rounded-lg">Carga planes primero en el módulo de Membresías.</p>
        ) : (
          <ToggleGroup 
            type="single" 
            value={planId ? String(planId) : ""}
            aria-labelledby="plan-selection-label"
            onValueChange={(val) => {
              if (val) setPlanId(Number(val));
            }}
            className="flex flex-wrap gap-2 justify-start"
          >
            {plans.filter(p => p.isVisibleOnSite).map(plan => (
              <ToggleGroupItem 
                key={plan.id} 
                value={String(plan.id)}
                className="rounded-xl border border-white/10 data-[state=on]:bg-primary data-[state=on]:text-black h-auto py-3 px-4 flex flex-col items-start gap-1"
              >
                <span className="font-bold text-sm uppercase">{plan.name}</span>
                <span className="text-xs opacity-80">${plan.price / 100}/mes</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start-date" className="text-sm font-medium">Fecha de Inicio</Label>
          <Input 
            id="start-date"
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label id="status-selection-label" className="text-sm font-medium">Estado del Alta</Label>
          <ToggleGroup 
            type="single" 
            value={status}
            aria-labelledby="status-selection-label"
            onValueChange={(v) => { 
               if(v === "active" || v === "canceled") setStatus(v); 
            }}
            className="flex gap-2"
          >
            <ToggleGroupItem value="active" className="flex-1 rounded-lg">Activo</ToggleGroupItem>
            <ToggleGroupItem value="canceled" className="flex-1 rounded-lg">Inactivo</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <Button type="submit" disabled={isLoading || !memberId || !planId} className="w-full h-12 uppercase tracking-widest font-bold">
        {isLoading ? "PROCESANDO..." : "GENERAR SUSCRIPCIÓN"}
      </Button>
    </form>
  );
}
