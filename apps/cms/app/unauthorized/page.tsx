import Link from "next/link";
import { ShieldAlert, ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@workspace/ui/components";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden font-display">
      {/* Background radial gradients for premium feel */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-500/10 blur-[120px] rounded-full" />
      
      <div className="relative z-10 max-w-md w-full px-6 text-center">
        {/* Glassmorphism card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 lg:p-12 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
              <ShieldAlert className="w-12 h-12 text-red-500" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">
            Acceso Denegado
          </h1>
          
          <p className="text-slate-400 mb-8 leading-relaxed">
            Lo sentimos, tu cuenta no tiene permisos suficientes para acceder a la administración del sistema (CMS).
          </p>
          
          <div className="flex flex-col gap-3">
            <Button asChild variant="white" fullWidth>
              <Link href="/login" className="flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" />
                Volver al Login
              </Link>
            </Button>
            
            <Button asChild variant="glass" fullWidth>
              <Link href="/" className="flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Ir al Inicio
              </Link>
            </Button>
          </div>
        </div>
        
        <p className="mt-8 text-xs text-slate-600 uppercase tracking-[0.2em]">
          Fit-Stack Security System
        </p>
      </div>
    </div>
  );
}
