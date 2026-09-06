/**
 * Regla global de errores en el frontend: los mensajes del API JAMÁS se
 * muestran al usuario en toasts — solo en consola. El toast siempre usa un
 * mensaje genérico y accionable de la acción que falló.
 *
 * Uso:
 *   } catch (err) {
 *     toast.error(mutationError("StaffCard", err, "No se pudo reenviar la invitación"));
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
