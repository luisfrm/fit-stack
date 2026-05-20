"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { useOrganizationActivation } from "@/lib/hooks/use-organization-activation";
import { Button } from "@workspace/ui/components/button";
import { Text } from "@workspace/ui/components/text";
import { SplashScreen } from "@workspace/ui/components";
import { Building2, ChevronRight, LogOut } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { uploadService } from "@/lib/services/upload-service";
import { NextImage } from "@workspace/ui/components/next/image";

interface OrganizationPickerProps {
  onSelect?: (orgId: string) => void;
  isModal?: boolean;
}

export function OrganizationPicker({ onSelect, isModal }: OrganizationPickerProps) {
  const [organizations, setOrganizations] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { activate, isActivating } = useOrganizationActivation();
  const activatedRef = React.useRef(false);

  React.useEffect(() => {
    if (activatedRef.current) return;
    activatedRef.current = true;

    async function loadOrgs() {
      const { data, error } = await authClient.organization.list();
      if (data) {
        setOrganizations(data);

        if (!isModal && data.length === 1 && data[0]) {
          await activate(data[0].id);
          onSelect?.(data[0].id);
        }
      }
      setIsLoading(false);
    }
    loadOrgs();
  }, [activate, isModal, onSelect]);

  const handleLogout = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  if (isLoading || isActivating) {
    return <SplashScreen message={isActivating ? "Cargando sede..." : "Buscando sedes..."} />;
  }

  // If no organizations found (edge case for global admins without org membership)
  if (organizations.length === 0) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-background p-4">
        <div className="text-center max-w-sm">
          <Building2 size={48} className="mx-auto mb-4 text-foreground-dim opacity-20" />
          <Text size="lg" weight="bold" className="mb-2">No tienes sedes asignadas</Text>
          <Text variant="muted" size="sm" className="mb-6">
            Ponte en contacto con el administrador para que te asigne a un gimnasio.
          </Text>
          <Button variant="ghost-muted" onClick={handleLogout} leftIcon={<LogOut size={16} />}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  const content = (
    <div className={cn("w-full max-w-md animate-in fade-in zoom-in duration-300", !isModal && "px-4")}>
      {!isModal && (
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-2 uppercase italic text-foreground">
            Fit<span className="text-primary">Stack</span>
          </h1>
          <Text variant="muted" size="lg">¿Con qué sede deseas trabajar hoy?</Text>
        </div>
      )}

      <div className="grid gap-3">
        {organizations.map((org) => (
          <button
            key={org.id}
            onClick={() => activate(org.id)}
            className={cn(
              "group flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-surface text-left transition-all",
              "hover:border-primary/30 hover:bg-white/5 active:scale-[0.98]"
            )}
          >
            <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0 overflow-hidden border border-white/5 group-hover:border-primary/20 relative">
              {org.logo ? (
                <NextImage
                  src={uploadService.getMediaUrl(org.logo)} 
                  alt={org.name} 
                  width={100}
                  height={100}
                  className="h-full w-full object-cover" 
                />
              ) : (
                <Building2 size={24} className="text-foreground-muted opacity-50 group-hover:text-primary transition-colors" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <Text weight="semibold" className="truncate text-foreground group-hover:text-primary transition-colors">
                {org.name}
              </Text>
              <Text size="xs" variant="muted" className="truncate">
                {org.slug}
              </Text>
            </div>
            <ChevronRight size={18} className="text-foreground-dim opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </button>
        ))}
      </div>

      {!isModal && (
        <div className="mt-10 pt-6 border-t border-white/5 flex justify-center">
          <Button variant="ghost-muted" size="sm" onClick={handleLogout} leftIcon={<LogOut size={14} />}>
            Cerrar sesión
          </Button>
        </div>
      )}
    </div>
  );

  if (isModal) return content;

  return (
    <div className="flex h-svh w-full items-center justify-center bg-background/80 backdrop-blur-sm p-4 z-[100]">
      {content}
    </div>
  );
}
