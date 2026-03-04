import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StructuredAddress {
  formatted: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectStructured?: (data: StructuredAddress) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

interface AddressSuggestion {
  formatted: string;
  properties: {
    formatted: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

function stripUSA(formatted: string): string {
  return formatted.replace(/,?\s*United States of America$/i, '').trim();
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelectStructured,
  placeholder = "Start typing an address...",
  className,
  id,
  "data-testid": testId,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/address/autocomplete?text=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.features || []);
        setShowDropdown(true);
      }
    } catch (error) {
      console.error("Address autocomplete error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  };

  const handleSelectAddress = (suggestion: AddressSuggestion) => {
    const raw = suggestion.properties?.formatted || suggestion.formatted;
    const formatted = stripUSA(raw);
    setInputValue(formatted);
    onChange(formatted);

    if (onSelectStructured) {
      onSelectStructured({
        formatted,
        addressLine1: suggestion.properties?.address_line1,
        city: suggestion.properties?.city,
        state: suggestion.properties?.state,
        zip: suggestion.properties?.postcode,
      });
    }

    setShowDropdown(false);
    setSuggestions([]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={cn("pl-10 pr-10", className)}
          data-testid={testId}
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectAddress(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-muted flex items-start gap-3 border-b border-border last:border-0"
              data-testid={`address-suggestion-${index}`}
            >
              <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-sm text-foreground">
                {stripUSA(suggestion.properties?.formatted || suggestion.formatted)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
