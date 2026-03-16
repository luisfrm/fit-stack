"use client";

import * as React from "react";
import { Eye, EyeOff, LogIn, Mail, Lock, Dumbbell } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

/* ─────────────────────────────────────────────
   INLINE INPUT — scoped to Login page to avoid
   CSS variable resolution issues in the CMS app
   ───────────────────────────────────────────── */
interface LoginInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

const LoginInput = React.forwardRef<HTMLInputElement, LoginInputProps>(
  ({ label, leftIcon, rightElement, id, className, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium tracking-wide"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "relative flex items-center h-14 rounded-lg border transition-all duration-200",
            "focus-within:ring-1"
          )}
          style={
            {
              background: "transparent",
              borderColor: "rgba(255,255,255,0.15)",
              "--tw-ring-color": "#fcd303",
            } as React.CSSProperties
          }
          onFocusCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#fcd303";
          }}
          onBlurCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
          }}
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
              "flex-1 bg-transparent outline-none px-4 h-full text-sm",
              leftIcon && "pl-2",
              rightElement && "pr-2",
              className
            )}
            style={{ color: "white" }}
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
LoginInput.displayName = "LoginInput";

/* ─────────────────────────────────────────────
   LOGIN PAGE
   ───────────────────────────────────────────── */
export default function LoginPage() {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: "#0a0a0a", fontFamily: "var(--font-sans, sans-serif)" }}>

      {/* ── LEFT: Form ── */}
      <div
        className="w-full lg:w-1/2 flex flex-col justify-between"
        style={{ padding: "clamp(2rem, 6vw, 6rem)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Dumbbell size={28} style={{ color: "#fcd303" }} />
          <span className="text-xl font-black tracking-tight uppercase italic" style={{ color: "white" }}>
            PREMIUM<span style={{ color: "#fcd303" }}>GYM</span>
          </span>
        </div>

        {/* Form body */}
        <div style={{ maxWidth: 420 }}>
          <div className="mb-10">
            <h1
              className="text-4xl md:text-5xl font-black italic leading-tight tracking-tight mb-3"
              style={{ color: "white" }}
            >
              ACCEDE A TU
              <br />
              <span style={{ color: "#fcd303" }}>PANEL</span>
            </h1>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "1.1rem" }}>
              Gestiona tu gimnasio desde un solo lugar
            </p>
          </div>

          <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
            <LoginInput
              type="email"
              id="email"
              label="Email"
              placeholder="Introduce tu email"
              autoComplete="email"
              leftIcon={<Mail size={15} />}
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="password"
                  className="text-sm font-medium tracking-wide"
                  style={{ color: "rgba(255,255,255,0.65)" }}
                >
                  Contraseña
                </label>
                <a
                  href="#"
                  className="text-xs transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#fcd303")}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.35)")}
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <LoginInput
                type={showPassword ? "text" : "password"}
                id="password"
                placeholder="Introduce tu contraseña"
                autoComplete="current-password"
                leftIcon={<Lock size={15} />}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex items-center justify-center transition-colors focus-visible:outline-none"
                    style={{ color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
            </div>

            {/* CTA */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full h-14 rounded-lg flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-sm transition-all duration-200 active:scale-[0.98]"
                style={{ backgroundColor: "#fcd303", color: "#000" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#e6bf00")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#fcd303")}
              >
                INICIAR SESIÓN
                <LogIn size={18} />
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          © {new Date().getFullYear()} Premium Gym CMS. Todos los derechos reservados.
        </p>
      </div>

      {/* ── RIGHT: Image panel ── */}
      <div className="hidden lg:block w-1/2 relative overflow-hidden">
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
        <div className="absolute bottom-16 left-16 z-20" style={{ maxWidth: 360 }}>
          <div className="mb-6 rounded-full" style={{ height: 3, width: 48, backgroundColor: "#fcd303" }} />
          <h3
            className="text-3xl font-black italic mb-3 tracking-tighter uppercase leading-tight"
            style={{ color: "white" }}
          >
            Sin Límites
          </h3>
          <p style={{ color: "rgba(255,255,255,0.55)", fontWeight: 300, lineHeight: 1.6, fontSize: "0.9rem" }}>
            "La excelencia no es un acto, sino un hábito." Optimiza el
            rendimiento de tu centro deportivo con tecnología de vanguardia.
          </p>
        </div>
      </div>
    </div>
  );
}
