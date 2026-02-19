import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, Users, UserCheck, Eye, Send, Loader2, Link2, Copy, ExternalLink } from "lucide-react";
import { BrokerOnboardingConfig, BROKER_CONFIG_DEFAULTS, type BrokerOnboardingConfigType } from "@/components/admin/config/BrokerOnboardingConfig";
import { BorrowerOnboardingConfig, BORROWER_CONFIG_DEFAULTS, type BorrowerOnboardingConfigType } from "@/components/admin/config/BorrowerOnboardingConfig";
import { useTenantConfig } from "@/hooks/use-tenant-config";

export default function OnboardingConfigPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("broker");

  const brokerConfig = useTenantConfig<BrokerOnboardingConfigType>(
    "onboarding_broker_config",
    BROKER_CONFIG_DEFAULTS
  );

  const borrowerConfig = useTenantConfig<BorrowerOnboardingConfigType>(
    "onboarding_borrower_config",
    BORROWER_CONFIG_DEFAULTS
  );

  const handleSave = () => {
    if (activeTab === "broker" && brokerConfig.hasChanges) {
      brokerConfig.save();
      toast({ title: "Broker onboarding configuration saved" });
    } else if (activeTab === "borrower" && borrowerConfig.hasChanges) {
      borrowerConfig.save();
      toast({ title: "Borrower onboarding configuration saved" });
    }
  };

  const handleReset = () => {
    if (activeTab === "broker") {
      brokerConfig.updateConfig(BROKER_CONFIG_DEFAULTS);
    } else {
      borrowerConfig.updateConfig(BORROWER_CONFIG_DEFAULTS);
    }
    toast({ title: "Reset to defaults", description: "Save to apply changes." });
  };

  const hasChanges = activeTab === "broker" ? brokerConfig.hasChanges : borrowerConfig.hasChanges;
  const isPending = activeTab === "broker" ? brokerConfig.isPending : borrowerConfig.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Onboarding Process</h1>
          <p className="text-muted-foreground mt-1">
            Configure the onboarding flow (Welcome, Video, Agreement, Tour, Start) shown to brokers and borrowers when they first open their portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              Unsaved changes
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isPending}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="broker" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Broker Onboarding
          </TabsTrigger>
          <TabsTrigger value="borrower" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Borrower Onboarding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="broker" className="mt-6">
          <BrokerOnboardingConfig
            config={brokerConfig.config}
            updateConfig={brokerConfig.updateConfig}
            updateField={brokerConfig.updateField}
          />
        </TabsContent>

        <TabsContent value="borrower" className="mt-6">
          <BorrowerOnboardingConfig
            config={borrowerConfig.config}
            updateConfig={borrowerConfig.updateConfig}
            updateField={borrowerConfig.updateField}
          />
        </TabsContent>
      </Tabs>

      <Separator />

      <TestPortalLinks portalType={activeTab === "broker" ? "broker" : "borrower"} />
    </div>
  );
}

function TestPortalLinks({ portalType }: { portalType: "borrower" | "broker" }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  const { data: dealsData, isLoading: dealsLoading } = useQuery<{ projects: any[] }>({
    queryKey: ['/api/projects'],
  });
  const deals = dealsData?.projects;

  const sendTestLink = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/send-test-portal-link', {
        email,
        dealId: parseInt(selectedDealId),
        portalType,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setGeneratedLink(data.portalUrl || '');
      toast({
        title: data.emailFailed ? 'Link Generated' : 'Test Link Sent',
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to send test link',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    toast({ title: 'Copied', description: 'Portal link copied to clipboard' });
  };

  const portalLabel = portalType === 'borrower' ? 'Borrower Portal' : 'Broker Portal';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5" />
          Send Test {portalLabel} Link
        </CardTitle>
        <CardDescription>
          Send yourself (or a teammate) a test link to preview exactly what {portalType === 'borrower' ? 'borrowers' : 'brokers'} will see when they land on the portal. Pick a deal and enter an email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Deal</Label>
            <Select value={selectedDealId} onValueChange={setSelectedDealId}>
              <SelectTrigger data-testid="select-test-portal-deal">
                <SelectValue placeholder="Select a deal..." />
              </SelectTrigger>
              <SelectContent>
                {dealsLoading ? (
                  <SelectItem value="_loading" disabled>Loading deals...</SelectItem>
                ) : deals && deals.length > 0 ? (
                  deals.map((deal: any) => (
                    <SelectItem key={deal.id} value={String(deal.id)}>
                      DEAL-{deal.id} — {deal.propertyAddress || deal.borrowerName || 'Untitled'}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="_none" disabled>No deals found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Email Address</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter email to send preview link..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-test-portal-email"
              />
              <Button
                onClick={() => sendTestLink.mutate()}
                disabled={!email || !selectedDealId || sendTestLink.isPending}
                data-testid="button-send-test-portal-link"
              >
                {sendTestLink.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send
              </Button>
            </div>
          </div>
        </div>

        {generatedLink && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md border">
            <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <code className="text-xs flex-1 truncate" data-testid="text-generated-portal-link">{generatedLink}</code>
            <Button variant="ghost" size="sm" onClick={copyLink} data-testid="button-copy-portal-link">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" asChild data-testid="button-open-portal-link">
              <a href={generatedLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
