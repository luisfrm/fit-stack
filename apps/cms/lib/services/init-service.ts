import { apiClient } from "@/lib/api-client";

export const initService = {
  /**
   * Check if the system needs initial setup.
   * @returns NeedsInit response data
   */
  async checkNeedsInit() {
    try {
      const response = await apiClient.get('/init');
      return response.data as { needsInit: boolean; timestamp: string };
    } catch (error) {
      console.error("Error checking init status:", error);
      return { needsInit: false, error: "Failed to check status" };
    }
  },

  /**
   * Performs the initial registration for the first admin user.
   * @param data { name, email, password }
   */
  async performInit(data: any) {
    try {
      const response = await apiClient.post('/init', data);
      return response.data;
    } catch (error: any) {
      throw error.response?.data?.error || "Error al inicializar el sistema";
    }
  }
};
