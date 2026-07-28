import * as React from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface NextImageProps extends Omit<ImageProps, "alt"> {
  readonly alt?: string;
  readonly fallbackSrc?: string;
  readonly containerClassName?: string;
  readonly fallbackIcon?: React.ReactNode;
}

/**
 * Optimized Image component for Next.js with sensible defaults and error handling.
 */
export function NextImage({
  src,
  alt = "Image",
  className,
  containerClassName,
  fallbackSrc,
  fallbackIcon,
  fill,
  width,
  height,
  onError,
  ...props
}: NextImageProps) {
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    setError(false);
  }, [src]);

  if (error && !fallbackSrc) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-1 rounded bg-foreground/5 text-foreground-dim select-none w-full h-full min-h-[32px] min-w-[32px]",
          containerClassName || className
        )}
      >
        {fallbackIcon || <ImageOff className="h-4 w-4 text-muted-foreground/60" />}
      </div>
    );
  }

  const imageSrc = error && fallbackSrc ? fallbackSrc : src;

  return (
    <div className={cn("relative overflow-hidden", containerClassName)}>
      <Image
        src={imageSrc}
        alt={alt}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        className={cn("object-cover", className)}
        onError={(e) => {
          setError(true);
          if (onError) onError(e);
        }}
        {...props}
      />
    </div>
  );
}
