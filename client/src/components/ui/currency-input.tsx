import * as React from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value?: string | number;
  onChange?: (value: number | string) => void;
  showPrefix?: boolean;
}

function formatNumberWithCommas(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  const numStr = String(value).replace(/[^0-9.-]/g, "");
  if (numStr === "" || numStr === "-") return numStr;
  const parts = numStr.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function parseFormattedNumber(value: string): string {
  return value.replace(/,/g, "");
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, showPrefix = true, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatNumberWithCommas(value));

    React.useEffect(() => {
      setDisplayValue(formatNumberWithCommas(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const numericValue = parseFormattedNumber(rawValue);
      
      if (numericValue === "" || /^-?\d*\.?\d*$/.test(numericValue)) {
        setDisplayValue(formatNumberWithCommas(numericValue));
        if (onChange) {
          const parsed = numericValue === "" ? "" : numericValue;
          onChange(parsed);
        }
      }
    };

    return (
      <div className="relative">
        {showPrefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
        )}
        <input
          type="text"
          inputMode="numeric"
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            showPrefix && "pl-7",
            className
          )}
          ref={ref}
          value={displayValue}
          onChange={handleChange}
          {...props}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

const NumberInput = React.forwardRef<HTMLInputElement, Omit<CurrencyInputProps, "showPrefix">>(
  (props, ref) => {
    return <CurrencyInput {...props} showPrefix={false} ref={ref} />;
  }
);
NumberInput.displayName = "NumberInput";

export { CurrencyInput, NumberInput, formatNumberWithCommas, parseFormattedNumber };
