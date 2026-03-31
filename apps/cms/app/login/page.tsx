"use client";

import * as React from "react";
import { Eye, EyeOff, LogIn, Mail, Lock, Dumbbell } from "lucide-react";
import Link from "next/link";
import { Input } from "@workspace/ui/components/input";
import { Title, TitleAccent } from "@workspace/ui/components/title";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { toast } from "@workspace/ui/components";
import { signIn } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

/* ─────────────────────────────────────────────
   LOGIN PAGE
   ───────────────────────────────────────────── */
export default function LoginPage() {
  const [showPassword, setShowPassword] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn({ email, password });

    if (error) {
      if (error.code === 'INVALID_EMAIL_OR_PASSWORD' || error.message?.includes('Invalid email or password')) {
        toast.error('Email o contraseña incorrectos.');
      } else {
        toast.error(error.message || 'Ocurrió un error al iniciar sesión.');
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    router.push('/dashboard');
    console.log("Login exitoso");
  };

  return (
    <div className="flex h-svh w-full overflow-hidden" style={{ backgroundColor: "var(--background)", fontFamily: "var(--font-sans, sans-serif)" }}>

      {/* ── LEFT: Form ── */}
      <div
        className="w-full lg:w-1/2 flex flex-col justify-between"
        style={{ padding: "clamp(2rem, 6vw, 6rem)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Dumbbell size={28} className="text-[--color-primary]" />
          <Text as="span" size="lg" weight="bold" uppercase className="tracking-tight italic">
            PREMIUM<span className="text-[--color-primary]">GYM</span>
          </Text>
        </div>

        {/* Form body */}
        <div className="max-w-md">
          <div className="mb-10">
            <Title as="h1" size="section" className="mb-3">
              ACCEDE A TU <br />
              <TitleAccent>PANEL</TitleAccent>
            </Title>
            <Text variant="muted" size="lg">
              Gestiona tu gimnasio desde un solo lugar
            </Text>
          </div>

          <form className="flex flex-col gap-6" onSubmit={handleLogin}>
            <Input
              variant="default"
              inputSize="md"
              type="email"
              id="email"
              label="Email"
              placeholder="Introduce tu email"
              autoComplete="email"
              leftIcon={<Mail size={16} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center px-1">
                <Text as="label" htmlFor="password" size="sm" weight="medium" className="tracking-wide text-foreground-muted opacity-80">
                  Contraseña
                </Text>
                <Link
                  href="#"
                  className="text-xs text-foreground-dim hover:text-[--color-primary] transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input
                variant="default"
                inputSize="md"
                type={showPassword ? "text" : "password"}
                id="password"
                placeholder="Introduce tu contraseña"
                autoComplete="current-password"
                leftIcon={<Lock size={16} />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex items-center justify-center transition-colors focus-visible:outline-none text-white/40 hover:text-white"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
            </div>

            {/* CTA */}
            <div className="pt-2">
              <Button 
                type="submit" 
                variant="primary" 
                size="xl" 
                rounded="lg" 
                fullWidth 
                loading={isLoading}
                rightIcon={!isLoading && <LogIn size={18} />}
              >
                {isLoading ? "INICIANDO SESIÓN..." : "INICIAR SESIÓN"}
              </Button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <Text variant="subtle" size="xs">
          © {new Date().getFullYear()} Premium Gym CMS. Todos los derechos reservados.
        </Text>
      </div>

      {/* ── RIGHT: Image panel ── */}
      <section className="hidden lg:block w-1/2 relative overflow-hidden">
        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/gym-login-bg.png')" }}
          role="img"
          aria-label="Atleta profesional entrenando en un gimnasio oscuro"
        />
        {/* Fade from left */}
        <div
          className="absolute inset-0 z-10"
          style={{ background: "linear-gradient(to right, var(--background) 0%, oklch(from var(--background) l c h / 0.4) 50%, transparent 100%)" }}
        />
        {/* Overall dark tint */}
        <div className="absolute inset-0 z-10" style={{ background: "oklch(from var(--background) l c h / 0.45)" }} />

        {/* Floating quote */}
        <div className="absolute bottom-16 left-16 z-20 max-w-[360px]">
          <div className="mb-6 rounded-full h-[3px] w-12 bg-[--color-primary]" />
          <Title as="h3" size="card" className="text-white mb-3">
            Sin Límites
          </Title>
          <Text variant="subtle" className="text-foreground-muted font-light leading-relaxed">
            "La excelencia no es un acto, sino un hábito." Optimiza el
            rendimiento de tu centro deportivo con tecnología de vanguardia.
          </Text>
        </div>
      </section>
    </div>
  );
}
