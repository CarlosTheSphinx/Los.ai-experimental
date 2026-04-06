import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X, ChevronUp, ChevronDown } from "lucide-react";

interface DropdownOptionsEditorProps {
  options: string[];
  onChange: (options: string[]) => void;
  label?: string;
  testIdPrefix?: string;
}

export function DropdownOptionsEditor({
  options,
  onChange,
  label = "Dropdown Options",
  testIdPrefix = "dropdown-options",
}: DropdownOptionsEditorProps) {
  const [inputValue, setInputValue] = useState("");

  const addOption = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      setInputValue("");
      return;
    }
    onChange([...options, trimmed]);
    setInputValue("");
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  const moveOption = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= options.length) return;
    const updated = [...options];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addOption();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(",")) {
      e.preventDefault();
      const newOpts = text.split(",").map(s => s.trim()).filter(Boolean);
      const unique = newOpts.filter(o => !options.includes(o));
      if (unique.length > 0) {
        onChange([...options, ...unique]);
      }
      setInputValue("");
    }
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-editor`}>
      <Label className="text-xs text-muted-foreground block">{label}</Label>

      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type an option and press Enter"
          className="bg-muted/50 border text-foreground text-sm"
          data-testid={`${testIdPrefix}-input`}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addOption}
          disabled={!inputValue.trim()}
          className="shrink-0"
          data-testid={`${testIdPrefix}-add-btn`}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>

      {options.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto" data-testid={`${testIdPrefix}-list`}>
          {options.map((option, index) => (
            <div
              key={`${option}-${index}`}
              className="flex items-center gap-1 bg-muted/30 border rounded px-2 py-1 group"
              data-testid={`${testIdPrefix}-item-${index}`}
            >
              <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">
                {index + 1}.
              </span>
              <span className="text-sm text-foreground flex-1 truncate">{option}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => moveOption(index, "up")}
                  disabled={index === 0}
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                  data-testid={`${testIdPrefix}-move-up-${index}`}
                >
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => moveOption(index, "down")}
                  disabled={index === options.length - 1}
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                  data-testid={`${testIdPrefix}-move-down-${index}`}
                >
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="p-0.5 rounded hover:bg-destructive/10"
                  data-testid={`${testIdPrefix}-remove-${index}`}
                >
                  <X className="h-3 w-3 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {options.length === 0 && (
        <p className="text-xs text-muted-foreground/60 italic">No options added yet</p>
      )}
    </div>
  );
}
