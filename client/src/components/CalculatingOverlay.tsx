import { CircularProgress } from "./CircularProgress";

interface CalculatingOverlayProps {
  progress: number;
  visible: boolean;
  label?: string;
}

export function CalculatingOverlay({
  progress,
  visible,
  label = "Calculating your rate...",
}: CalculatingOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        progress >= 100 ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ backgroundColor: "hsl(var(--background) / 0.85)", backdropFilter: "blur(8px)" }}
      data-testid="calculating-overlay"
    >
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-300">
        <CircularProgress percentage={progress} size={180} strokeWidth={12} />
        <p
          className="text-lg tracking-wide"
          style={{ color: "hsl(var(--muted-foreground))", fontFamily: "var(--font-ui)" }}
          data-testid="text-calculating-label"
        >
          {label}
        </p>
      </div>
    </div>
  );
}
