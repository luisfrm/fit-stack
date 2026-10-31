/**
 * Homepage FAQ. The same array feeds the visible accordion and the
 * `FAQPage` structured data, so the two can never drift.
 *
 * Answers are plain text on purpose: JSON-LD `acceptedAnswer.text` must not
 * carry markup. Source: `vaults/guides/knowledge-base-rag/`.
 */
import { formatAiCredits, formatPlanPrice, PLAN_BY_ID } from "./pricing";

export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

const PRICING_ANSWER = [
  `La referencia actual es ${formatPlanPrice(PLAN_BY_ID.basico.priceCents)} al mes por gimnasio en el plan Básico,`,
  `${formatPlanPrice(PLAN_BY_ID.standard.priceCents)} el Standard y`,
  `${formatPlanPrice(PLAN_BY_ID.premium.priceCents)} el Premium.`,
  "Todos incluyen el panel administrativo completo; las diferencias están en la página web (desde el plan Standard), el Portal de Miembros y los créditos IA:",
  `${formatAiCredits(PLAN_BY_ID.basico.aiCredits)} al mes en Básico,`,
  `${formatAiCredits(PLAN_BY_ID.standard.aiCredits)} en Standard y`,
  `${formatAiCredits(PLAN_BY_ID.premium.aiCredits)} en Premium.`,
  "Los precios y el contenido de cada plan los define el equipo Fit-Stack y pueden cambiar: confirma el valor vigente al contratar.",
].join(" ");

export const FAQ: readonly FaqItem[] = [
  {
    id: "free-trial",
    question: "¿Hay prueba gratis?",
    answer:
      "No manejamos pruebas gratuitas por tiempo limitado: la suscripción empieza a contar con el primer pago. Un plan de precio 0 es un plan gratuito, no una prueba: se asigna como cortesía operativa, no se cobra, no genera comprobante y no vence solo. Si en el futuro hay una promoción, llegará como cupón sobre tu suscripción (puede cubrir hasta el 100 % del precio), nunca como un periodo de prueba que se convierta solo en cobro.",
  },
  {
    id: "late-payment",
    question: "¿Qué pasa si me atraso en el pago?",
    answer:
      "El estado se calcula automáticamente cada día. Con el ciclo vigente y un pago válido estás Activa. De 1 a 7 días de retraso pasas a En mora: todo sigue funcionando, con un aviso en el panel. De 8 a 14 días pasas a Solo lectura: puedes consultar tus datos, pero no crear ni cobrar. Desde los 15 días quedas Suspendida y el acceso se bloquea hasta regularizar. Nunca pierdes tus datos: al pagar vuelves a Activa y recuperas el acceso completo sin reconfigurar nada.",
  },
  {
    id: "payment-currency",
    question: "¿Puedo cobrar en una moneda distinta a la de mi plan?",
    answer:
      "Sí. Tú decides qué monedas están activas y cobras en cualquiera de ellas. Al registrar un pago en moneda local, el panel consulta la tasa del momento en una fuente pública, la muestra en solo lectura y la guarda junto al pago. El equivalente en tu moneda principal se guarda con el pago, así los reportes no tienen que recalcular con tasas que ya cambiaron.",
  },
  {
    id: "downgrade",
    question: "¿Qué pasa si bajo de plan?",
    answer:
      "Las funciones que salen de tu plan dejan de verse en el menú, pero nada se borra. Tus páginas, publicaciones del blog, miembros del portal y conversaciones siguen guardadas, y al volver a subir todo reaparece tal como lo dejaste. Si entras por un enlace directo a una función que no incluye tu plan, ves el aviso de función no disponible con el botón para solicitar el cambio.",
  },
  {
    id: "data-isolation",
    question: "¿Cómo se protegen los datos de mi gimnasio?",
    answer:
      "Cada gimnasio es una organización independiente. Tus miembros, pagos, membresías, clases, entrenadores, página web y configuración están separados por organización, así que ningún otro gimnasio puede verlos. El asistente IA y los reportes solo trabajan con los datos de tu organización. Si administras varias sedes, cada una es una organización distinta y no hay cruce de información entre ellas.",
  },
  {
    id: "plans-and-prices",
    question: "¿Cuánto cuesta y qué incluye cada plan?",
    answer: PRICING_ANSWER,
  },
];
