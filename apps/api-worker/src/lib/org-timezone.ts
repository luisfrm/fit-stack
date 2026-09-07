import { HTTPException } from 'hono/http-exception';

/**
 * Resuelve la zona horaria de la organización activa desde la sesión.
 *
 * La timezone es OBLIGATORIA para toda organización. No se usa ningún fallback:
 * si la org no la tiene configurada, se lanza un error en vez de asignar
 * silenciosamente una timezone incorrecta (que haría caer un pago de las 11pm
 * en el día equivocado).
 */
export function requireOrgTimezone(session: any): string {
  const timezone = session?.activeOrganization?.timezone;
  if (!timezone || !timezone.trim()) {
    throw new HTTPException(500, {
      message: 'La organización no tiene una zona horaria configurada',
    });
  }
  return timezone;
}
