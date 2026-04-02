"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { AlertCircle, Info, Trash2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export type ConfirmationVariant = "danger" | "info";

interface ConfirmationModalProps {
  /**
   * Controlled open state
   */
  open: boolean;
  /**
   * Callback when open state changes
   */
  onOpenChange: (open: boolean) => void;
  /**
   * Title of the confirmation
   */
  title: string;
  /**
   * Detailed description or warning message
   */
  description: string;
  /**
   * Text for the confirmation button
   * @default "Confirmar"
   */
  confirmText?: string;
  /**
   * Text for the cancel button
   * @default "Cancelar"
   */
  cancelText?: string;
  /**
   * Callback when confirmed
   */
  onConfirm: () => void | Promise<void>;
  /**
   * Visual variant
   * @default "info"
   */
  variant?: ConfirmationVariant;
  /**
   * Whether the confirm action is loading
   */
  isLoading?: boolean;
}

export function ConfirmationModal({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  variant = "info",
  isLoading = false,
}: Readonly<ConfirmationModalProps>) {

  const isDanger = variant === "danger";

  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden border-none shadow-2xl">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "shrink-0 size-12 rounded-full flex items-center justify-center",
                isDanger
                  ? "bg-red-600/10 text-red-600"
                  : "bg-primary/10 text-primary"
              )}
            >
              {isDanger ? (
                <AlertCircle className="size-6" />
              ) : (
                <Info className="size-6" />
              )}
            </div>

            <div className="flex-1 pt-1">
              <DialogHeader className="p-0 text-left">
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {title}
                </DialogTitle>
                <DialogDescription className="mt-2 text-slate-500 leading-relaxed font-medium">
                  {description}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        <DialogFooter className="m-0 border-t border-input bg-surface-2/30 flex flex-col-reverse sm:flex-row gap-3">
          <Button
            type="button"
            variant="glass"
            size="md"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={isDanger ? "danger" : "primary"}
            size="md"
            onClick={handleConfirm}
            loading={isLoading}
            rightIcon={isDanger ? <Trash2 className="size-4" /> : undefined}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
