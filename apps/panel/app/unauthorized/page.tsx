import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { sessionService } from "@/lib/services/session-service";
import {
  hasAccess,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  type OrgRole,
} from "@workspace/shared";
import SignOutButton from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function UnauthorizedPage() {
  const { data: session, error: sessionError } = await sessionService.getSession();

  if (sessionError?.code === "ORGANIZATION_NOT_FOUND") {
    redirect("/reset-org-context");
  }

  if (!session) {
    redirect("/login");
  }

  const orgRole = session.member?.role as OrgRole | undefined;
  // Sin rol (usuario sin org activa) → el layout de dashboard muestra el OrganizationPicker.
  if (!orgRole) {
    redirect("/dashboard");
  }
  if (hasAccess(orgRole, PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden font-display">
      {/* Background radial gradients for premium feel */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-warning/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-destructive/10 blur-[120px] rounded-full" />
      
      <div className="relative z-10 max-w-md w-full px-6 text-center">
        {/* Glassmorphism card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 lg:p-12 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-destructive/10 rounded-2xl border border-destructive/20">
              <ShieldAlert className="w-12 h-12 text-destructive" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">
            Acceso Denegado
          </h1>
          
          <p className="text-slate-400 mb-8 leading-relaxed">
            Tu rol (entrenador o cliente) no tiene acceso al panel de administración del gimnasio.
            La app móvil para entrenamiento y seguimiento estará disponible próximamente.
          </p>
          
          <SignOutButton />
        </div>
        
        <p className="mt-8 text-xs text-slate-600 uppercase tracking-[0.2em]">
          Fit-Stack Security System
        </p>
      </div>
    </div>
  );
}
