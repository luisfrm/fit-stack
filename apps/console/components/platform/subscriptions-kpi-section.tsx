"use client";

import * as React from "react";
import { Card, Text, Skeleton } from "@workspace/ui/components";
import { Users, CalendarCheck, AlertTriangle, ShieldOff } from "lucide-react";

interface SubscriptionsStats {
  active: number;
  trial: number;
  expiringSoon: number;
  suspended: number;
}

interface KpiSectionProps {
  stats?: SubscriptionsStats;
  isLoading?: boolean;
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
}

function StatCard({
  label,
  value,
  icon,
  isActive,
  isLoading,
  onClick
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  isActive: boolean;
  isLoading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left transition-all rounded-2xl border p-5 hover:border-primary/30 ${
        isActive
          ? 'bg-primary/10 border-primary/30'
          : 'bg-white/5 border-white/5 hover:bg-white/8'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-emerald-500/10 rounded-lg">
          {icon}
        </div>
        {isActive && (
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
        )}
      </div>
      <Text size="xs" variant="muted" className="uppercase tracking-widest font-bold mb-1">{label}</Text>
      {isLoading ? (
        <Skeleton className="h-7 w-12" />
      ) : (
        <Text size="lg" weight="bold" className="text-white">{value}</Text>
      )}
    </button>
  );
}

export function SubscriptionsKpiSection({ stats, isLoading, activeFilter, onFilterChange }: KpiSectionProps) {
  const defaultStats = { active: 0, trial: 0, expiringSoon: 0, suspended: 0 };
  const displayStats = stats ?? defaultStats;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Activas"
        value={displayStats.active}
        icon={<Users className="w-4 h-4 text-emerald-400" />}
        isActive={activeFilter === 'active'}
        isLoading={isLoading}
        onClick={() => onFilterChange(activeFilter === 'active' ? null : 'active')}
      />

      <StatCard
        label="En Trial"
        value={displayStats.trial}
        icon={<CalendarCheck className="w-4 h-4 text-blue-400" />}
        isActive={activeFilter === 'trial'}
        isLoading={isLoading}
        onClick={() => onFilterChange(activeFilter === 'trial' ? null : 'trial')}
      />

      <StatCard
        label="Por Vencer"
        value={displayStats.expiringSoon}
        icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
        isActive={activeFilter === 'expiring'}
        isLoading={isLoading}
        onClick={() => onFilterChange(activeFilter === 'expiring' ? null : 'expiring')}
      />

      <StatCard
        label="Suspendidas"
        value={displayStats.suspended}
        icon={<ShieldOff className="w-4 h-4 text-red-400" />}
        isActive={activeFilter === 'suspended'}
        isLoading={isLoading}
        onClick={() => onFilterChange(activeFilter === 'suspended' ? null : 'suspended')}
      />
    </div>
  );
}