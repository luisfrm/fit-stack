"use client";

import * as React from "react";
import { Cpu, Info, Sparkles } from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Button } from "@workspace/ui/components/button";
import { Title, toast } from "@workspace/ui";
import { SimpleSelect } from "@workspace/ui/components";
import { PLATFORM_SETTINGS_KEYS } from "@/lib/config/platform-settings";
import { api } from "@/lib/api/client";

interface AiProviderSettingsProps {
  readonly initialSettings: Record<string, string>;
  readonly onSaved?: () => void | Promise<void>;
}

export function AiProviderSettings({ initialSettings, onSaved }: AiProviderSettingsProps) {
  const [provider, setProvider] = React.useState<string>(
    () => initialSettings[PLATFORM_SETTINGS_KEYS.AI_PROVIDER_DEFAULT] || "openrouter",
  );
  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      await api("/platform/settings", {
        method: "POST",
        body: {
          [PLATFORM_SETTINGS_KEYS.AI_PROVIDER_DEFAULT]: provider,
        },
      });
      toast.success("Proveedor IA actualizado correctamente");
      await onSaved?.();
    } catch (error) {
      console.error("Error saving AI provider:", error);
      toast.error("Error al guardar el proveedor IA");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">
            IA Provider
          </Title>
          <Text variant="muted">
            Define qué proveedor usa el chat del panel y su cadena de fallback. Se cachea en Redis
            (5 min) y tags, y afecta a todas las orgs.
          </Text>
        </div>
      </div>

      <div className="space-y-8 max-w-4xl">
        <Card variant="settings">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <div>
              <Text className="font-bold">Proveedor por defecto</Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">
                El otro es fallback automático
              </Text>
            </div>
          </div>

          <div className="p-4 bg-white/1 border border-white/5 rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <Text className="text-[10px] font-bold text-white/80 uppercase tracking-wider">
                Proveedor activo
              </Text>
            </div>
            <SimpleSelect
              label="Proveedor por defecto"
              value={provider}
              onChange={setProvider}
              options={[
                {
                  value: "openrouter",
                  label: "OpenRouter — z-ai/glm-5.2 · laguna-s-2.1 · nemotron-3.5 (free chain)",
                },
                {
                  value: "workers-ai",
                  label: "Workers AI — GLM 4.7 Flash + fallback OpenRouter free chain",
                },
              ]}
            />
            <div className="flex flex-col gap-1 text-[9px] text-white/40 leading-relaxed">
              <span className="flex gap-2 italic">
                <Info className="w-3.5 h-3.5 text-white/20 shrink-0" />
                Cadena OpenRouter: z-ai/glm-5.2:free → poolside/laguna-s-2.1:free →
                nvidia/nemotron-3.5-lightning:free.
              </span>
              <span className="italic pl-5">
                Workers AI text: @cf/zai-org/glm-4.7-flash · Embedding:
                @cf/baai/bge-m3 (1024 dims, embeddings siempre en Workers AI):
                nemotron-3-embed-1b:free · llama-nemotron-embed-vl-1b-v2:free.
              </span>
              <span className="italic pl-5">
                El chat prueba la cadena del provider elegido; si falla usa la del otro. Cache
                Redis 5 min + tag console:settings.
              </span>
            </div>
          </div>
        </Card>

        <Card variant="settings" className="justify-between relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <Text weight="bold" size="lg" className="tracking-tight">
              ¿Deseas aplicar este proveedor?
            </Text>
            <Text variant="muted" size="sm" className="leading-relaxed">
              Se aplicará al chat del panel para todas las organizaciones tras guardar.
            </Text>
          </div>

          <div className="flex flex-col-reverse md:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              onClick={handleSave}
              loading={isUpdating}
              className="w-full md:w-auto md:px-8 h-14 md:h-12 text-sm font-bold uppercase tracking-[0.1em]"
            >
              Guardar Proveedor IA
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
