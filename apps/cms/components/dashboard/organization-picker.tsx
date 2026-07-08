"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Text } from "@workspace/ui/components/text";
import { SplashScreen, toast } from "@workspace/ui/components";
import { Building2, ChevronRight, LogOut, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { uploadService } from "@/lib/services/upload-service";
import { NextImage } from "@workspace/ui/components/next/image";
import { sessionService } from "@/lib/services/session-service";
import { organizationsService } from "@/lib/services/organizations-service";

interface OrganizationPickerProps {
  onSelect?: (orgId: string) => void;
  isModal?: boolean;
}

function OrgItemSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="h-10 w-10 rounded-full bg-white/5 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
        <div className="h-2 w-20 bg-white/5 rounded animate-pulse" />
      </div>
    </div>
  );
}

export function OrganizationPicker({ onSelect, isModal }: OrganizationPickerProps) {
  const [organizations, setOrganizations] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activatingId, setActivatingId] = React.useState<string | null>(null);
  const activatedRef = React.useRef(false);

  const activateOrg = async (orgId: string): Promise<boolean> => {
    let { error } = await sessionService.setActiveOrganization(orgId);

    if (error?.code === "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION") {
      toast.info("Vinculando perfil de administrador...");
      try {
        await organizationsService.join(orgId);
        const retry = await sessionService.setActiveOrganization(orgId);
        error = retry.error;
      } catch (joinErr: any) {
        console.error("Failed to auto-join organization:", joinErr);
        error = { code: "AUTO_JOIN_ERROR", message: "No se pudo vincular automáticamente al gimnasio." };
      }
    }

    if (error) {
      toast.error(error.message || "Error al cambiar de organización");
      return false;
    }

    toast.success("Contexto activado correctamente");
    return true;
  };

  React.useEffect(() => {
    if (activatedRef.current) return;
    activatedRef.current = true;

    async function loadOrgs() {
      const { data } = await authClient.organization.list();
      if (data) {
        setOrganizations(data);

        if (!isModal && data.length === 1 && data[0]) {
          setActivatingId(data[0].id);
          await activateOrg(data[0].id);
          setActivatingId(null);
        }
      }
      setIsLoading(false);
    }
    loadOrgs();
  }, [isModal]);

  const handleLogout = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  const handleActivate = async (orgId: string) => {
    if (activatingId !== null) return;
    setActivatingId(orgId);
    try {
      const success = await activateOrg(orgId);
      if (success) onSelect?.(orgId);
    } finally {
      setActivatingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("w-full max-w-md", !isModal && "px-4")}>
        {!isModal && (
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-2 uppercase italic text-foreground">
              Fit<span className="text-primary">Stack</span>
            </h1>
            <Text variant="muted" size="lg">¿Con qué sede deseas trabajar hoy?</Text>
          </div>
        )}
        <div className="flex flex-col">
          <OrgItemSkeleton />
          <OrgItemSkeleton />
        </div>
      </div>
    );
  }

  if (activatingId !== null && !isModal) {
    return <SplashScreen message="Cargando sede..." />;
  }

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

      <div className="flex flex-col divide-y divide-white/5">
        {organizations.map((org) => {
          const isActivatingThis = activatingId === org.id;
          const isDisabled = activatingId !== null && !isActivatingThis;

          return (
            <button
              key={org.id}
              onClick={() => handleActivate(org.id)}
              disabled={isDisabled}
              className={cn(
                "group flex items-center gap-4 p-3 text-left transition-all rounded-lg",
                "hover:bg-white/[0.06] hover:text-primary active:scale-[0.98]",
                isDisabled && "opacity-40 pointer-events-none cursor-not-allowed",
                isActivatingThis && "opacity-80"
              )}
            >
              <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                {org.logo ? (
                  <NextImage
                    src={uploadService.getMediaUrl(org.logo)}
                    alt={org.name}
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Building2 size={18} className="text-foreground-dim" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <Text weight="medium" className="truncate text-foreground">
                  {org.name}
                </Text>
                <Text size="xs" variant="muted" className="truncate">
                  {org.slug}
                </Text>
              </div>

              {isActivatingThis ? (
                <Loader2 size={14} className="text-primary animate-spin shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-foreground-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {!isModal && (
        <div className="pt-6 border-t border-white/5 flex justify-center">
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