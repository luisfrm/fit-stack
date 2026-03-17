"use client";

import * as React from "react";
import { Eye, EyeOff, UserPlus, Mail, Lock, Dumbbell, User } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { auth } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

/* ─────────────────────────────────────────────
   INLINE INPUT — scoped to Register page
   ───────────────────────────────────────────── */
interface RegisterInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

const RegisterInput = React.forwardRef<HTMLInputElement, RegisterInputProps>(
  ({ label, leftIcon, rightElement, id, className, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold uppercase tracking-wider text-gray-400"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "relative flex items-center h-12 rounded-md border border-[#333333] transition-all duration-200 bg-[#111111]",
            "focus-within:ring-1 focus-within:ring-[#fcd303] focus-within:border-[#fcd303]"
          )}
        >
          {leftIcon && (
            <span className="pl-4 shrink-0 flex items-center" style={{ color: "rgba(255,255,255,0.35)" }}>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "flex-1 bg-transparent outline-none px-4 h-full text-sm text-white placeholder-gray-600",
              leftIcon && "pl-2",
              rightElement && "pr-2",
              className
            )}
            {...props}
          />
          {rightElement && (
            <span className="pr-4 shrink-0 flex items-center" style={{ color: "rgba(255,255,255,0.35)" }}>
              {rightElement}
            </span>
          )}
        </div>
      </div>
    );
  }
);
RegisterInput.displayName = "RegisterInput";

/* ─────────────────────────────────────────────
   REGISTER PAGE
   ───────────────────────────────────────────── */
export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("first-name") as string;
    const lastName = formData.get("last-name") as string;
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm-password") as string;

    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    try {
      // Bypassing complex TS inference error for the Neon Auth SDK in this PNPM setup
      const signUpClient = auth.signUp as any;
      const { data, error } = await signUpClient.email({
        email,
        password,
        name: `${firstName} ${lastName}`,
        username,
        // Optional callbackURL if you want auto-redirect via Neon Auth config
        // callbackURL: "/dashboard" 
      });

      if (error) {
        setErrorMsg(error.message || "Error al registrar el usuario");
      } else {
        // Registro exitoso
        router.push("/dashboard"); // Ajusta esta ruta según tu CMS
      }
    } catch (err: any) {
      setErrorMsg("Ocurrió un error inesperado al conectar con el servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col md:flex-row min-h-screen w-full font-sans text-white bg-black overflow-hidden relative">
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #000; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
      `}} />

      {/* ── LEFT: Form ── */}
      <section className="w-full md:w-1/2 flex flex-col justify-between p-8 md:p-16 bg-black overflow-y-auto custom-scrollbar h-screen">
        {/* Logo Section */}
        <div className="mb-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#fcd303] rotate-45 flex items-center justify-center">
              <div className="w-4 h-4 bg-black -rotate-45"></div>
            </div>
            <span className="text-xl font-extrabold tracking-tighter">PREMIUM GYM</span>
          </div>
        </div>

        {/* Main Form Content */}
        <div className="max-w-md w-full mx-auto my-auto">
          <header className="mb-8">
            <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter mb-2">
              CREA TU CUENTA
            </h1>
            <p className="text-gray-400 text-lg">Únete al equipo de gestión</p>
          </header>

          {errorMsg && (
            <div className="mb-4 p-3 rounded bg-red-950 border border-red-900 text-red-200 text-sm">
              {errorMsg}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RegisterInput
                id="first-name"
                name="first-name"
                label="Nombre"
                placeholder="Introduce tu nombre"
                required
              />
              <RegisterInput
                id="last-name"
                name="last-name"
                label="Apellido"
                placeholder="Introduce tu apellido"
                required
              />
            </div>

            <RegisterInput
              id="username"
              name="username"
              label="Nombre de usuario"
              placeholder="Nombre de usuario"
              leftIcon={<User size={15} />}
              required
            />

            <RegisterInput
              type="email"
              id="email"
              name="email"
              label="Email"
              placeholder="ejemplo@gym.com"
              leftIcon={<Mail size={15} />}
              required
            />

            <RegisterInput
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              label="Contraseña"
              placeholder="********"
              leftIcon={<Lock size={15} />}
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex items-center justify-center transition-colors focus-visible:outline-none text-gray-400 hover:text-white"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <RegisterInput
              type={showConfirmPassword ? "text" : "password"}
              id="confirm-password"
              name="confirm-password"
              label="Confirmar Contraseña"
              placeholder="********"
              leftIcon={<Lock size={15} />}
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="flex items-center justify-center transition-colors focus-visible:outline-none text-gray-400 hover:text-white"
                  aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#fcd303] text-black font-extrabold py-4 rounded-md flex items-center justify-center gap-2 hover:bg-yellow-500 transition-colors uppercase tracking-tight disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? "REGISTRANDO..." : "REGISTRARSE"}
                {!isLoading && <UserPlus size={20} />}
              </button>
            </div>
          </form>

          <footer className="mt-8 text-center md:text-left">
            <p className="text-gray-400 text-sm">
              ¿Ya tienes una cuenta?{" "}
              <a href="/login" className="text-[#fcd303] font-bold hover:underline transition-all">
                Inicia sesión
              </a>
            </p>
          </footer>
        </div>

        {/* Copyright Section */}
        <div className="mt-12 text-xs text-gray-600 text-center md:text-left">
          © {new Date().getFullYear()} Premium Gym CMS. Todos los derechos reservados.
        </div>
      </section>

      {/* ── RIGHT: Image & Inspiration Panel ── */}
      <section 
        className="hidden md:flex md:w-1/2 relative items-end p-16 bg-cover bg-center"
        style={{ 
          backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.6)), url('https://lh3.googleusercontent.com/aida-public/AB6AXuBvaCw3_CFbCdZrCcElOfOhfOWgmJLga7M1y3OxqOJ3jw6jvpU_CyMarTyIlJkoxu68KjSnexKrT6RAL-4gtFtZvRlB1RbJlOGMpy0z266YScYaRzhvVWdwpuGzVTuF0WFgMUYWPthV6CN7jPxZntfcMN2XkjDod3lSp9zGccJZXuGJux_RDT3-R4WEHp0rHi97GRhp3HQLK2aQAylqpY0UYJ9rq_Ro852lTxzz9y4JPBomArf92j70_M6aop2MNiKUM9-Ds3i356Y')" 
        }}
      >
        <div className="relative z-20 max-w-lg">
          <div className="w-16 h-1 bg-[#fcd303] mb-8"></div>
          <h2 className="text-6xl font-black italic uppercase tracking-tighter mb-4 text-white">
            SIN LÍMITES
          </h2>
          <p className="text-xl text-gray-200 italic font-light leading-relaxed mb-4">
            "La excelencia no es un acto, sino un hábito."
          </p>
          <p className="text-lg text-gray-300 font-normal">
            Optimiza el rendimiento de tu centro deportivo con tecnología de vanguardia.
          </p>
        </div>
        
        {/* Subtle overlay for text readability at the bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80 pointer-events-none z-10"></div>
      </section>
    </main>
  );
}
