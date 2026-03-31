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
    if (error.response?.status === 401) {
      if (typeof globalThis !== "undefined") {
        globalThis.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
