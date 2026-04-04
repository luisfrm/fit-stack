"use client";

import * as React from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Text, Button, toast } from "@workspace/ui/components";
import { cmsContentService } from "@/lib/services/cms-content-service";
import { getMediaUrl } from "@/lib/utils/media-utils";
import axios from "axios";

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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const imageUrl = value ? getMediaUrl(value) : null; 

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación básica
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen");
      return;
    }

    try {
      setIsUploading(true);
      
      // 1. Obtener Presigned URL desde nuestra API (carpeta 'cms' por defecto)
      const { presignedUrl, key } = await cmsContentService.getPresignedUrl(file.name, file.type, 'cms');
      
      // 2. Subir directamente a R2 usando la URL firmada
      await axios.put(presignedUrl, file, {
        headers: {
          "Content-Type": file.type,
        },
      });

      // 3. Notificar éxito y actualizar el padre con la KEY del objeto
      onChange(key);
      toast.success("Imagen subida con éxito");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Error al subir la imagen");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {label && <Text size="sm" weight="medium" className="text-slate-300">{label}</Text>}
      
      <div className="relative group overflow-hidden rounded-xl border border-dashed border-white/10 bg-white/5 hover:bg-white/[0.07] transition-all min-h-[160px] flex flex-col items-center justify-center p-4">
        {imageUrl ? (
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
                  className="absolute top-2 right-2 h-7 w-7 p-0 bg-black/60 text-white hover:bg-rose-500/80 border-none transition-colors"
                >
                  <X size={14} />
                </Button>
             </div>
             <Text size="xs" variant="muted" truncate className="max-w-[200px]">{value}</Text>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
               {isUploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
            </div>
            <div>
               <Text weight="semibold" size="sm">Haga clic o arrastre imagen</Text>
               <Text variant="muted" size="xs">PNG, JPG o WEBP (Máx. 5MB)</Text>
            </div>
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef}
          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" 
          accept="image/*"
          onChange={handleUpload}
          disabled={isUploading}
        />
      </div>
    </div>
  );
}
