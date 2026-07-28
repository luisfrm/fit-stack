"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Skeleton } from "./skeleton";

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  readonly fallbackText?: string;
  readonly fallbackIcon?: React.ReactNode;
  readonly containerClassName?: string;
}

export function SafeImage({
  src,
  alt,
  className,
  containerClassName,
  fallbackText = "Imagen no encontrada",
  fallbackIcon,
  onError,
  onLoad,
  ...props
}: SafeImageProps) {
  const [hasError, setHasError] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => {
    setHasError(false);
    setIsLoaded(false);

    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setIsLoaded(true);
      } else {
        setHasError(true);
      }
    }
  }, [src]);

  if (!src || hasError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-2 rounded-lg border border-border bg-foreground/5 text-foreground-dim select-none",
          containerClassName || className
        )}
      >
        {fallbackIcon || <ImageOff className="h-5 w-5 text-muted-foreground/60" />}
        {fallbackText && (
          <span className="text-[10px] text-muted-foreground/60 mt-1 text-center font-medium leading-tight">
            {fallbackText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden w-full h-full flex items-center justify-center", containerClassName)}>
      {!isLoaded && (
        <Skeleton className={cn("absolute inset-0 w-full h-full", className)} />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt || ""}
        className={cn(className, !isLoaded && "opacity-0 pointer-events-none")}
        onLoad={(e) => {
          setIsLoaded(true);
          if (onLoad) onLoad(e);
        }}
        onError={(e) => {
          setHasError(true);
          if (onError) onError(e);
        }}
        {...props}
      />
    </div>
  );
}
