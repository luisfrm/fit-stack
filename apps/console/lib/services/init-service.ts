import { api } from "@/lib/api/client";
import type { IInitCheckResponse, IInitSystemPayload } from "@workspace/shared/types";

/**
 * Service to handle platform initial setup and readiness status checks.
 */
export const initService = {
  /**
   * Checks whether the system requires initial setup.
   */
  async checkNeedsInit(): Promise<IInitCheckResponse> {
    return await api<IInitCheckResponse>("/init");
  },

  /**
   * Executes initial system setup with master administrator credentials.
   */
  async performInit(data: IInitSystemPayload): Promise<{ success: boolean; [key: string]: unknown }> {
    return await api<{ success: boolean; [key: string]: unknown }>("/init", {
      method: "POST",
      body: data,
    });
  },
};

