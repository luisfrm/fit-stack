import * as React from "react";
import { MoveRight } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";
import { ColorUtils } from "@workspace/ui/lib/color-utils";

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

    // Detect format of incoming value
    React.useEffect(() => {
      if (value.startsWith("oklch")) setFormat("oklch");
      else if (value.startsWith("rgb")) setFormat("rgba");
    }, [value]);

    const displayValue = React.useMemo(() => {
      if (!value) return "";
      return ColorUtils.formatForDisplay(value, format);
    }, [value, format]);

    const handleFormatToggle = (e: React.MouseEvent) => {
      e.preventDefault();
      const formats: ColorFormat[] = ["hex", "rgba", "oklch"];
      const nextIndex = (formats.indexOf(format) + 1) % formats.length;
      const nextFormat = formats[nextIndex];
      if (nextFormat) setFormat(nextFormat);
    };

    const handleInputChange = (val: string) => {
      if (ColorUtils.isValid(val)) {
        // We ALWAYS emit OKLCH to the parent (as per requirement: "al guardarlos en db siempre seran oklch")
        const oklch = ColorUtils.toOklch(val);
        onChange(oklch);
      } else {
        // If invalid, let the parent know the raw string so it stays in the input
        onChange(val);
      }
    };

    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center justify-between">
          {label && (
            <Label
              htmlFor={id}
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40"
            >
              {label}
            </Label>
          )}

          <button
            type="button"
            onClick={handleFormatToggle}
            className="text-[9px] uppercase font-bold text-primary hover:underline transition-all flex items-center gap-1 cursor-pointer"
          >
            Formato: {format}
            <MoveRight className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 group">
          <div
            className="w-12 h-12 rounded-xl border border-white/10 shrink-0 shadow-2xl relative overflow-hidden transition-transform group-hover:scale-105 active:scale-95 cursor-pointer ring-offset-2 ring-offset-background group-focus-within:ring-2 group-focus-within:ring-primary"
            style={{ backgroundColor: ColorUtils.isValid(value) ? value : "transparent" }}
          >
            <input
              type="color"
              value={ColorUtils.toHex(value) || "#000000"}
              onChange={(e) => handleInputChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
              id={id}
            />
          </div>
          <div className="flex-1 relative">
            <Input
              ref={ref}
              type="text"
              value={displayValue}
              onChange={(e) => handleInputChange(e.target.value)}
              className="font-mono uppercase bg-white/5 border-white/5 focus:border-primary/50 h-12 text-[13px] pr-10"
              placeholder={format === "hex" ? "#FCD303" : "oklch(...)"}
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
          <p className="text-[11px] text-white/30 italic leading-relaxed">
            {description}
          </p>
        )}
      </div>
    );
  }
);

ColorPicker.displayName = "ColorPicker";
