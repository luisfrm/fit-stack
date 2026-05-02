"use client";

import * as React from "react";
import {
  CreditCard,
  Plus,
  Trash2,
  Settings2,
  ListPlus,
  Type,
  FileImage,
  Hash,
  Sparkles,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Modal } from "@workspace/ui/components/modal";
import { Switch } from "@workspace/ui/components/switch";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { Title, toast } from "@workspace/ui";
import { cn } from "@workspace/ui/lib/utils";
import { type IPaymentMethodConfig, type IPaymentMethodField } from "@workspace/shared/types";

const SUGGESTED_METHODS: IPaymentMethodConfig[] = [
  {
    id: "pago_movil",
    name: "Pago Móvil",
    fields: [
      { id: "fld_pm1", label: "Referencia de Pago", type: "text", required: true },
      { id: "fld_pm2", label: "Banco Emisor", type: "text", required: true },
      { id: "fld_pm3", label: "Captura de Pantalla", type: "file", required: false },
    ]
  },
  {
    id: "zelle",
    name: "Zelle",
    fields: [
      { id: "fld_z1", label: "Email de cuenta emisora", type: "text", required: true },
      { id: "fld_z2", label: "Nombre del titular", type: "text", required: false },
    ]
  },
  {
    id: "cash",
    name: "Efectivo",
    fields: []
  },
  {
    id: "transferencia",
    name: "Transferencia Bancaria",
    fields: [
      { id: "fld_tb1", label: "Número de Referencia", type: "text", required: true },
      { id: "fld_tb2", label: "Banco Destino", type: "text", required: true },
    ]
  }
];

