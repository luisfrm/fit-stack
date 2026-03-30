"use client";

import * as React from "react";
import { Eye, EyeOff, UserPlus, Mail, Lock, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Input } from "@workspace/ui/components/input";
import { Title } from "@workspace/ui/components/title";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { toast } from "@workspace/ui/components";
import { signUp } from "@/lib/auth-client";
import { capitalize } from "@/lib/helper";

/* ─────────────────────────────────────────────
   REGISTER PAGE
   ───────────────────────────────────────────── */
export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("first-name") as string;
    const lastName = formData.get("last-name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm-password") as string;

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    const { error } = await signUp({
      email,
      password,
      name: `${capitalize(firstName.toLocaleLowerCase().trim())} ${capitalize(lastName.toLocaleLowerCase().trim())}`,
    });

    if (error) {
      if (error.message?.includes("already registered")) {
        toast.error("El correo electrónico ya está registrado");
      } else if (error.message?.includes("Password too short")) {
        toast.error("La contraseña es muy corta");
      } else {
        toast.error("Ocurrió un error inesperado al conectar con el servidor.");
      }
      setIsLoading(false);
      return;
    }

    router.push('/login');
    setIsLoading(false);
  };

  return (
    <main className="flex flex-col md:flex-row min-h-screen w-full font-sans text-white bg-black overflow-hidden relative">
      {/* ── LEFT: Form ── */}
      <section
        className="w-full md:w-1/2 flex flex-col justify-between p-8 md:p-16 bg-black overflow-y-auto h-screen"
        style={{ paddingBlock: "clamp(2rem, 6vw, 3rem)", paddingInline: "clamp(2rem, 6vw, 6rem)" }}
      >
        {/* Logo Section */}
        <div className="mb-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[--color-primary] rotate-45 flex items-center justify-center">
              <div className="w-4 h-4 bg-black -rotate-45" />
            </div>
            <Text as="span" size="lg" weight="bold" uppercase className="tracking-tighter">
              PREMIUM GYM
            </Text>
          </div>
        </div>

        {/* Main Form Content */}
        <div className="max-w-md">
          <header className="mb-8">
            <Title as="h1" size="section" className="mb-2">
              CREA TU CUENTA
            </Title>
            <Text variant="muted" size="md">Únete al equipo de gestión</Text>
          </header>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="first-name"
                name="first-name"
                label="Nombre"
                placeholder="Introduce tu nombre"
                required
              />
              <Input
                id="last-name"
                name="last-name"
                label="Apellido"
                placeholder="Introduce tu apellido"
                required
              />
            </div>

            <Input
              type="email"
              id="email"
              name="email"
              label="Email"
              placeholder="ejemplo@gym.com"
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

            <Input
              type={showConfirmPassword ? "text" : "password"}
              id="confirm-password"
              name="confirm-password"
              label="Confirmar Contraseña"
              placeholder="********"
              leftIcon={<Lock size={16} />}
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="flex items-center justify-center transition-colors focus-visible:outline-none text-white/40 hover:text-white"
                  aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                variant="primary"
                size="xl"
                rounded="lg"
                fullWidth
                loading={isLoading}
                rightIcon={!isLoading && <UserPlus size={20} />}
              >
                {isLoading ? "REGISTRANDO..." : "REGISTRARSE"}
              </Button>
            </div>
          </form>

          <footer className="mt-8 text-center md:text-left">
            <Text variant="muted" size="sm">
              ¿Ya tienes una cuenta?{" "}
              <Link href="/login" className="text-primary font-bold hover:underline transition-all">
                Inicia sesión
              </Link>
            </Text>
          </footer>
        </div>

        {/* Copyright Section */}
        <div className="mt-12 text-center md:text-left">
          <Text variant="muted" size="xs">
            © {new Date().getFullYear()} Premium Gym CMS. Todos los derechos reservados.
          </Text>
        </div>
      </section>

      {/* ── RIGHT: Image & Inspiration Panel ── */}
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
          style={{ background: "linear-gradient(to right, #0a0a0a 0%, rgba(10,10,10,0.4) 50%, transparent 100%)" }}
        />
        {/* Overall dark tint */}
        <div className="absolute inset-0 z-10" style={{ background: "rgba(0,0,0,0.45)" }} />

        {/* Floating quote */}
        <div className="absolute bottom-16 left-16 z-20 max-w-[360px]">
          <div className="mb-6 rounded-full h-[3px] w-12 bg-[--color-primary]" />
          <Title as="h3" size="card" className="text-white mb-3">
            Sin Límites
          </Title>
          <Text variant="subtle" className="text-[rgba(255,255,255,0.55)] font-light leading-relaxed">
            "La excelencia no es un acto, sino un hábito." Optimiza el
            rendimiento de tu centro deportivo con tecnología de vanguardia.
          </Text>
        </div>
      </section>
    </main>
  );
}
