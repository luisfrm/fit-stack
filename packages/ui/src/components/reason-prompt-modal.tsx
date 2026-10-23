"use client";

import * as React from "react";
import { Modal } from "@workspace/ui/components/modal";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";

export type ReasonPromptVariant = "danger" | "primary";

export interface ReasonPromptModalProps {
  /** Controlled open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Field label (callers add the required marker). */
  label?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  /** Button variant of the confirm action. */
  variant?: ReasonPromptVariant;
  /** Disables the field and the buttons while the mutation runs. */
  isLoading?: boolean;
  /** Receives the trimmed text. Never called with a blank value. */
  onConfirm: (reason: string) => void | Promise<void>;
  /** Prefix of the `data-testid` hooks (input + confirm button). */
  testId?: string;
}

/**
 * Mandatory free-text prompt on top of a confirmation: a single field, a
 * confirmation that stays disabled while the field is blank. Used where the
 * server requires an operator-supplied reason — the field starts empty, so a
 * fixed sentence is never confirmed by default (that would only move the
 * default from the server to the client).
 */
export function ReasonPromptModal({
  open,
  onOpenChange,
  title,
  description,
  label = "Motivo *",
  placeholder,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
  isLoading = false,
  onConfirm,
  testId = "reason-prompt",
}: Readonly<ReasonPromptModalProps>) {
  const [reason, setReason] = React.useState("");

  // Every open starts empty: a reason typed for one record must never travel
  // to another one (nor stand in for a missing one).
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmedReason = reason.trim();
  const formId = React.useId();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedReason || isLoading) return;
    await onConfirm(trimmedReason);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isLoading) onOpenChange(nextOpen);
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button
            type="button"
            variant="glass"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={variant}
            size="sm"
            loading={isLoading}
            disabled={!trimmedReason}
            data-testid={`${testId}-confirm`}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <Textarea
          id={`${testId}-input`}
          data-testid={`${testId}-input`}
          label={label}
          placeholder={placeholder}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={isLoading}
          required
          rows={3}
          autoFocus
        />
      </form>
    </Modal>
  );
}
