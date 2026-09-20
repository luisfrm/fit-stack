/**
 * Regla global de errores en el frontend: los mensajes del API JAMÁS se
 * muestran al usuario en toasts — solo en consola. El toast siempre usa un
 * mensaje genérico y accionable de la acción que falló.
 *
 * Uso:
 *   } catch (err) {
 *     toast.error(mutationError("OrgRenewalModal", err, "No se pudo registrar el pago"));
 *   }
 */
export function mutationError(
  scope: string,
  err: unknown,
  fallback: string,
): string {
  console.error(`[${scope}]`, err);
  return fallback;
}

/**
 * Código de negocio del error del API (`err.data.code`). Es la única forma
 * permitida de dar un mensaje específico: se compara el CÓDIGO, nunca el
 * texto del servidor (regla de toasts).
 */
export function apiCode(err: unknown): string | undefined {
  return (err as { data?: { code?: string } })?.data?.code;
}
