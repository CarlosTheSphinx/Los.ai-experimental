import { useState, useEffect } from 'react';
import { useLocation, Link, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { useBranding } from '@/hooks/use-branding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { login } = useAuth();
  const { branding } = useBranding();
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
      {/* Left Panel — Cinematic Gradient with Centered Logo & Tagline (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-b from-[#0F2438] via-[#1A3A52] to-[#0F1729] text-background flex-col justify-between items-center p-12">
        {/* Centered Logo & Tagline */}
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="flex items-center gap-0 mb-6">
            <span className="text-3xl font-bold text-white">Lendry.</span>
            <span className="text-3xl font-bold text-blue-400">AI</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-center">
            Lending, Automated.
          </h1>
        </div>

        {/* Copyright Footer */}
        <p className="text-xs text-background/60">
          &copy; {branding.copyrightYear} {branding.companyName}. All rights reserved.
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
          <div className="lg:hidden text-center mb-4">
            <div className="flex items-center justify-center gap-0">
              <span className="text-2xl font-bold text-foreground">Lendry.</span>
              <span className="text-2xl font-bold text-primary">AI</span>
            </div>
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


        </motion.div>
      </div>
    </div>
  );
}
