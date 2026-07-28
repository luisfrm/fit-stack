import axios from "axios";
import { env } from "@/lib/config/envs";

const API_BASE_URL = env.apiBaseUrl || "http://localhost:3000";

/**
 * Global Axios instance for CMS API calls.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL + '/api',
  headers: {
    "Content-Type": "application/json",
  },
  // If we're using cookie-based auth, this ensures cookies are sent
  withCredentials: true,
});

/**
 * Optional: add interceptors for error handling or refreshing tokens
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si la organización no existe o fue eliminada, redirigimos para limpiar el contexto
    const errorCode = error.response?.data?.code;
    if (errorCode === 'ORGANIZATION_NOT_FOUND' && typeof window !== 'undefined') {
      window.location.href = '/reset-org-context';
    }
    return Promise.reject(error);
  }
);
