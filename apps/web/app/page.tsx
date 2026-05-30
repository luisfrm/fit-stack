import { Navbar } from "@workspace/ui/components/navbar"
import { Hero } from "@workspace/ui/components/hero"
import { OurServices } from "@workspace/ui/components/our-services"
import { SectionHeader, Title, TitleAccent, Eyebrow } from "@workspace/ui/components/title"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"

const NAV_ITEMS = [
  { label: "Inicio", href: "#inicio" },
  { label: "Funcionalidades", href: "#funcionalidades" },
  { label: "Como Funciona", href: "#como-funciona" },
  { label: "Testimonios", href: "#testimonios" },
]

const SERVICES = [
  {
    icon: "fingerprint",
    title: "Control de Acceso Biometrico",
    description:
      "Valida la entrada de tus miembros con reconocimiento facial, huella dactilar, codigo QR o tarjeta. Todo sincronizado en tiempo real con tu sistema de membresias.",
    featured: true,
  },
  {
    icon: "group",
    title: "Gestion de Miembros",
    description:
      "Registro completo con perfiles, historial de pagos, estado de suscripcion y asignacion de entrenadores. Busqueda, filtros y exportacion de datos.",
  },
  {
    icon: "payments",
    title: "Pagos Multi-Moneda",
    description:
      "Acepta pagos en dolares y moneda local con tasa de cambio en tiempo real. Registro de transferencias, validacion manual y reportes financieros detallados.",
  },
  {
    icon: "calendar_month",
    title: "Clases y Horarios",
    description:
      "Programa clases grupales con frecuencia semanal o unica. Control de cupo, asignacion de entrenadores y vista de clases del dia en el dashboard.",
  },
  {
    icon: "fitness_center",
    title: "Rutinas de Entrenamiento",
    description:
      "Biblioteca de ejercicios con grupos musculares y multimedia. Los entrenadores crean rutinas personalizadas con series, repeticiones y descanso.",
  },
  {
    icon: "analytics",
    title: "Reportes y Analytics",
    description:
      "KPIs de ingresos, retencion de miembros, ocupacion de clases y tendencias de crecimiento. Graficos interactivos y exportacion a PDF.",
  },
]

const STATS = [
  { value: "500+", label: "Miembros Gestionados" },
  { value: "50+", label: "Gimnasios Activos" },
  { value: "99.9%", label: "Disponibilidad" },
  { value: "8+", label: "Paises Soportados" },
]

const STEPS = [
  {
    step: "01",
    icon: "settings",
    title: "Configura tu Gimnasio",
    description:
      "Crea tu organizacion, define tus planes de membresia, configura metodos de pago y personaliza tu marca en minutos.",
  },
  {
    step: "02",
    icon: "person_add",
    title: "Registra tus Miembros",
    description:
      "Invita a tus miembros por enlace, registra sus datos y asigna suscripciones. Ellos reciben acceso a la app movil.",
  },
  {
    step: "03",
    icon: "trending_up",
    title: "Controla y Crece",
    description:
      "Monitorea ingresos, controla el acceso fisico, gestiona clases y toma decisiones basadas en datos reales de tu negocio.",
  },
]

const TESTIMONIALS = [
  {
    quote:
      "Desde que implementamos Fit-Stack, la administracion de nuestras tres sedes es impecable. El control de acceso biometrico elimino las membresias compartidas y los pagos multi-moneda nos simplificaron la contabilidad.",
    name: "Alejandro Marin",
    role: "Director",
    company: "Premium Gym",
  },
  {
    quote:
      "Lo que mas valoro es la visibilidad financiera. Antes llevaba todo en Excel y siempre habia descuadres. Ahora veo exactamente cuanto entra, de donde viene cada pago y puedo proyectar el mes siguiente.",
    name: "Carolina Reyes",
    role: "Gerente General",
    company: "Iron Fitness",
  },
  {
    quote:
      "El sistema de clases transformo nuestra oferta. Los miembros reservan desde la app, los entrenadores ven su agenda y nosotros controlamos el cupo sin llamadas ni WhatsApp.",
    name: "Miguel Torres",
    role: "Propietario",
    company: "CrossBox Training",
  },
]

