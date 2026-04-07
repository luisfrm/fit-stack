"use client";

import * as React from "react";
import { Eye, EyeOff, Mail, Lock, User, ShieldCheck } from "lucide-react";
import { useRouter, notFound } from "next/navigation";
import { Input } from "@workspace/ui/components/input";
import { Title } from "@workspace/ui/components/title";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { toast } from "@workspace/ui/components";
import { initService } from "@/lib/services/init-service";

export default function InitPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(true);
  const [isNotFound, setIsNotFound] = React.useState(false);

  React.useEffect(() => {
    // Check if initialization is actually required
    initService.checkNeedsInit().then((res: any) => {
      if (res.needsInit) {
        setIsChecking(false);
      } else {
        setIsNotFound(true);
      }
    }).catch(() => {
      setIsChecking(false);
    });
  }, [router]);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm-password") as string;

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    try {
      await initService.performInit({ name, email, password });
      toast.success("¡Sistema inicializado correctamente!");
      router.push("/login");
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : "Ocurrió un error inesperado.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isNotFound) {
    return notFound();
  }

  if (isChecking) {
    return (
      <main className="flex flex-col min-h-svh w-full font-sans text-white bg-black items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-primary animate-spin" />
          <p className="text-gray-400 animate-pulse">Verificando estado del sistema...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col md:flex-row min-h-svh w-full font-sans text-white bg-black overflow-hidden relative">
      <section
        className="w-full md:w-1/2 flex flex-col justify-between p-8 md:p-16 bg-black overflow-y-auto h-svh"
        style={{ paddingBlock: "clamp(2rem, 6vw, 3rem)", paddingInline: "clamp(2rem, 6vw, 6rem)" }}
      >
        <div className="mb-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rotate-45 flex items-center justify-center">
              <div className="w-4 h-4 bg-black -rotate-45" />
            </div>
            <Text as="span" size="lg" weight="bold" uppercase className="tracking-tighter">
              FIT-STACK PLATFORM
            </Text>
          </div>
        </div>

        <div className="max-w-md">
          <header className="mb-8">
            <Title as="h1" size="section" className="mb-2">
              CONFIGURACIÓN INICIAL
            </Title>
            <Text variant="muted" size="md">Crea la cuenta del Administrador Maestro para comenzar.</Text>
          </header>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              id="name"
              name="name"
              label="Nombre Completo"
              placeholder="Ej: John Doe"
              leftIcon={<User size={16} />}
              required
            />

            <Input
              id="email"
              name="email"
              label="Email de Administrador"
              placeholder="admin@fitstack.com"
              leftIcon={<Mail size={16} />}
              required
            />

            <Input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              label="Contraseña"
              placeholder="********"
              leftIcon={<Lock size={16} />}
              required
              rightElement={
                <Button
                  type="button"
                  variant="ghost-muted"
                  onClick={() => setShowPassword((v) => !v)}
                  className="h-8 w-8 p-0"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              }
            />

            <Input
              type={showConfirmPassword ? "text" : "password"}
              id="confirm-password"
              name="confirm-password"
              label="Confirmar Contraseña"
              placeholder="********"
              leftIcon={<Lock size={16} />}
              required
              rightElement={
                <Button
                  type="button"
                  variant="ghost-muted"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="h-8 w-8 p-0"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              }
            />

            <div className="pt-4">
              <Button
                type="submit"
                size="xl"
                fullWidth
                loading={isLoading}
                disabled={isLoading}
                leftIcon={!isLoading && <ShieldCheck size={20} />}
              >
                INICIALIZAR PLATAFORMA
              </Button>
            </div>
          </form>
        </div>

        <footer className="mt-8">
          <Text as="p" size="xs" variant="muted" className="text-center md:text-left opacity-60">
            &copy; {new Date().getFullYear()} Fit-Stack. Todos los derechos reservados.
          </Text>
        </footer>
      </section>

      {/* ── RIGHT: Banner ── */}
      <section className="hidden md:flex w-1/2 bg-zinc-900 border-l border-white/10 relative overflow-hidden group">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center brightness-50 contrast-125 transition-transform duration-[10s] ease-out group-hover:scale-110" />
        <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />

        <div className="relative z-10 p-16 flex flex-col justify-end h-full">
          <h2 className="text-4xl md:text-5xl font-bold font-sans text-white mb-6 uppercase tracking-tight leading-[1.1]">
            Bienvenido a<br />Fit-Stack
          </h2>
          <p className="text-lg text-slate-300 max-w-lg mb-8">
            Estás a un paso de configurar tu plataforma de gestión deportiva de alto rendimiento.
          </p>
        </div>
      </section>
    </main>
  );
}
