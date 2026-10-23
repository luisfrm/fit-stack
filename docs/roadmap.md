# Roadmap

> Ideas no comprometidas. El trabajo comprometido y su estado viven en Linear (proyecto «Fit Stack»).

## 1. App de escritorio

Empaquetar el panel como aplicación nativa (Tauri) para Windows/macOS/Linux.

- Icono propio para Dueños y Gerentes.
- Ventaja real: hablar directo con torniquetes y cámaras biométricas de recepción.
- Requiere una configuración condicional de build y un cliente HTTP que maneje las cookies de sesión fuera del navegador.

## 2. Operación sin conexión

Que el control de acceso de recepción registre entradas aunque el servidor no responda y sincronice los registros al recuperar la conexión.

## 3. Reportes y analíticas del gimnasio

- Reportes de asistencia y exportación de datos.
- Mapa de calor de horas de mayor afluencia, a partir de los registros de acceso.
- Export del ingreso SaaS en CSV/PDF para administración.

## 4. IA — créditos, RAG y escala

- **Estado por organización con Durable Objects**: hoy el servicio es sin estado y liquida el consumo después del stream. Solo hace falta estado coordinado si aparecen herramientas con memoria de sesión o cadenas largas de herramientas.
- **RAG fase 2**: además de la base global, indexar datos vivos por organización y una base de conocimiento propia del panel. Ideas sueltas: re-ranking, embeddings por idioma (es/pt) y caché de recuperación por hash.
- **Packs con recarga automática**: comprar créditos al agotar la cuota, con un tope diario para no quemar el mes. Requiere cobro con Stripe y un guard de gasto.
- **Modelos por organización**: multiplicador de crédito por modelo (por ejemplo, razonamiento ×2) y selector con vista previa de coste.
- **Observabilidad de créditos**: consumo por organización (créditos/día, proporción entrada/salida), alertas al 80 % y 100 %, y export para el equipo FitStack.

## 5. Analíticas SaaS (Console)

- **Gráfico de ingresos**: serie de 12 meses sobre el endpoint de revenue ya existente (hoy solo hay una mini-lista de 6 meses en el panel lateral).
- **Normalización multi-moneda real**: si algún día hay planes SaaS en monedas distintas, llevar todo a una moneda base con tasas históricas. Hoy los planes están en USD y el revenue suma el precio del plan.
- **Agregados en el servidor**: mover KPIs y filtros de la página de organizaciones al backend cuando el volumen lo pida.
- **Alertas de créditos** al 80 % y 100 % por correo.
