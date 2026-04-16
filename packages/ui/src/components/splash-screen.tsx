import * as React from "react";
import { Dumbbell, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Text } from "./text";

interface SplashScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
  fullScreen?: boolean;
}

export function SplashScreen({ 
  message, 
  fullScreen = true, 
  className, 
  ...props 
}: Readonly<SplashScreenProps>) {
  return (
    <div 
      className={cn(
        "flex w-full items-center justify-center",
        fullScreen ? "h-svh" : "min-h-[60vh] rounded-lg",
        className
      )} 
      style={{ backgroundColor: "var(--background)", fontFamily: "var(--font-sans, sans-serif)" }}
      {...props}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Animated Icon Group */}
        <div className="relative flex items-center justify-center p-2">
          {/* Subtle spinning ring */}
          <Loader2 
            size={96} 
            className="absolute text-primary/30 animate-spin duration-1000" 
            strokeWidth={1} 
          />
          {/* Core icon */}
          <div className="p-4 rounded-full bg-primary/10 animate-pulse">
            <Dumbbell size={40} className="text-primary" />
          </div>
        </div>
        
        {/* Brand Text */}
        <div className="flex flex-col items-center gap-2">
          <Text as="span" weight="bold" uppercase className="tracking-tight italic text-foreground text-2xl">
            Fit<span className="text-primary">Stack</span>
          </Text>
          
          {/* Optional Message */}
          {message && (
            <Text variant="subtle" size="sm" className="font-medium tracking-wide animate-pulse">
              {message}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}
