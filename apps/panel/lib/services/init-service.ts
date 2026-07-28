import { api, type ApiFetchOptions } from "@/lib/api/client";

const INIT_PATH = "/init";

export const initService = {
  async checkNeedsInit(
    options?: ApiFetchOptions,
  ): Promise<{ needsInit: boolean }> {
    return await api<{ needsInit: boolean }>(INIT_PATH, options);
  },

  async performInit(
    data: { name: string; email: string; password: string },
    options?: ApiFetchOptions,
  ): Promise<{ success: boolean }> {
    return await api<{ success: boolean }>(INIT_PATH, {
      method: "POST",
      body: data,
      ...options,
    });
  },

  async getStatus(
    options?: ApiFetchOptions,
  ): Promise<{ needsInit: boolean }> {
    return this.checkNeedsInit(options);
  },

  async init(data: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }): Promise<{ success: boolean }> {
    return this.performInit({
      name: data.name,
      email: data.email,
      password: data.password,
    });
  },
};
