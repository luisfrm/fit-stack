export const EUR_EXCHANGE_URL = "https://open.er-api.com/v6/latest/EUR";
export const USD_EXCHANGE_URL = "https://open.er-api.com/v6/latest/USD";
export const BASE_EXCHANGE_API_URL = "https://open.er-api.com/v6/latest";

export const EUR_EXCHANGE_URL_V4 = "https://api.exchangerate-api.com/v4/latest/EUR";
export const USD_EXCHANGE_URL_V4 = "https://api.exchangerate-api.com/v4/latest/USD";

export const ROLE_MAP: Record<string | number, string> = {
  // Global Roles
  "admin": "Admin SaaS",
  
  // Organization Roles
  "owner": "Propietario",
  "manager": "Manager",
  "coach": "Entrenador",
  "trainer": "Entrenador",
  "cashier": "Cajero",
  "member": "Cliente",

  // Legacy Numeric Support
  1: "Administrador",
  2: "Manager",
  3: "Entrenador",
  4: "Cliente",
};