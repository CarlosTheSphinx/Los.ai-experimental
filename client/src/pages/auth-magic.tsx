import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function AuthMagicPage() {
  const [, params] = useRoute("/auth/magic/:token");
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const token = params?.token;

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const res = await fetch(`/api/auth/magic/${token}`, { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Invalid or expired magic link");
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        setLocation(data.redirectTo || "/", { replace: true });
      } catch {
        setError("Something went wrong. Please try again.");
      }
    };

    verify();
  }, [token, setLocation]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
        <div className="w-full max-w-md mx-4 bg-[#1a2332] border border-gray-700 rounded-lg p-8 text-center space-y-4">
          <div className="h-12 w-12 mx-auto text-red-400 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 className="text-lg font-semibold text-white" data-testid="text-magic-error-title">Link Invalid</h2>
          <p className="text-sm text-gray-400" data-testid="text-magic-error-message">{error}</p>
          <button
            onClick={() => setLocation("/login")}
            className="px-4 py-2 bg-[#C9A84C] hover:bg-[#b8973b] text-white rounded-md text-sm font-medium"
            data-testid="button-magic-go-login"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#C9A84C]" />
        <p className="text-sm text-gray-400" data-testid="text-magic-loading">Logging you in...</p>
      </div>
    </div>
  );
}