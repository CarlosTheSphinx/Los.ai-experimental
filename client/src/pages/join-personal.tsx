import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, CheckCircle, Lock, User, Building2, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface InviteInfo {
  email: string;
  fullName: string | null;
  userType: string;
  hasPassword: boolean;
  onboardingCompleted: boolean;
  dealCount: number;
}

export default function JoinPersonalPage() {
  const [, params] = useRoute("/join/personal/:token");
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const token = params?.token;
  const autoLoginAttempted = useRef(false);
  const [autoLoginError, setAutoLoginError] = useState<string | null>(null);
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
    fullName: "",
    phone: "",
    companyName: "",
  });
  const [registered, setRegistered] = useState(false);

  const { data: info, isLoading, error } = useQuery<InviteInfo>({
    queryKey: ["personal-invite", token],
    queryFn: async () => {
      const res = await fetch(`/api/join/personal/${token}/info`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Invalid invite link");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (info?.hasPassword && token && !autoLoginAttempted.current && !isAuthenticated) {
      autoLoginAttempted.current = true;
      setAutoLoggingIn(true);
      fetch(`/api/join/personal/${token}/auto-login`, {
        method: "POST",
        credentials: "include",
      })
        .then(async (res) => {
          if (res.ok) {
            window.location.href = "/";
          } else {
            setAutoLoginError("Auto-login failed. Please log in manually.");
            setAutoLoggingIn(false);
          }
        })
        .catch(() => {
          setAutoLoginError("Auto-login failed. Please log in manually.");
          setAutoLoggingIn(false);
        });
    }
  }, [info, token]);

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/join/personal/${token}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          password: formData.password,
          fullName: formData.fullName || undefined,
          phone: formData.phone || undefined,
          companyName: formData.companyName || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Registration failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRegistered(true);
      setTimeout(() => {
        if (data.userType === "borrower") {
          setLocation("/");
        } else {
          setLocation("/");
        }
      }, 2000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password.length < 8) return;
    if (formData.password !== formData.confirmPassword) return;
    registerMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#C9A84C]" />
          <p className="text-sm text-gray-400">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
        <Card className="w-full max-w-md mx-4 bg-[#1a2332] border-gray-700">
          <CardContent className="pt-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-red-400" />
            <h2 className="text-lg font-semibold text-white">Invalid Invite Link</h2>
            <p className="text-sm text-gray-400">
              This invite link is invalid or has expired. Please contact the sender for a new one.
            </p>
            <Button
              variant="outline"
              onClick={() => setLocation("/login")}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
              data-testid="button-go-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (info.hasPassword) {
    if (autoLoggingIn) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#C9A84C]" />
            <p className="text-sm text-gray-400">Signing you in...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
        <Card className="w-full max-w-md mx-4 bg-[#1a2332] border-gray-700">
          <CardContent className="pt-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Sign In Required</h2>
            <p className="text-sm text-gray-400">
              {autoLoginError || `Please log in to access your account (${info.email}).`}
            </p>
            <Button
              onClick={() => setLocation("/login")}
              className="bg-[#C9A84C] hover:bg-[#b8973b] text-white"
              data-testid="button-go-login-existing"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
        <Card className="w-full max-w-md mx-4 bg-[#1a2332] border-gray-700">
          <CardContent className="pt-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto text-green-400" />
            <h2 className="text-lg font-semibold text-white">Welcome!</h2>
            <p className="text-sm text-gray-400">
              Your account has been set up. Redirecting you now...
            </p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-[#C9A84C]" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const passwordValid = formData.password.length >= 8;
  const passwordsMatch = formData.password === formData.confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1729] p-4">
      <Card className="w-full max-w-md bg-[#1a2332] border-gray-700">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <h1 className="text-xl font-display tracking-wider text-[#C9A84C]">LENDRY AI</h1>
            <p className="text-[10px] tracking-[0.3em] text-gray-500 uppercase">Lending Intelligence</p>
          </div>
          <CardTitle className="text-white text-lg">Set Up Your Account</CardTitle>
          <CardDescription className="text-gray-400">
            Complete your registration to access the {info.userType === "borrower" ? "Borrower" : "Broker"} Portal
          </CardDescription>
          {info.dealCount > 0 && (
            <Badge className="mx-auto mt-2 bg-[#C9A84C]/10 text-[#C9A84C] border-[#C9A84C]/30">
              {info.dealCount} deal{info.dealCount > 1 ? "s" : ""} waiting for you
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-gray-300 text-sm">Email</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-[#0F1729] rounded-md border border-gray-700">
                <Lock className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-sm text-gray-400">{info.email}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="fullName" className="text-gray-300 text-sm">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  id="fullName"
                  placeholder={info.fullName || "Your full name"}
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="pl-9 bg-[#0F1729] border-gray-700 text-white placeholder:text-gray-600"
                  data-testid="input-join-fullname"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="company" className="text-gray-300 text-sm">Company</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  id="company"
                  placeholder="Your company name"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="pl-9 bg-[#0F1729] border-gray-700 text-white placeholder:text-gray-600"
                  data-testid="input-join-company"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="phone" className="text-gray-300 text-sm">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  id="phone"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="pl-9 bg-[#0F1729] border-gray-700 text-white placeholder:text-gray-600"
                  data-testid="input-join-phone"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-gray-300 text-sm">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="bg-[#0F1729] border-gray-700 text-white placeholder:text-gray-600"
                data-testid="input-join-password"
              />
              {formData.password && !passwordValid && (
                <p className="text-xs text-red-400">Must be at least 8 characters</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirmPassword" className="text-gray-300 text-sm">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="bg-[#0F1729] border-gray-700 text-white placeholder:text-gray-600"
                data-testid="input-join-confirm-password"
              />
              {formData.confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-400">Passwords don't match</p>
              )}
            </div>

            {registerMutation.isError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {(registerMutation.error as Error)?.message || "Registration failed"}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-[#C9A84C] hover:bg-[#b8973b] text-white"
              disabled={!passwordValid || !passwordsMatch || registerMutation.isPending}
              data-testid="button-join-submit"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>

            <p className="text-center text-xs text-gray-500">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-[#C9A84C] hover:underline"
                data-testid="link-login"
              >
                Log in
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
