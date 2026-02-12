import { useState } from 'react';
import { useLocation, Link, useRoute } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, CheckCircle } from 'lucide-react';
import sphinxLogo from '@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg';

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/reset-password/:token');
  const token = params?.token;
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      toast({
        title: 'Invalid Link',
        description: 'This reset link is invalid or has expired.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest('POST', '/api/auth/reset-password', {
        token,
        newPassword: data.password,
      });
      setResetComplete(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'This link may have expired. Please request a new one.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (resetComplete) {
    return (
      <div className="min-h-screen flex bg-background">
        <div className="flex items-center justify-center w-full p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <img src={sphinxLogo} alt="Sphinx Capital" className="h-10 w-auto object-contain mx-auto mb-6" />
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-success" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Password Reset Complete</CardTitle>
              <CardDescription>
                Your password has been successfully reset.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button className="w-full h-11" data-testid="button-go-to-login">
                  Sign In
                </Button>
              </Link>
              <div className="mt-6 text-center text-xs text-muted-foreground">Secured with 256-bit encryption</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex bg-background">
        <div className="flex items-center justify-center w-full p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <img src={sphinxLogo} alt="Sphinx Capital" className="h-10 w-auto object-contain mx-auto mb-6" />
              <CardTitle className="text-2xl font-bold tracking-tight">Invalid Link</CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/forgot-password">
                <Button className="w-full h-11">
                  Request New Reset Link
                </Button>
              </Link>
              <div className="mt-6 text-center text-xs text-muted-foreground">Secured with 256-bit encryption</div>
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
            <img src={sphinxLogo} alt="Sphinx Capital" className="h-10 w-auto object-contain mx-auto mb-6" />
            <CardTitle className="text-2xl font-bold tracking-tight">Reset Password</CardTitle>
            <CardDescription>Enter your new password</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder=""
                          data-testid="input-password"
                          className="h-11"
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
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder=""
                          data-testid="input-confirm-password"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={isLoading}
                  data-testid="button-reset-password"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </form>
            </Form>
            <div className="mt-6 text-center text-xs text-muted-foreground">Secured with 256-bit encryption</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
