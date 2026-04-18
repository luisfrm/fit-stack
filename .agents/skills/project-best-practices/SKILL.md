---
name: project-best-practices
description: Estándares arquitectónicos, de diseño y desarrollo específicos para el ecosistema Fit-Stack. Asegura la consistencia entre planes de membresía, gestión de socios y multi-tenancy.
---

# Fit-Stack: Guía de Mejores Prácticas

Esta skill define las reglas innegociables para el desarrollo de Fit-Stack. Úsala para validar cualquier propuesta de código nueva.

## 1. Arquitectura Backend (3 Capas)

El backend debe estar estrictamente separado en tres capas para garantizar mantenibilidad y aislamiento.

### Capa 1: Route Handler (`app/api/.../route.ts`)
- **Responsabilidad**: Interfaz HTTP y seguridad inicial.
- **Acciones**:
  - Obtener la sesión mediante `getSession()`.
  - Extraer `activeOrganizationId` del objeto session.
  - Validar permisos básicos si es necesario.
  - Parsear el cuerpo de la petición (DTO).
  - Devolver la respuesta formateada con `NextResponse`.

```typescript
// Ejemplo de Route
export async function POST(req: NextRequest) {
  const session = await getSession();
  const organizationId = session?.session?.activeOrganizationId;
  if (!organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await req.json();
  const result = await resourceService.create(organizationId, payload);
  return NextResponse.json(result);
}
```

### Capa 2: Service (`services/...service.ts`)
- **Responsabilidad**: Lógica de negocio y orquestación.
- **Acciones**:
  - Validar reglas de negocio (ej. "el socio no puede tener dos pagos pendientes").
  - Coordinar múltiples repositorios si es necesario.
  - Llamar a servicios externos (Email, Upload, PDF).
  - **REGLA**: Nunca escribir consultas SQL (Select, Insert) directamente aquí.

### Capa 3: Repository (`repositories/...repository.ts`)
- **Responsabilidad**: Acceso a datos e integridad del esquema.
- **Acciones**:
  - Ejecutar consultas utilizando **Drizzle ORM**.
  - Filtrar obligatoriamente por `organizationId` para garantizar multi-tenancy.
  - Mapear tipos de base de datos a DTOs limpios si es necesario.

---

## 2. Sistema de Diseño y UI (Zero Hardcode Policy)

### Política de "Cero Hardcodeo"
Está **ESTRICTAMENTE PROHIBIDO** usar clases arbitrarias de Tailwind (ej. `bg-red-500`, `h-[49px]`, `p-[13px]`) si el componente ya maneja esos estados mediante variantes.
- Si necesitas un cambio de estilo, usa las props `variant` y `size`.
- Si una variante no existe, consulta al usuario antes de implementarla en el paquete UI.

### Componentes Estándar
Importar siempre desde `@workspace/ui/components`:

- **Tipografía**:
  - `<Title>`: Usado para todos los encabezados (H1-H4).
  - `<Text>`: Usado para párrafos, leyendas y contenido descriptivo.
- **Contenedores**:
  - `<Card>`: Para superficies intermedias.
  - `<Modal>` / `<Dialog>`: Para ventanas emergentes y confirmaciones.
- **Controles**:
  - `<Button>`, `<Input>`, `<Select>`, `<Badge>`. Siempre respetar sus variantes predefinidas.

---

## 3. Manejo de Sesión y Multi-tenancy

El `organizationId` es el ancla de seguridad del sistema.
- **Backend**: Extraerlo siempre del servidor (`getSession`). No confiar en el `id` enviado por el cliente en el body si este puede ser manipulado.
- **Aislamiento**: Cada consulta en el repositorio debe incluir `.where(eq(schema.organizationId, organizationId))`.

---

## 4. Branding Dinámico y OKLCH

Fit-Stack utiliza un sistema de temas basado en tokens de color inyectados dinámicamente.
- **ThemeInjector**: Gestiona el cambio entre clases `.light` y `.dark`.
- **Colors**: Los colores principales (`--primary`, `--primary-hover`) se calculan usando OKLCH para garantizar contraste.
- **Estándares Visuales**:
  - Fondos: `bg-background`, `bg-surface`, `bg-card`.
  - Bordes: `border-border`, `border-white/10`.
  - Legibilidad: Usar `text-foreground` y `text-muted-foreground`.

---

## 5. Manejo de Errores y Feedback

### Frontend (Toast)
Toda mutación (Crear, Editar, Borrar) debe estar envuelta en un `try/catch`.
- **Éxito**: Mostrar `toast.success("Mensaje claro")`.
- **Error**: Mostrar `toast.error(errorMessage || "Error genérico")`.
- Asegurarse de que el error del servidor se propague correctamente al cliente.

```typescript
try {
  await service.execute();
  toast.success("Operación exitosa");
} catch (error: any) {
  toast.error(error.message || "Error al procesar la solicitud");
}
```
