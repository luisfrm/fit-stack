import * as React from "react";
import { Upload, X, Lock } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Text } from "@workspace/ui/components/text";

export interface ImageUploadProps {
  value?: string;
  onChange: (file: File | null) => void;
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  disabled,
  className,
  label,
  description
}: Readonly<ImageUploadProps>) {
  const [preview, setPreview] = React.useState<string | undefined>(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    setPreview(value);
  }, [value]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onChange(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPreview(undefined);
    onRemove();
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-4 w-full", className)}>
      {label && (
        <Text variant="muted" size="sm" weight="bold" uppercase>
          {label}
        </Text>
      )}

      <div className="relative w-full max-w-40">
        <label
          htmlFor={id}
          className={cn(
            "relative aspect-square w-full rounded-2xl border-2 border-dashed border-white/10 bg-white/5 flex flex-col items-center justify-center transition-all cursor-pointer group hover:border-primary/50 overflow-hidden outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-black",
            disabled && "opacity-60 cursor-not-allowed",
            preview && "border-solid border-white/20"
          )}
        >
          <input
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            ref={inputRef}
            onChange={handleFileChange}
            disabled={disabled}
          />

          {preview ? (
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className={cn(
                "p-4 rounded-full bg-white/5 text-slate-400 border border-white/5 transition-all",
                !disabled && "group-hover:text-primary group-hover:bg-primary/10"
              )}>
                {disabled ? <Lock className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
              </div>
            </div>
          )}
        </label>

        {preview && !disabled && (
          <div className="absolute -top-2 -right-2 z-10">
            <Button
              type="button"
              variant="danger"
              size="icon"
              rounded="lg"
              onClick={handleRemove}
              className="h-8 w-8 shadow-xl border-2 border-black/50 hover:scale-110 transition-transform"
              title="Eliminar imagen"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {description && (
        <Text size="xs" variant="muted" italic>
          {description}
        </Text>
      )}
    </div>
  );
}
