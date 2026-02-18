import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plug,
  Phone,
  Mail,
  Brain,
  RefreshCw,
  MapPin,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  ExternalLink,
  Shield,
} from "lucide-react";

interface IntegrationConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  envVars: string[];
  docsUrl?: string;
  category: 'communication' | 'ai' | 'data' | 'documents';
}

const integrations: IntegrationConfig[] = [
  {
    key: 'twilio',
    label: 'Twilio SMS',
    icon: Phone,
    description: 'SMS notifications for borrower updates, deal milestones, and broker communications.',
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    docsUrl: 'https://www.twilio.com/docs/sms',
    category: 'communication',
  },
  {
    key: 'resend',
    label: 'Resend Email',
    icon: Mail,
    description: 'Transactional email delivery — team invitations, password resets, deal notifications, and digest emails.',
    envVars: ['RESEND_API_KEY'],
    docsUrl: 'https://resend.com/docs',
    category: 'communication',
  },
  {
    key: 'openai',
    label: 'OpenAI',
    icon: Brain,
    description: 'Powers the AI agent pipeline — document intelligence, processor analysis, and communication drafting.',
    envVars: ['OPENAI_API_KEY'],
    docsUrl: 'https://platform.openai.com/docs',
    category: 'ai',
  },
  {
    key: 'apify',
    label: 'Apify',
    icon: RefreshCw,
    description: 'Web scraping for property data enrichment, public record lookups, and market comparables.',
    envVars: ['APIFY_API_TOKEN'],
    docsUrl: 'https://docs.apify.com',
    category: 'data',
  },
  {
    key: 'geoapify',
    label: 'Geoapify',
    icon: MapPin,
    description: 'Geocoding and location intelligence for property addresses and neighborhood analysis.',
    envVars: ['GEOAPIFY_API_KEY'],
    docsUrl: 'https://www.geoapify.com/docs',
    category: 'data',
  },
  {
    key: 'pandadoc',
    label: 'PandaDoc',
    icon: FileText,
    description: 'Document generation and e-signatures for term sheets, commitment letters, and closing docs.',
    envVars: ['PANDADOC_API_KEY'],
    docsUrl: 'https://developers.pandadoc.com',
    category: 'documents',
  },
];

const categoryLabels: Record<string, string> = {
  communication: 'Communication',
  ai: 'AI & Machine Learning',
  data: 'Data Enrichment',
  documents: 'Document Management',
};

export default function IntegrationsPage() {
  const { data: integrationsData, isLoading } = useQuery<{ integrations: Record<string, any> }>({
    queryKey: ['/api/admin/integrations/status'],
  });

  const connectedCount = integrations.filter(
    (i) => integrationsData?.integrations?.[i.key]?.connected === true
  ).length;

  const categories = ['communication', 'ai', 'data', 'documents'];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="h-6 w-6" />
            Platform Integrations
          </h1>
          <p className="text-muted-foreground mt-1">
            External services powering the Lendry platform. These are configured at the platform level and are not visible to lenders.
          </p>
        </div>
        {!isLoading && (
          <Badge variant={connectedCount === integrations.length ? "default" : "secondary"} className="text-sm px-3 py-1">
            {connectedCount} / {integrations.length} connected
          </Badge>
        )}
      </div>

      <Card className="bg-blue-50/50 border-blue-200">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Super Admin Only</p>
            <p className="text-sm text-blue-700">
              These integrations are managed by the Lendry platform team (Solandus). API keys are set via environment variables on the hosting platform. Lender admins do not have access to this page.
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        categories.map((category) => {
          const categoryIntegrations = integrations.filter((i) => i.category === category);
          if (categoryIntegrations.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {categoryLabels[category]}
              </h2>
              <div className="grid gap-3">
                {categoryIntegrations.map((integration) => {
                  const IntIcon = integration.icon;
                  const status = integrationsData?.integrations?.[integration.key];
                  const isConnected = status?.connected === true;

                  return (
                    <Card key={integration.key} className={isConnected ? "border-green-200 bg-green-50/30" : ""}>
                      <CardContent className="flex items-start gap-4 pt-4 pb-4">
                        <div className={`p-2 rounded-md ${isConnected ? 'bg-green-100' : 'bg-muted'}`}>
                          <IntIcon className={`h-5 w-5 ${isConnected ? 'text-green-700' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{integration.label}</p>
                            {isConnected ? (
                              <Badge variant="default" className="bg-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <XCircle className="h-3 w-3 mr-1" />
                                Not Configured
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{integration.description}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-mono">
                                {integration.envVars.join(', ')}
                              </span>
                            </p>
                            {integration.docsUrl && (
                              <a
                                href={integration.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                Docs <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <Card className="bg-muted/50">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">How to configure</p>
            <p className="text-sm text-muted-foreground">
              Set the required environment variables in your hosting platform (Replit Secrets, Heroku Config Vars, etc.). The platform will automatically detect when credentials are present and mark the integration as connected.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
