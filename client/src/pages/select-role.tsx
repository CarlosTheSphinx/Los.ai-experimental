import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Briefcase, Home, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SelectRolePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selected, setSelected] = useState<'broker' | 'borrower' | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  if (user?.userType) {
    navigate('/');
    return null;
  }

  const handleSelect = async (userType: 'broker' | 'borrower') => {
    setIsSubmitting(true);
    setSelected(userType);
    try {
      await apiRequest('POST', '/api/auth/select-user-type', { userType });
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      navigate('/');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save your selection. Please try again.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      setSelected(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-select-role-title">
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p className="text-muted-foreground" data-testid="text-select-role-description">
            How will you be using this platform? This helps us customize your experience.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className={`cursor-pointer transition-all hover-elevate ${selected === 'broker' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => !isSubmitting && handleSelect('broker')}
            data-testid="card-select-broker"
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                {isSubmitting && selected === 'broker' ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Briefcase className="h-6 w-6 text-primary" />
                )}
              </div>
              <CardTitle className="text-lg">Broker</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                I originate loans and need access to pricing tools, quotes, and deal management.
              </CardDescription>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all hover-elevate ${selected === 'borrower' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => !isSubmitting && handleSelect('borrower')}
            data-testid="card-select-borrower"
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                {isSubmitting && selected === 'borrower' ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Home className="h-6 w-6 text-primary" />
                )}
              </div>
              <CardTitle className="text-lg">Borrower</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                I'm looking for financing and want to track my loan progress and documents.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
