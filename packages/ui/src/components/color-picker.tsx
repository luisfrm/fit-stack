import * as React from "react";
import { MoveRight } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";
import { ColorUtils } from "@workspace/ui/lib/color-utils";
import { Button } from "./button";

export interface ColorPickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string;
  value: string; // Incoming should ideally be OKLCH or HEX
  onChange: (value: string) => void;
  description?: string;
}

type ColorFormat = "hex" | "rgba" | "oklch";

export const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ className, label, value, onChange, description, ...props }, ref) => {
    const id = React.useId();
    const [format, setFormat] = React.useState<ColorFormat>("hex");

    // Internal state to handle typing (allows intermediate invalid states)
    const [tempValue, setTempValue] = React.useState("");
    const [isFocused, setIsFocused] = React.useState(false);

    // SYNC: Prop value -> local text (only if valid and NOT typing)
    React.useEffect(() => {
      // We only let the parent's value overwrite our local text if 
      // we are NOT currently focused (typing). This prevents shorthand expansion 
      // like "#fff" and cursor jumps while the user is in control.
      if (ColorUtils.isValid(value) && !isFocused) {
        setTempValue(ColorUtils.formatForDisplay(value, format));
      }
    }, [value, format, isFocused]);

    const handleFormatToggle = (e: React.MouseEvent) => {
      e.preventDefault();
      const formats: ColorFormat[] = ["hex", "rgba", "oklch"];
      const nextIndex = (formats.indexOf(format) + 1) % formats.length;
      const nextFormat = formats[nextIndex];
      if (nextFormat) setFormat(nextFormat);
    };

    const handleTextChange = (val: string) => {
      setTempValue(val); // Keep exactly what user types

      // If it becomes a valid color in ANY format, emit OKLCH to parent
      if (ColorUtils.isValid(val)) {
        const oklch = ColorUtils.toOklch(val);
        onChange(oklch);
      }
    };

    const handlePickerChange = (hex: string) => {
      // Picker ALWAYS gives HEX. Convert to OKLCH and emit.
      const oklch = ColorUtils.toOklch(hex);
      onChange(oklch);
      // Local tempValue will sync via useEffect
    };

    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            {label && (
              <Label
                htmlFor={id}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted"
              >
                {label}
              </Label>
            )}
            <span className="text-[10px] text-primary/60 font-medium">
              Ej: {ColorUtils.formatExamples[format]}
            </span>
          </div>

          <Button
            type="button"
            onClick={handleFormatToggle}
            variant="link"
            size="sm"
          >
            Formato: {format}
            <MoveRight className="w-2.5 h-2.5" />
          </Button>
        </div>

        <div className="flex items-center gap-3 group">
          <div
            className="w-12 h-12 rounded-xl border border-border shrink-0 shadow-2xl relative overflow-hidden transition-all group-hover:scale-105 active:scale-95 cursor-pointer ring-offset-2 ring-offset-background group-focus-within:ring-2 group-focus-within:ring-primary"
            style={{ backgroundColor: ColorUtils.isValid(value) ? value : "#000000" }}
          >
            <input
              type="color"
              value={ColorUtils.toHex(value) || "#000000"}
              onChange={(e) => handlePickerChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
              id={id}
            />
          </div>
          <div className="flex-1 relative">
            <Input
              ref={ref}
              type="text"
              value={tempValue}
              onChange={(e) => handleTextChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                // When leaving, if we have a valid color, format it one last time to look nice
                if (ColorUtils.isValid(tempValue)) {
                  setTempValue(ColorUtils.formatForDisplay(tempValue, format));
                }
              }}
              className="font-mono uppercase"
              placeholder={ColorUtils.formatExamples[format]}
              {...props}
            />
            {format === "oklch" && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                <span className="text-[10px] font-bold">WIDE</span>
              </div>
            )}
          </div>
        </div>
        {description && (
          <p className="text-[11px] text-foreground-dim italic leading-relaxed">
            {description}
          </p>
        )}
      </div>
    );
  }
);

ColorPicker.displayName = "ColorPicker";
