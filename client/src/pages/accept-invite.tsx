import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, AlertCircle, Mail } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';

const acceptInviteSchema = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;

export default function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/accept-invite/:token');
  const token = params?.token;
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [inviteData, setInviteData] = useState<{ email: string; fullName: string } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const form = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setValidationError('Invalid invitation link');
      return;
    }

    async function validateToken() {
      try {
        const res = await fetch(`/api/auth/validate-invite/${token}`);
        const data = await res.json();
        if (data.valid) {
          setInviteData({ email: data.email, fullName: data.fullName });
        } else {
          setValidationError(data.error || 'Invalid invitation link');
        }
      } catch {
        setValidationError('Failed to validate invitation');
      } finally {
        setValidating(false);
      }
    }

    validateToken();
  }, [token]);

  const onSubmit = async (data: AcceptInviteFormData) => {
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await apiRequest('POST', '/api/auth/accept-invite', {
        token,
        password: data.password,
      });
      const result = await res.json();
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setLocation(result.redirectTo || '/quotes');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to set up your account. The link may have expired.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex bg-background">
        <div className="flex items-center justify-center w-full p-4">
          <Card className="w-full max-w-md">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="min-h-screen flex bg-background">
        <div className="flex items-center justify-center w-full p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-6">
                <span className="text-3xl font-bold text-foreground">Lendry.</span>
                <span className="text-3xl font-bold text-blue-500">AI</span>
              </div>
              <div className="flex justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Invalid Invitation</CardTitle>
              <CardDescription>{validationError}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Please contact your admin to request a new invitation.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setLocation('/login')} data-testid="button-back-to-login">
                Back to Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex items-center justify-center w-full p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-6">
              <span className="text-3xl font-bold text-foreground">Lendry.</span>
              <span className="text-3xl font-bold text-blue-500">AI</span>
            </div>
            <div className="flex justify-center mb-4">
              <Mail className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight" data-testid="text-welcome-title">Welcome to the Team</CardTitle>
            <CardDescription>
              Set up your password to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inviteData && (
              <div className="bg-muted/50 rounded-md p-3 mb-4 space-y-1">
                <p className="text-sm font-medium" data-testid="text-invite-name">{inviteData.fullName}</p>
                <p className="text-xs text-muted-foreground" data-testid="text-invite-email">{inviteData.email}</p>
              </div>
            )}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="At least 12 characters"
                          data-testid="input-invite-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Confirm your password"
                          data-testid="input-invite-confirm-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-accept-invite"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    'Set Password & Join'
                  )}
                </Button>
              </form>
            </Form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              onClick={() => { window.location.href = `/api/auth/google?inviteToken=${token}`; }}
              data-testid="button-google-invite"
            >
              <SiGoogle className="mr-2 h-4 w-4" />
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
