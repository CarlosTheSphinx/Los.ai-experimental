import { useQuery } from '@tanstack/react-query';

export interface BrandingConfig {
  companyName: string;
  companyShortName: string;
  copyrightYear: number;
  emailSignature: string;
  smsSignature: string;
  logoUrl?: string;
  logoDarkUrl?: string;
}

const DEFAULT_BRANDING: BrandingConfig = {
  companyName: 'Lendry.AI',
  companyShortName: 'Lendry',
  copyrightYear: new Date().getFullYear(),
  emailSignature: 'Lendry.AI',
  smsSignature: 'Lendry.AI',
  logoUrl: undefined,
  logoDarkUrl: undefined,
};

export function useBranding() {
  const { data: branding = DEFAULT_BRANDING, isLoading } = useQuery({
    queryKey: ['branding'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/settings/branding');
        if (!response.ok) {
          return DEFAULT_BRANDING;
        }
        return response.json() as Promise<BrandingConfig>;
      } catch {
        return DEFAULT_BRANDING;
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  return {
    branding: branding ?? DEFAULT_BRANDING,
    isLoading,
  };
}
