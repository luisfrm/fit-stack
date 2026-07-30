/**
 * Maps known schema field keys to user-friendly Spanish labels.
 */
const FIELD_LABEL_MAP: Record<string, string> = {
  name: "Nombre",
  description: "Descripción",
  trainerName: "Entrenador",
  startTime: "Hora de inicio",
  endTime: "Hora de fin",
  capacity: "Capacidad",
  daysOfWeek: "Días de la semana",
  scheduledDate: "Fecha programada",
  frequencyType: "Tipo de frecuencia",
  email: "Correo electrónico",
  password: "Contraseña",
  firstName: "Nombre",
  lastName: "Apellido",
  phoneNumber: "Teléfono",
  documentId: "Documento de identidad",
};

/**
 * Formats Zod issues or API errors into a human-readable Spanish string.
 */
export function formatApiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const errObj = data as Record<string, any>;

  // Check if errors/issues exist in Zod or Hono response
  const rawError = errObj.error ?? errObj;

  if (rawError && typeof rawError === "object") {
    const issues = rawError.issues || errObj.issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const messages = issues.map((issue: any) => {
        // If custom Spanish message exists and is not generic "Required", use it directly
        if (
          issue.message &&
          issue.message !== "Required" &&
          !issue.message.startsWith("invalid_")
        ) {
          return issue.message;
        }

        const pathKey =
          Array.isArray(issue.path) && issue.path.length > 0
            ? String(issue.path[0])
            : "";
        const label = FIELD_LABEL_MAP[pathKey] || pathKey || "Campo";

        if (issue.code === "invalid_type" && issue.received === "undefined") {
          return `El campo "${label}" es requerido.`;
        }
        if (issue.message === "Required") {
          return `El campo "${label}" es requerido.`;
        }
        return `El campo "${label}" tiene un valor inválido.`;
      });

      return messages.join(" ");
    }

    if (typeof rawError.message === "string" && rawError.message.trim()) {
      return rawError.message;
    }
  }

  if (typeof errObj.error === "string" && errObj.error.trim()) {
    return errObj.error;
  }

  if (typeof errObj.message === "string" && errObj.message.trim()) {
    return errObj.message;
  }

  return null;
}

/**
 * Extracts a safe string error message from any caught error.
 */
export function getErrorMessage(error: unknown, fallback = "Algo salió mal"): string {
  if (!error) return fallback;

  if (typeof error === "string") {
    return error;
  }

  const errObj = error as Record<string, any>;
  const data = errObj.data ?? errObj.response?._data;

  const formattedDataError = formatApiErrorMessage(data);
  if (formattedDataError) {
    return formattedDataError;
  }

  const formattedObjError = formatApiErrorMessage(errObj);
  if (formattedObjError) {
    return formattedObjError;
  }

  if (
    typeof errObj.message === "string" &&
    errObj.message.trim() &&
    !errObj.message.startsWith("[object")
  ) {
    return errObj.message;
  }

  return fallback;
}
