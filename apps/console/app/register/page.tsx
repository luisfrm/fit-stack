"use client";

import * as React from "react";
import { Suspense } from "react";
import { Eye, EyeOff, Mail, Lock, AlertCircle, ShieldCheck, Dumbbell, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@workspace/ui/components/input";
import { Title } from "@workspace/ui/components/title";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { toast } from "@workspace/ui/components";
import { sessionService } from "@/lib/services/session-service";
import { staffService } from "@/lib/services/staff-service";
import { authClient, useSession } from "@/lib/auth-client";

/**
 * Forces a fresh session fetch (bypasses the 5-min cookieCache) so the
 * dashboard layout sees the newly assigned platform role right away.
 */
async function refreshSessionRole() {
  await authClient.getSession({ query: { disableCookieCache: "true" } });
}

function RegisterForm() {
  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // Refs to prevent double accept calls (race between handleSubmit and useEffect)
  const hasAccepted = React.useRef(false);
  // Track if user had a session when the component first mounted (returned from login)
  const hadSessionOnMount = React.useRef<boolean | null>(null);

  // ── AUTO-ACCEPT: If user was ALREADY logged in when page loaded (e.g. returned from /login) ──
  React.useEffect(() => {
    if (sessionPending) return;

    if (hadSessionOnMount.current === null) {
      hadSessionOnMount.current = !!session;
    }

    if (hadSessionOnMount.current && session && token && !hasAccepted.current) {
      hasAccepted.current = true;
      const autoAccept = async () => {
        try {
          await staffService.accept(token);
          await refreshSessionRole();
          toast.success("Tu cuenta ha sido activada como administrador de la plataforma.");
          router.push("/dashboard");
        } catch (err) {
          console.error("Auto-accept failed:", err);
        }
      };
      autoAccept();
    }
  }, [session, sessionPending, token, router]);

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // Validation State
  const [isValidating, setIsValidating] = React.useState(true);
  const [tokenError, setTokenError] = React.useState<string | null>(null);

  // Prefilled Data
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setTokenError("No se proporcionó un token de invitación válido.");
      return;
    }

    staffService
      .validateToken(token)
      .then((res) => {
        setEmail(res.email || "");
      })
      .catch((err) => {
        setTokenError(err?.data?.error ?? "Token inválido o expirado");
      })
      .finally(() => setIsValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;

    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm-password") as string;

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    const { error } = await sessionService.signUp({
      email,
      password,
      name: name.trim(),
    });

    if (error) {
      if (error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        toast.info("Ya tienes una cuenta con este email. Inicia sesión para activar tu acceso.");
        const returnTo = encodeURIComponent(`/register?token=${token}`);
        router.push(`/login?returnTo=${returnTo}`);
      } else if (error.message?.includes("Password too short")) {
        toast.error("La contraseña es muy corta");
      } else {
        toast.error(error.message || "Ocurrió un error inesperado al conectar con el servidor.");
      }
      setIsLoading(false);
      return;
    }

    // Prevent useEffect from also calling accept
    hasAccepted.current = true;

    try {
      await staffService.accept(token);
      await refreshSessionRole();
      toast.success("Cuenta configurada correctamente.");
      router.push("/dashboard");
    } catch (acceptError: any) {
      toast.error(acceptError?.data?.error ?? "Error al activar tu acceso de administrador.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      className="flex flex-col md:flex-row min-h-svh w-full text-foreground overflow-hidden relative"
      style={{ backgroundColor: "var(--background)", fontFamily: "var(--font-sans, sans-serif)" }}
    >
      <section
        className="w-full md:w-1/2 flex flex-col justify-between gap-3 overflow-y-auto h-svh"
        style={{ paddingBlock: "clamp(2rem, 6vw, 3rem)", paddingInline: "clamp(2rem, 6vw, 6rem)" }}
      >
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Dumbbell size={28} className="text-primary" />
            <Text as="span" size="lg" weight="bold" uppercase className="tracking-tight italic">
              Fit<span className="text-primary">Stack</span> Console
            </Text>
          </div>
        </div>

        <div className="max-w-md">
          <header className="mb-8">
            <Title as="h1" size="section" className="mb-2 text-foreground">
              CREA TU <span className="text-primary">CUENTA</span>
            </Title>
            <Text variant="muted" size="md">
              Completa tu registro para acceder a la consola de administración de la plataforma
            </Text>
          </header>

          {isValidating && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-foreground-muted">
              <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-primary animate-spin" />
              <p>Validando invitación...</p>
            </div>
          )}

          {tokenError && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 bg-destructive/10 border border-destructive/20 rounded-2xl text-center px-4">
              <AlertCircle className="text-destructive w-12 h-12" />
              <div>
                <h3 className="text-lg font-bold text-destructive">Invitación Inválida</h3>
                <p className="text-sm text-destructive/80 mt-1">{tokenError}</p>
              </div>
            </div>
          )}

          {!isValidating && !tokenError && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                label="Nombre"
                placeholder="Tu nombre completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                leftIcon={<User size={16} />}
                required
              />

              <Input
                label="Email"
                value={email}
                leftIcon={<Mail size={16} />}
                readOnly
                disabled
                className="bg-white/5 opacity-70"
                hint="Tu email está vinculado a tu invitación y no puede ser cambiado."
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
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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
                    aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                }
              />

              <div className="pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  size="xl"
                  rounded="lg"
                  fullWidth
                  loading={isLoading}
                  disabled={isLoading}
                  leftIcon={!isLoading && <ShieldCheck size={20} />}
                >
                  FINALIZAR REGISTRO
                </Button>
              </div>
            </form>
          )}

          <div className="mt-8 text-center sm:text-left">
            <Text variant="muted" size="sm">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/login"
                className="text-primary hover:text-primary-light font-semibold hover:underline transition-colors focus-visible:outline-none"
              >
                Inicia sesión aquí
              </Link>
            </Text>
          </div>
        </div>

        <footer className="mt-8">
          <Text variant="subtle" size="xs">
            © {new Date().getFullYear()} Fit Stack Console. Todos los derechos reservados.
          </Text>
        </footer>
      </section>

      {/* ── RIGHT: Banner ── */}
      <section className="hidden md:flex w-1/2 bg-zinc-900 border-l border-white/10 relative overflow-hidden group">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center brightness-50 contrast-125 transition-transform duration-[10s] ease-out group-hover:scale-110" />
        <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />

        <div className="relative z-10 p-16 flex flex-col justify-end h-full">
          <div className="mb-6 rounded-full h-[3px] w-12 bg-[--color-primary]" />
          <Title as="h2" size="section" className="mb-4 uppercase tracking-tight leading-[1.1] text-white">
            Administración<br />Centralizada
          </Title>
          <Text variant="subtle" className="text-slate-300 text-lg max-w-lg mb-8 font-light leading-relaxed">
            Controla organizaciones, suscripciones y el equipo de la plataforma SaaS desde un solo lugar.
          </Text>
        </div>
      </section>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-col md:flex-row min-h-svh w-full font-sans text-white bg-black items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-primary animate-spin" />
            <p className="text-gray-400 animate-pulse">Cargando...</p>
          </div>
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
