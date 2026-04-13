import { useEffect, useRef, useState, useCallback } from "react";

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularProgress({ percentage, size = 160, strokeWidth = 10 }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" data-testid="circular-progress">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
          style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.4))" }}
        />
      </svg>
      <span
        className="absolute text-3xl font-bold tracking-tight"
        style={{ color: "hsl(var(--foreground))", fontFamily: "var(--font-display)" }}
        data-testid="text-progress-percentage"
      >
        {Math.round(percentage)}%
      </span>
    </div>
  );
}

export function useSimulatedProgress(isLoading: boolean, isComplete: boolean) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isLoading && !isComplete) {
      setProgress(0);
      setVisible(true);
      startTimeRef.current = Date.now();

      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        let newProgress: number;

        if (elapsed < 2) {
          newProgress = (elapsed / 2) * 60;
        } else if (elapsed < 6) {
          newProgress = 60 + ((elapsed - 2) / 4) * 25;
        } else {
          newProgress = 85 + Math.min((elapsed - 6) * 0.8, 10);
        }

        setProgress(Math.min(newProgress, 95));
      }, 50);
    }

    return clearTimer;
  }, [isLoading, isComplete, clearTimer]);

  useEffect(() => {
    if (isComplete && visible) {
      clearTimer();
      setProgress(100);
      const timeout = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [isComplete, visible, clearTimer]);

  useEffect(() => {
    if (!isLoading && !isComplete && visible) {
      clearTimer();
      setVisible(false);
      setProgress(0);
    }
  }, [isLoading, isComplete, visible, clearTimer]);

  return { progress, visible };
}