export default function Page() {
  return (
    <>
      <Navbar
        brandName="FIT"
        brandAccent="STACK"
        brandIcon="fitness_center"
        items={NAV_ITEMS}
        ctaLabel="Solicitar Demo"
      />

      <main>
        <Hero
          eyebrow="Software de Gestion Fitness"
          heading={
            <>
              GESTIONA TU GIMNASIO{" "}
              <TitleAccent>SIN LIMITES</TitleAccent>
            </>
          }
          description="La plataforma todo-en-uno para controlar miembros, pagos, clases y acceso fisico de tu centro deportivo. Multi-moneda, multi-sede y con tecnologia biometrica integrada."
          primaryCta="Solicitar Demo"
          secondaryCta="Ver Funcionalidades"
          minHeight="100vh"
          className="pt-20"
        />

        <section className="py-24 border-t border-[--color-border]">
          <div className="section-container">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {STATS.map((stat) => (
                <div key={stat.label} className="flex flex-col items-center text-center gap-2">
                  <span className="text-5xl md:text-6xl font-black italic tracking-tighter text-[--color-primary]">
                    {stat.value}
                  </span>
                  <span className="text-sm font-bold uppercase tracking-widest text-[--color-foreground-muted]">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <OurServices
          eyebrow="Funcionalidades"
          title={
            <>
              TODO LO QUE <TitleAccent>NECESITAS</TitleAccent>
            </>
          }
          description="Un ecosistema completo que transforma la complejidad de gestionar un gimnasio en operaciones simples y automatizadas."
          services={SERVICES}
          columns={3}
          className="border-t border-[--color-border]"
        />

        <section
          id="como-funciona"
          className="py-[--spacing-section] border-t border-[--color-border] px-6"
        >
          <div className="section-container">
            <SectionHeader
              eyebrow="Proceso"
              title={
                <>
                  COMO <TitleAccent>FUNCIONA</TitleAccent>
                </>
              }
              description="Tres pasos para transformar la operacion de tu gimnasio con tecnologia de vanguardia."
              align="left"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {STEPS.map((item) => (
                <div
                  key={item.step}
                  className="relative flex flex-col gap-6 p-8 rounded-xl bg-[--color-glass-bg] backdrop-blur-md border border-[--color-border] group transition-all duration-300 hover:border-[--color-border-primary]"
                >
                  <span className="text-7xl font-black italic tracking-tighter text-[--color-border] leading-none select-none">
                    {item.step}
                  </span>
                  <span
                    className="material-symbols-outlined text-4xl text-[--color-primary] transition-transform duration-300 group-hover:scale-110"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <h4 className="text-xl font-bold leading-tight">{item.title}</h4>
                  <p className="text-sm text-[--color-foreground-muted] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="testimonios"
          className="py-[--spacing-section] border-t border-[--color-border] px-6"
        >
          <div className="section-container">
            <SectionHeader
              eyebrow="Testimonios"
              title={
                <>
                  LO QUE DICEN <TitleAccent>NUESTROS CLIENTES</TitleAccent>
                </>
              }
              description="Gimnasios y centros deportivos que ya transformaron su operacion con Fit-Stack."
              align="left"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {TESTIMONIALS.map((t) => (
                <div
                  key={t.name}
                  className="flex flex-col gap-6 p-8 rounded-xl bg-[--color-surface] border border-[--color-border] transition-all duration-300 hover:border-[--color-border-primary]"
                >
                  <span
                    className="material-symbols-outlined text-3xl text-[--color-primary] opacity-40"
                    aria-hidden="true"
                  >
                    format_quote
                  </span>
                  <p className="text-[--color-foreground-muted] leading-relaxed text-sm flex-1">
                    {t.quote}
                  </p>
                  <div className="flex items-center gap-3 pt-4 border-t border-[--color-border-muted]">
                    <div className="w-10 h-10 rounded-full bg-[--color-primary] flex items-center justify-center text-black font-black text-sm">
                      {t.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">{t.name}</span>
                      <span className="text-xs text-[--color-foreground-muted]">
                        {t.role} — {t.company}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-[--spacing-section] border-t border-[--color-border] px-6">
          <div className="section-container">
            <div className="relative rounded-2xl border border-[--color-border-primary] bg-[--color-glass-bg] backdrop-blur-md p-12 md:p-20 text-center overflow-hidden shadow-[0_0_80px_var(--color-primary-glow)]">
              <Eyebrow className="mb-4 tracking-[0.3em]">Comienza Hoy</Eyebrow>
              <Title as="h2" size="section" className="mb-6">
                TRANSFORMA TU <TitleAccent>GIMNASIO</TitleAccent>
              </Title>
              <p className="text-[--color-foreground-muted] max-w-xl mx-auto mb-10 leading-relaxed">
                Unete a los gimnasios que ya gestionan sus miembros, pagos y acceso fisico desde una sola plataforma. Configuracion en minutos, soporte en espanol.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="primary" size="xl">
                  Solicitar Demo Gratuita
                </Button>
                <Button variant="outlined" size="xl">
                  Contactar Ventas
                </Button>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-[--color-border] py-12 px-6">
          <div className="section-container">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
              <div className="flex flex-col gap-3">
                <span className="text-xl font-black tracking-tighter italic">
                  FIT<span className="text-[--color-primary]">STACK</span>
                </span>
                <p className="text-sm text-[--color-foreground-muted] leading-relaxed">
                  Software de gestion fitness para gimnasios y centros deportivos en Latinoamerica.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-[--color-foreground-muted]">
                  Producto
                </span>
                <a href="#funcionalidades" className="text-sm text-[--color-foreground] hover:text-[--color-primary] transition-colors">
                  Funcionalidades
                </a>
                <a href="#como-funciona" className="text-sm text-[--color-foreground] hover:text-[--color-primary] transition-colors">
                  Como Funciona
                </a>
                <a href="#testimonios" className="text-sm text-[--color-foreground] hover:text-[--color-primary] transition-colors">
                  Testimonios
                </a>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-[--color-foreground-muted]">
                  Soporte
                </span>
                <span className="text-sm text-[--color-foreground]">
                  soporte@fit-stack.com
                </span>
                <span className="text-sm text-[--color-foreground]">
                  +58 424-1234567
                </span>
                <span className="text-sm text-[--color-foreground-muted]">
                  Lunes a Viernes, 8am - 6pm
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-[--color-foreground-muted]">
                  Legal
                </span>
                <span className="text-sm text-[--color-foreground]">
                  Terminos de Servicio
                </span>
                <span className="text-sm text-[--color-foreground]">
                  Politica de Privacidad
                </span>
              </div>
            </div>

            <div className="pt-8 border-t border-[--color-border] flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-[--color-foreground-muted]">
                2025 Fit-Stack. Todos los derechos reservados.
              </span>
              <Badge variant="outline" size="sm">
                Hecho en Latinoamerica
              </Badge>
            </div>
          </div>
        </footer>
      </main>
    </>
  )
}