export default function PaymentMethodsSettingsPage() {
  const { settings, isLoading, isUpdating, updateSettings } = useSettings();

  const [paymentMethods, setPaymentMethods] = React.useState<IPaymentMethodConfig[]>([]);
  const [editingMethod, setEditingMethod] = React.useState<IPaymentMethodConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  React.useEffect(() => {
    if (settings) {
      const activePay = settings[SETTINGS_KEYS.ACTIVE_PAYMENT_METHODS];
      if (activePay) {
        try {
          const parsed = JSON.parse(activePay);
          const normalized = parsed.map((p: any) =>
            typeof p === 'string' ? { id: p.toLowerCase(), name: p, fields: [] } : p
          );
          setPaymentMethods(normalized);
        } catch (e) {
          console.error("Error parsing payment methods:", e);
          setPaymentMethods([]);
        }
      }
    }
  }, [settings]);

  const handleOpenCreationModal = () => {
    const tempId = `method_${Date.now()}`;
    setEditingMethod({ id: tempId, name: "", fields: [] });
    setIsModalOpen(true);
  };

  const handleAddSuggestedMethod = (suggested: IPaymentMethodConfig) => {
    if (paymentMethods.some(m => m.id === suggested.id)) {
      toast.error("Este método ya está agregado");
      return;
    }
    setPaymentMethods([...paymentMethods, suggested]);
  };

  const handleUpdateMethod = (updated: IPaymentMethodConfig) => {
    if (!updated.name.trim()) {
      toast.error("El nombre del método es obligatorio");
      return;
    }

    setPaymentMethods(prev => {
      const exists = prev.some(m => m.id === updated.id);
      if (exists) {
        return prev.map(m => m.id === updated.id ? updated : m);
      }
      return [...prev, updated];
    });
    setIsModalOpen(false);
  };

  const handleRemovePaymentMethod = (id: string) => {
    setPaymentMethods(prev => prev.filter(m => m.id !== id));
  };

  const handleSave = async () => {
    try {
      await updateSettings({
        [SETTINGS_KEYS.ACTIVE_PAYMENT_METHODS]: JSON.stringify(paymentMethods),
      });
    } catch (error) {
      console.error("Error saving payment method settings:", error);
    }
  };

  if (isLoading) return null;

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <Title as="h3" size="card" className="tracking-tight">Métodos de Pago</Title>
          <Text variant="muted">Configura las formas de pago aceptadas y sus campos requeridos.</Text>
        </div>
      </div>

      <div className="space-y-8 max-w-4xl">
        <Card variant="settings">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <Text className="font-bold">Gestión de Cobros</Text>
              <Text className="text-[10px] text-foreground-dim uppercase tracking-wider font-bold">Personaliza los campos de captura por método</Text>
            </div>
          </div>

          <div className="space-y-6">
            {paymentMethods.length === 0 && (
              <div className="p-6 border-2 border-dashed border-border rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <Text className="text-[10px] font-bold uppercase tracking-wider">Sugerencias rápidas</Text>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_METHODS.map(suggested => (
                    <Button
                      key={suggested.id}
                      variant="glass"
                      fullWidth
                      onClick={() => handleAddSuggestedMethod(suggested)}
                      className="justify-between px-4 h-12"
                      rightIcon={<ChevronRight className="w-4 h-4 text-foreground-dim group-hover:text-primary transition-colors" />}
                    >
                      <Text className="text-sm font-medium">{suggested.name}</Text>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleOpenCreationModal}
              className="w-full h-11 bg-transparent border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-foreground-muted hover:text-primary transition-all rounded-xl gap-2 font-medium text-xs uppercase tracking-wider"
              variant="ghost"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Método Personalizado
            </Button>

            <div className="space-y-2">
              {paymentMethods.map(method => (
                <div
                  key={method.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-foreground/3 border border-border group hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary" />
                    <div className="flex flex-col">
                      <Text className="text-sm font-medium">{method.name}</Text>
                      <Text className="text-[9px] text-foreground-dim uppercase font-bold tracking-tight">
                        {method.fields.length} campos configurados
                      </Text>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingMethod(method);
                        setIsModalOpen(true);
                      }}
                    >
                      <Settings2 className="w-4 h-4" />
                    </Button>
                    <button
                      onClick={() => handleRemovePaymentMethod(method.id)}
                      className="p-2 text-foreground-dim hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <Text className="text-[10px] text-amber-500/60 leading-relaxed italic">
                Haz clic en el icono de ajustes para configurar campos requeridos (referencia, captures, etc.) por cada método.
              </Text>
            </div>
          </div>
        </Card>

        {/* ACCIONES FINALES */}
        <Card variant="settings" className="justify-between relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <Text weight="bold" size="lg" className="tracking-tight">¿Deseas guardar estos métodos?</Text>
            <Text variant="muted" size="sm" className="leading-relaxed">
              La configuración de pagos se actualizará para todos los miembros de la sede.
            </Text>
          </div>

          <div className="flex flex-col-reverse md:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              onClick={handleSave}
              loading={isUpdating}
              disabled={isUpdating}
              className="w-full md:w-auto md:px-8 h-14 md:h-12 text-sm font-bold uppercase tracking-[0.1em]"
            >
              Guardar Métodos
            </Button>
          </div>
        </Card>
      </div>

      <PaymentMethodEditor
        method={editingMethod}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleUpdateMethod}
      />
    </div>
  );
}

interface PaymentMethodEditorProps {
  readonly method: IPaymentMethodConfig | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (method: IPaymentMethodConfig) => void;
}

function PaymentMethodEditor({ method, isOpen, onClose, onSave }: Readonly<PaymentMethodEditorProps>) {
  const [localMethod, setLocalMethod] = React.useState<IPaymentMethodConfig | null>(null);

  React.useEffect(() => {
    if (method) setLocalMethod(structuredClone(method));
  }, [method, isOpen]);

  if (!localMethod) return null;

  const handleAddField = () => {
    const newField: IPaymentMethodField = {
      id: `field_${Date.now()}`,
      label: "",
      type: "text",
      required: true
    };
    setLocalMethod({ ...localMethod, fields: [...localMethod.fields, newField] });
  };

  const handleUpdateField = (fieldId: string, updates: Partial<IPaymentMethodField>) => {
    setLocalMethod({
      ...localMethod,
      fields: localMethod.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
    });
  };

  const handleRemoveField = (fieldId: string) => {
    setLocalMethod({
      ...localMethod,
      fields: localMethod.fields.filter(f => f.id !== fieldId)
    });
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(val) => !val && onClose()}
      trigger={null}
      title={`Configurar: ${localMethod.name}`}
      className="max-w-xl"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <Text className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Nombre del Método</Text>
          <Input
            value={localMethod.name}
            onChange={(e) => setLocalMethod({ ...localMethod, name: e.target.value })}
            wrapperClassName="border-border"
            className="px-4"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListPlus className="w-4 h-4 text-primary" />
              <Text className="font-bold text-sm">Campos Requeridos</Text>
            </div>
            <Button variant="ghost" size="sm" onClick={handleAddField} className="text-primary hover:bg-primary/10">
              <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo Campo
            </Button>
          </div>

          <div className="space-y-3">
            {localMethod.fields.length === 0 ? (
              <div className="p-8 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2">
                <Settings2 className="w-8 h-8 text-foreground-dim" />
                <Text className="text-xs text-foreground-muted">No hay campos adicionales configurados.</Text>
              </div>
            ) : (
              localMethod.fields.map((field, idx) => (
                <div key={field.id} className="p-4 rounded-2xl bg-foreground/3 border border-border space-y-4 group">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Text className="text-[9px] font-bold text-foreground-dim uppercase tracking-tighter">Etiqueta del Campo</Text>
                      <Input
                        placeholder="Ej: Referencia, Correo..."
                        value={field.label}
                        onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                        wrapperClassName="h-9 border-border"
                        className="text-sm px-3"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveField(field.id)}
                      className="h-9 w-9 text-foreground-dim hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleUpdateField(field.id, { type: 'text' })}
                          className={cn(
                            "p-1.5 rounded-lg border transition-all h-auto",
                            field.type === 'text' ? "bg-primary/20 border-primary/40 text-primary" : "bg-foreground/5 border-transparent text-foreground-dim"
                          )}
                          title="Texto"
                        >
                          <Type className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleUpdateField(field.id, { type: 'file' })}
                          className={cn(
                            "p-1.5 rounded-lg border transition-all h-auto",
                            field.type === 'file' ? "bg-primary/20 border-primary/40 text-primary" : "bg-foreground/5 border-transparent text-foreground-dim"
                          )}
                          title="Archivo / Captura"
                        >
                          <FileImage className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleUpdateField(field.id, { type: 'number' })}
                          className={cn(
                            "p-1.5 rounded-lg border transition-all h-auto",
                            field.type === 'number' ? "bg-primary/20 border-primary/40 text-primary" : "bg-foreground/5 border-transparent text-foreground-dim"
                          )}
                          title="Número"
                        >
                          <Hash className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={field.required}
                          onCheckedChange={(val) => handleUpdateField(field.id, { required: val })}
                        />
                        <Text className="text-[10px] font-bold text-foreground-muted uppercase">Obligatorio</Text>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave(localMethod)}>Guardar Configuración</Button>
        </div>
      </div>
    </Modal>
  );
}
