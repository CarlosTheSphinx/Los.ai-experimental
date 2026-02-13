import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Briefcase, Home, Zap, Shield, Clock, Crown } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import sphinxLogo from '@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg';

const registerSchema = z.object({
  userType: z.enum(['broker', 'borrower', 'lender'], { required_error: 'Please select your account type' }),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      userType: undefined,
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      await register({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        userType: data.userType,
      });
      // Redirect based on user type - brokers and lenders go to onboarding, borrowers go straight to dashboard
      if (data.userType === 'broker' || data.userType === 'lender') {
        setLocation('/onboarding');
      } else {
        setLocation('/');
      }
    } catch (error: any) {
      toast({
        title: 'Registration failed',
        description: error?.message || 'Could not create account',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel - Brand Messaging */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground text-background flex-col justify-between p-12">
        <div>
          <img src={sphinxLogo} alt="Sphinx Capital" className="h-12 mb-12" />
          <h1 className="text-4xl font-bold tracking-tight mb-4">Start originating smarter</h1>
          <p className="text-lg text-background/80 mb-8">
            AI-powered lending that transforms how you originate, manage, and grow your business.
          </p>

          {/* Benefit Bullets */}
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <Zap className="h-6 w-6 text-background" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Originate Faster</h3>
                <p className="text-sm text-background/80">Automated processing speeds up loan origination by 10x</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <Shield className="h-6 w-6 text-background" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Better Decisions</h3>
                <p className="text-sm text-background/80">AI-powered insights reduce risk and improve approval rates</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <Clock className="h-6 w-6 text-background" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Real-time Monitoring</h3>
                <p className="text-sm text-background/80">Track performance and detect issues instantly</p>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright Footer */}
        <div className="text-sm text-background/60">
          &copy; 2024 Sphinx Capital. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col justify-center p-4 lg:p-8">
        <div className="w-full max-w-md mx-auto">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <img src={sphinxLogo} alt="Sphinx Capital" className="h-10" />
          </div>

          <h2 className="text-3xl font-bold tracking-tight mb-2">Create your account</h2>
          <p className="text-muted-foreground mb-8">Sign up for Sphinx Capital</p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>I am a...</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="grid grid-cols-3 gap-3"
                      >
                        <div>
                          <RadioGroupItem
                            value="broker"
                            id="broker"
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor="broker"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover-elevate peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                            data-testid="radio-broker"
                          >
                            <Briefcase className="mb-3 h-5 w-5" />
                            <span className="font-semibold text-sm">Broker</span>
                          </Label>
                        </div>
                        <div>
                          <RadioGroupItem
                            value="borrower"
                            id="borrower"
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor="borrower"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover-elevate peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                            data-testid="radio-borrower"
                          >
                            <Home className="mb-3 h-5 w-5" />
                            <span className="font-semibold text-sm">Borrower</span>
                          </Label>
                        </div>
                        <div className="relative">
                          <RadioGroupItem
                            value="lender"
                            id="lender"
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor="lender"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover-elevate peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                            data-testid="radio-lender"
                          >
                            <Crown className="mb-3 h-5 w-5" />
                            <span className="font-semibold text-sm">Lender</span>
                            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full mt-1">Pro</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder=""
                          data-testid="input-first-name"
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
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder=""
                          data-testid="input-last-name"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder=""
                        data-testid="input-email"
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
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
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
                    <FormLabel>Confirm Password</FormLabel>
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
                data-testid="button-register"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          </Form>
          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => { window.location.href = '/api/auth/google'; }}
            data-testid="button-google-register"
          >
            <SiGoogle className="mr-2 h-4 w-4" />
            Sign up with Google
          </Button>

          {/* Trust Signals - Mobile Only */}
          <div className="lg:hidden mt-8 pt-8 border-t border-border space-y-4">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">Bank-level security for your data</div>
            </div>
            <div className="flex gap-3">
              <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">Instant verification and decisions</div>
            </div>
          </div>

          {/* Sign In Link */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
