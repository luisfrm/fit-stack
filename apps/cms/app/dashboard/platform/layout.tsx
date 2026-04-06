import { redirect } from "next/navigation";
import { sessionService } from "@/lib/services/session-service";
import { ROLES } from "@workspace/shared/types";
import { type Session } from "@/lib/auth-client";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session } = await sessionService.getSession() as { data: Session | null; error: any };

  // 1. Validar sesión existente (Redundante por el layout padre, pero seguro)
  if (!session) {
    redirect("/login");
  }

  // 2. Validar rol de administrador (Crucial para el módulo platform)
  if (session.user.role !== ROLES.ADMIN) {
    redirect("/dashboard?status=unauthorized");
  }

  // 3. Si es Admin, renderizar el contenido administrativo
  return <>{children}</>;
}
