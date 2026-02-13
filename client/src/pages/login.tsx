import { useState, useEffect } from 'react';
import { useLocation, Link, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, Zap, FileCheck, Plus } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const error = params.get('error');
    if (error) {
      const messages: Record<string, string> = {
        google_auth_failed: 'Google sign-in failed. Please try again.',
        google_not_configured: 'Google sign-in is not available at this time.',
        account_deactivated: 'Your account has been deactivated. Please contact support.',
      };
      toast({
        title: 'Sign-in error',
        description: messages[error] || 'An error occurred during sign-in.',
        variant: 'destructive',
      });
    }
  }, [searchString, toast]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      setLocation('/');
    } catch (error: any) {
      toast({
        title: 'Login failed',
        description: error?.message || 'Invalid email or password',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel — Brand + Trust Signals (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground text-background flex-col justify-between p-12 relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-background animate-pulse" />
        </div>
        <div className="relative z-10">
          <img
            src={sphinxLogo}
            alt="Sphinx Capital"
            className="h-14 w-auto object-contain mb-12 brightness-0 invert"
          />
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Intelligent Lending, Simplified
          </h1>
          <p className="text-lg opacity-80 max-w-md">
            AI-powered loan origination for private lenders. Close DSCR, RTL, and non-QM deals faster.
          </p>

          {/* Deal Pipeline Dashboard Mockup */}
          <div className="mt-8 mb-8 rounded-lg bg-background/5 border border-background/10 p-4 backdrop-blur-sm">
            {/* Header with title and button */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase tracking-widest opacity-60 font-semibold">Deal Pipeline</span>
              <button className="flex items-center gap-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-background px-2.5 py-1 rounded transition-colors">
                <Plus className="h-3 w-3" />
                <span>New Deal</span>
              </button>
            </div>

            {/* Mini Kanban Board */}
            <div className="grid grid-cols-4 gap-2">
              {/* INTAKE Column */}
              <div>
                <div className="text-xs uppercase tracking-wide opacity-60 font-semibold mb-2">Intake</div>
                <div className="space-y-1.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-background/10 rounded p-2 text-xs text-background/70 truncate">
                      Deal #{2401 + i}
                    </div>
                  ))}
                </div>
              </div>

              {/* DOCS Column */}
              <div>
                <div className="text-xs uppercase tracking-wide opacity-60 font-semibold mb-2">Docs</div>
                <div className="space-y-1.5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-background/10 rounded p-2 text-xs text-background/70 truncate">
                      Deal #{2500 + i}
                    </div>
                  ))}
                </div>
              </div>

              {/* CONDITIONS Column */}
              <div>
                <div className="text-xs uppercase tracking-wide opacity-60 font-semibold mb-2">Conditions</div>
                <div className="space-y-1.5">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-background/10 rounded p-2 text-xs text-background/70 truncate">
                      Deal #{2510 + i}
                    </div>
                  ))}
                </div>
              </div>

              {/* CLEAR TO CLOSE Column */}
              <div>
                <div className="text-xs uppercase tracking-wide opacity-60 font-semibold mb-2">Clear</div>
                <div className="space-y-1.5">
                  <div className="bg-background/10 rounded p-2 text-xs text-background/70 truncate">
                    Deal #2520
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-background/10 p-2.5 mt-0.5">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-base">AI-Powered Pricing</p>
              <p className="text-sm opacity-70">Get instant, data-driven loan pricing in seconds</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-background/10 p-2.5 mt-0.5">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-base">Smart Document Review</p>
              <p className="text-sm opacity-70">AI reads and validates documents automatically</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-background/10 p-2.5 mt-0.5">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-base">Bank-Level Security</p>
              <p className="text-sm opacity-70">256-bit encryption and SOC 2 compliance</p>
            </div>
          </div>
        </div>

        <p className="text-xs opacity-50 relative z-10">
          &copy; {new Date().getFullYear()} Sphinx Capital. All rights reserved.
        </p>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md space-y-8"
        >
          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <img
              src={sphinxLogo}
              alt="Sphinx Capital"
              className="h-12 w-auto object-contain mx-auto mb-4"
            />
          </div>

          <div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground mt-2">Sign in to your account to continue</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        className="h-12 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                        data-testid="input-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        className="h-12 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                        data-testid="input-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 text-base"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
              or continue with
            </span>
          </div>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => { window.location.href = '/api/auth/google'; }}
            data-testid="button-google-login"
          >
            <SiGoogle className="mr-2 h-4 w-4" />
            Sign in with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Create an account
            </Link>
          </p>

          {/* Social Proof */}
          <div className="pt-4 border-t border-border">
            <p className="text-center text-xs text-muted-foreground mb-3">
              Trusted by 50+ leading lenders
            </p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground border border-border"
                >
                  L{i}
                </div>
              ))}
            </div>
          </div>

          {/* Trust signals for mobile */}
          <div className="lg:hidden pt-4 border-t border-border">
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                <span>256-bit encryption</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                <span>AI-powered</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
