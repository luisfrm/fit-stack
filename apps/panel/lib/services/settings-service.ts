import { api, type ApiFetchOptions } from "@/lib/api/client";

const SETTINGS_PATH = "/settings";

export const settingsService = {
  async getByKey(
    key: string,
    options?: ApiFetchOptions,
  ): Promise<string | undefined> {
    try {
      const data = await api<{ value: string }>(
        `${SETTINGS_PATH}/${key}`,
        options,
      );
      return data.value;
    } catch {
      return undefined;
    }
  },

  async getAll(
    options?: ApiFetchOptions,
  ): Promise<Record<string, string>> {
    return await api<Record<string, string>>(SETTINGS_PATH, options);
  },

  async update(
    settings: Record<string, string>,
  ): Promise<Record<string, string>> {
    return await api<Record<string, string>>(SETTINGS_PATH, {
      method: "POST",
      body: settings,
    });
  },
};
