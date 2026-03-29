import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

/**
 * Global Axios instance for CMS API calls.
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
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
    // We can centralize some error logic here if needed
    return Promise.reject(error);
  }
);
