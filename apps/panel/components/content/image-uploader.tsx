"use client";

import * as React from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Text, Button, toast, Label } from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import { uploadService } from "@/lib/services/upload-service";

interface ImageUploaderProps {
  value?: string;
  onChange: (key: string) => void;
  label?: string;
}

/**
 * ImageUploader - Handles direct upload to Cloudflare R2 via Presigned URLs.
 */
export function ImageUploader({ value, onChange, label }: Readonly<ImageUploaderProps>) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const imageUrl = value ? uploadService.getMediaUrl(value) : null;

  const uploadFile = async (file: File) => {
    // Basic validation
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen");
      return;
    }

    try {
      setIsUploading(true);

      // Public site assets: `cms` folder (the only public one by design).
      const key = await uploadService.uploadFile(file, undefined, 'cms');

      // Notify success and update parent with the object key
      onChange(key);
      toast.success("Imagen subida con éxito");
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error("Error al subir la imagen");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  return (
    <div className="space-y-2">
      {label && <Text size="sm" weight="medium" className="text-slate-300">{label}</Text>}

      {imageUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "relative group overflow-hidden rounded-xl border border-dashed bg-white/5 transition-all min-h-[160px] flex flex-col items-center justify-center p-4",
            isDragging
              ? "border-primary/60 bg-primary/10 scale-[1.01]"
              : "border-white/10 hover:bg-white/[0.07]",
          )}
        >
          <div className="w-full h-full flex flex-col items-center gap-4">
            {/* Preview */}
            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                rounded="full"
                onClick={() => onChange("")}
                aria-label="Eliminar imagen"
                className="absolute top-2 right-2 h-7 w-7 p-0 bg-black/60 text-white hover:bg-rose-500/80 border-none transition-colors"
              >
                <X size={14} />
              </Button>
            </div>
            <Text size="xs" variant="muted" truncate className="max-w-[200px]">{value}</Text>
          </div>
        </div>
      ) : (
        <Label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "relative group overflow-hidden rounded-xl border border-dashed bg-white/5 transition-all min-h-[160px] flex flex-col items-center justify-center p-4 cursor-pointer focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background",
            isDragging
              ? "border-primary/60 bg-primary/10 scale-[1.01]"
              : "border-white/10 hover:bg-white/[0.07]",
            isUploading && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="sr-only"
            accept="image/*"
            onChange={handleUpload}
            disabled={isUploading}
          />
          <div className="flex flex-col items-center gap-3 py-4 text-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              {isUploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
            </div>
            <div>
              <Text weight="semibold" size="sm">Haz clic o arrastra una imagen</Text>
              <Text variant="muted" size="xs">PNG, JPG o WEBP (Máx. 5MB)</Text>
            </div>
          </div>
        </Label>
      )}
    </div>
  );
}
