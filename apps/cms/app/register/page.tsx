"use client";

import * as React from "react";
import { Suspense } from "react";
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@workspace/ui/components/input";
import { Title } from "@workspace/ui/components/title";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { toast } from "@workspace/ui/components";
import { signUp } from "@/lib/auth-client";
import { capitalize } from "@/lib/helper";
import { membersService } from "@/lib/services/members-service";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // Validation State
  const [isValidating, setIsValidating] = React.useState(true);
  const [tokenError, setTokenError] = React.useState<string | null>(null);

  // Prefilled Data
  const [memberData, setMemberData] = React.useState({
    firstName: "",
    lastName: "",
    email: ""
  });

  React.useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setTokenError("No se proporcionó un token de invitación válido.");
      return;
    }

    membersService.validateToken(token)
      .then((res) => {
        setMemberData({
          firstName: res.firstName,
          lastName: res.lastName,
          email: res.email
        });
      })
      .catch((err) => {
        setTokenError(err.response?.data?.error || "Token inválido o expirado");
      })
      .finally(() => setIsValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;

    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm-password") as string;

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    const { data: authData, error } = await signUp({
      email: memberData.email, // Using pre-validated email to prevent mutation
      password,
      name: `${capitalize(memberData.firstName.toLocaleLowerCase().trim())} ${capitalize(memberData.lastName.toLocaleLowerCase().trim())}`,
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

    // Si Better-Auth creó el usuario exitosamente, vinculamos la cuenta
    try {
      await membersService.linkUser(token);
      toast.success("Cuenta configurada correctamente.");
      router.push('/dashboard'); // Go directly to dashboard instead of login since they are authenticated
    } catch (linkError: any) {
      toast.error(linkError.response?.data?.error || "Error al vincular el usuario al miembro.");
    } finally {
      setIsLoading(false);
    }
  };

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
              PREMIUM GYM
            </Text>
          </div>
        </div>

        <div className="max-w-md">
          <header className="mb-8">
            <Title as="h1" size="section" className="mb-2">
              CREA TU CUENTA
            </Title>
            <Text variant="muted" size="md">Completa tu registro para acceder a la plataforma</Text>
          </header>

          {isValidating && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-gray-500">
              <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-primary animate-spin" />
              <p>Validando invitación...</p>
            </div>
          )}

          {tokenError && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center px-4">
              <AlertCircle className="text-red-500 w-12 h-12" />
              <div>
                <h3 className="text-lg font-bold text-red-500">Invitación Inválida</h3>
                <p className="text-sm text-red-400 mt-1">{tokenError}</p>
              </div>
            </div>
          )}

          {!isValidating && !tokenError && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nombre"
                  value={memberData.firstName}
                  readOnly
                  disabled
                  className="bg-white/5 opacity-70"
                />
                <Input
                  label="Apellido"
                  value={memberData.lastName}
                  readOnly
                  disabled
                  className="bg-white/5 opacity-70"
                />
              </div>

              <Input
                label="Email"
                value={memberData.email}
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
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex items-center justify-center transition-colors focus-visible:outline-none text-white/40 hover:text-white"
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
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
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
                  FINALIZAR REGISTRO
                </Button>
              </div>
            </form>
          )}

          <div className="mt-8 text-center sm:text-left">
            <Text variant="muted" size="sm">
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" className="text-primary hover:text-primary-light font-semibold hover:underline transition-colors focus-visible:outline-none">
                Inicia sesión aquí
              </Link>
            </Text>
          </div>
        </div>

        <footer className="mt-8">
          <Text as="p" size="xs" variant="muted" className="text-center md:text-left opacity-60 flex flex-col md:flex-row gap-2">
            <span>&copy; {new Date().getFullYear()} Premium Gym. &nbsp;Todos los derechos reservados.</span>
          </Text>
        </footer>
      </section>

      {/* ── RIGHT: Banner ── */}
      <section className="hidden md:flex w-1/2 bg-zinc-900 border-l border-white/10 relative overflow-hidden group">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540497077202-7c8a3999166f?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center brightness-50 contrast-125 transition-transform duration-[10s] ease-out group-hover:scale-110" />
        <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />

        <div className="relative z-10 p-16 flex flex-col justify-end h-full">
          <div className="mb-6 flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg key={star} className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <h2 className="text-4xl md:text-5xl font-bold font-sans text-white mb-6 uppercase tracking-tight leading-[1.1]">
            El Mejor Software<br />de Entrenamiento
          </h2>
          <p className="text-lg text-slate-300 max-w-lg mb-8">
            "Desde que implementamos esta plataforma, la administración de nuestras sedes es impecable y la satisfacción de los miembros subió al máximo."
          </p>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/30">
              <img src="https://i.pravatar.cc/150?u=a042581f4e29026704z" alt="Avatar Director" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="font-bold text-white text-md">Alejandro Marín</p>
              <p className="text-slate-400 text-sm">Director en Premium Gym</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="flex flex-col md:flex-row min-h-svh w-full font-sans text-white bg-black items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-primary animate-spin" />
          <p className="text-gray-400 animate-pulse">Cargando...</p>
        </div>
      </main>
    }>
      <RegisterForm />
    </Suspense>
  );
}
