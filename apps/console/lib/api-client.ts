import axios from "axios";
import { env } from "@/lib/config/envs";

const API_BASE_URL = env.apiBaseUrl || "http://localhost:3000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL + '/api',
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorCode = error.response?.data?.code;
    if (errorCode === 'ORGANIZATION_NOT_FOUND' && typeof window !== 'undefined') {
      window.location.href = '/reset-org-context';
    }
    return Promise.reject(error);
  }
);