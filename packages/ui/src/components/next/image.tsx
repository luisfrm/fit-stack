import * as React from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@workspace/ui/lib/utils";

interface NextImageProps extends Omit<ImageProps, "alt"> {
  readonly alt?: string;
  readonly fallbackSrc?: string;
  readonly containerClassName?: string;
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
  fill,
  width,
  height,
  ...props
}: NextImageProps) {
  const [error, setError] = React.useState(false);
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
        onError={() => setError(true)}
        {...props}
      />
    </div>
  );
}
