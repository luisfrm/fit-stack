"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { toast, SplashScreen } from "@workspace/ui/components";
import { Check, X, Building2, UserPlus } from "lucide-react";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const invitationId = params.id as string;
  const { data: session, isPending: sessionPending } = useSession();
  
  const [invitation, setInvitation] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isProcessing, setIsProcessing] = React.useState(false);

  // 1. Fetch Invitation Details
  React.useEffect(() => {
    async function loadInvitation() {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });

      if (error) {
        toast.error("No se pudo encontrar la invitación o ha expirado.");
        router.push("/login");
        return;
      }

      setInvitation(data);
      setIsLoading(false);
    }

    if (invitationId) {
      loadInvitation();
    }
  }, [invitationId, router]);

  // 2. Redirect if not logged in (after invitation is loaded)
  React.useEffect(() => {
    if (!sessionPending && !session && !isLoading) {
      toast.info("Por favor, inicia sesión para aceptar la invitación.");
      router.push(`/login?returnTo=/accept-invitation/${invitationId}`);
    }
  }, [session, sessionPending, isLoading, invitationId, router]);

  const handleAccept = async () => {
    setIsProcessing(true);
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    });

    if (error) {
      toast.error(error.message || "Error al aceptar la invitación.");
      setIsProcessing(false);
      return;
    }

    toast.success(`¡Bienvenido a ${invitation?.organizationName}!`);
    router.push("/dashboard");
    router.refresh();
  };

  const handleReject = async () => {
    setIsProcessing(true);
    const { error } = await authClient.organization.rejectInvitation({
      invitationId,
    });

    if (error) {
      toast.error(error.message || "Error al rechazar la invitación.");
      setIsProcessing(false);
      return;
    }

    toast.info("Invitación rechazada.");
    router.push("/dashboard");
  };

  if (isLoading || sessionPending) {
    return <SplashScreen message="Cargando invitación..." />;
  }

  if (!invitation) return null;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 font-display">
      <Card className="w-full max-w-md border-white/5 bg-surface shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 size={32} />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Invitación a <span className="text-primary italic">{invitation.organizationName}</span>
          </CardTitle>
          <CardDescription className="text-foreground-muted mt-2">
            Has sido invitado a unirte a este equipo.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-8 pt-6">
          <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <UserPlus size={20} className="text-primary" />
            </div>
            <div>
              <Text size="sm" weight="medium" className="text-foreground">
                Rol asignado: <span className="capitalize text-primary">{invitation.role}</span>
              </Text>
              <Text size="xs" variant="muted" className="mt-1">
                Tendrás acceso a las herramientas de gestión de esta sede.
              </Text>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              size="xl"
              fullWidth
              onClick={handleAccept}
              loading={isProcessing}
              leftIcon={<Check size={18} />}
            >
              ACEPTAR E INGRESAR
            </Button>
            <Button
              variant="ghost-muted"
              size="lg"
              fullWidth
              onClick={handleReject}
              disabled={isProcessing}
              leftIcon={<X size={18} />}
            >
              Rechazar invitación
            </Button>
          </div>

          <Text size="xs" variant="muted" className="text-center pt-2 italic opacity-50">
            Al aceptar, tu perfil será vinculado a esta organización.
          </Text>
        </CardContent>
      </Card>
    </div>
  );
}
