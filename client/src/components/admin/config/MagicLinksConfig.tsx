import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Copy, RefreshCw, Check, Users, Briefcase, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MagicLinkData {
  type: "borrower" | "broker";
  token: string | null;
  enabled: boolean;
  url: string | null;
}

interface MagicLinksResponse {
  links: MagicLinkData[];
}

export default function MagicLinksConfig() {
  const { toast } = useToast();
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MagicLinksResponse>({
    queryKey: ["/api/admin/magic-links"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/magic-links");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (type: "borrower" | "broker") => {
      const res = await apiRequest("POST", "/api/admin/magic-links/generate", { type });
      return res.json();
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/magic-links"] });
      toast({ title: "Link Generated", description: `Your ${type} magic link is ready to share.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to generate link", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", "/api/admin/magic-links/toggle", { type, enabled });
      return res.json();
    },
    onSuccess: (_, { type, enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/magic-links"] });
      toast({ title: enabled ? "Link Enabled" : "Link Disabled", description: `${type} magic link has been ${enabled ? "enabled" : "disabled"}.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to toggle link", variant: "destructive" });
    },
  });

  const copyToClipboard = (url: string, type: string) => {
    navigator.clipboard.writeText(url);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
    toast({ title: "Copied", description: "Link copied to clipboard" });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const borrowerLink = data?.links?.find((l) => l.type === "borrower");
  const brokerLink = data?.links?.find((l) => l.type === "broker");

  const LINK_CONFIGS = [
    {
      data: borrowerLink,
      type: "borrower" as const,
      label: "Borrower Magic Link",
      icon: Users,
      description: "Share this link with potential borrowers. They can create a free profile, browse your loan programs, and price out quotes — all without needing an account first.",
      color: "blue",
    },
    {
      data: brokerLink,
      type: "broker" as const,
      label: "Broker Magic Link",
      icon: Briefcase,
      description: "Share this link with brokers you want to work with. They can register, complete your partnership onboarding, and start pricing deals using your programs.",
      color: "purple",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Magic Links
          </CardTitle>
          <CardDescription>
            Generate shareable links for borrowers and brokers. Anyone with the link can
            self-register, onboard, and price out quotes using your loan programs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Each link type has its own registration and onboarding flow. Borrower links
              skip partnership agreements; broker links include them. After registration,
              any existing deals matching the user's email are automatically linked to their account.
            </p>
          </div>
        </CardContent>
      </Card>

      {LINK_CONFIGS.map(({ data: linkData, type, label, icon: Icon, description }) => (
        <Card key={type}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{label}</CardTitle>
                {linkData?.token && linkData.enabled && (
                  <Badge variant="default" className="text-xs">Active</Badge>
                )}
                {linkData?.token && !linkData.enabled && (
                  <Badge variant="secondary" className="text-xs">Disabled</Badge>
                )}
              </div>
              {linkData?.token && (
                <div className="flex items-center gap-2">
                  <Label htmlFor={`toggle-${type}`} className="text-sm text-muted-foreground">Enabled</Label>
                  <Switch
                    id={`toggle-${type}`}
                    checked={linkData.enabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ type, enabled: checked })}
                  />
                </div>
              )}
            </div>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {linkData?.url ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono truncate border">
                    {linkData.url}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(linkData.url!, type)}
                    className="shrink-0"
                  >
                    {copiedType === type ? (
                      <><Check className="h-4 w-4 mr-1" /> Copied</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-1" /> Copy</>
                    )}
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Regenerate ${type} link? The current link will stop working immediately.`)) {
                        generateMutation.mutate(type);
                      }
                    }}
                    disabled={generateMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No link generated yet.</p>
                <Button
                  onClick={() => generateMutation.mutate(type)}
                  disabled={generateMutation.isPending}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  {generateMutation.isPending ? "Generating..." : `Generate ${type === "borrower" ? "Borrower" : "Broker"} Link`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
