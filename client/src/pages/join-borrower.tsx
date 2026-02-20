import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, Calculator, FileText, Building2 } from "lucide-react";
import { PortalOnboarding, hasCompletedOnboarding } from "@/components/portal/PortalOnboarding";
import MagicLinkQuoteBuilder from "@/components/MagicLinkQuoteBuilder";
import { useAuth } from "@/hooks/use-auth";

type JoinView = "quote" | "deals";

export default function JoinBorrowerPage() {
  const [, params] = useRoute("/join/borrower/:token");
  const token = params?.token;
  const { user } = useAuth();

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (!token) return true;
    return !hasCompletedOnboarding("borrower", token);
  });
  const [activeView, setActiveView] = useState<JoinView>("quote");

  // Validate token
  const { data: validationData, isLoading: validating, error: validationError } = useQuery<{
    type: string;
    lenderName: string;
    lenderCompanyName: string;
  }>({
    queryKey: ["magic-link-validate", token],
    queryFn: async () => {
      const res = await fetch(`/api/magic-link/validate/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Invalid link");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  // Fetch programs
  const { data: programsData, isLoading: loadingPrograms } = useQuery<{
    programs: any[];
    lenderName: string;
    companyName: string;
  }>({
    queryKey: ["magic-link-programs", token],
    queryFn: async () => {
      const res = await fetch(`/api/magic-link/${token}/programs`);
      if (!res.ok) throw new Error("Failed to load programs");
      return res.json();
    },
    enabled: !!token && !!validationData,
  });

  // Fetch matched deals (only when authenticated)
  const { data: dealsData } = useQuery<{ deals: any[] }>({
    queryKey: ["magic-link-deals", token],
    queryFn: async () => {
      const res = await fetch(`/api/magic-link/${token}/my-deals`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load deals");
      return res.json();
    },
    enabled: !!token && !!user && !showOnboarding,
    retry: false,
  });

  // Loading state
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Validating your link...</p>
        </div>
      </div>
    );
  }

  // Invalid token
  if (validationError || !validationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid or Expired Link</h2>
            <p className="text-sm text-muted-foreground">
              This magic link is no longer valid. Please contact your lender for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show onboarding
  if (showOnboarding) {
    return (
      <PortalOnboarding
        portalType="borrower"
        token={token!}
        onComplete={() => setShowOnboarding(false)}
        magicLinkMode={true}
        lenderCompanyName={validationData.lenderCompanyName}
        returnPath={`/join/borrower/${token}`}
      />
    );
  }

  const programs = programsData?.programs || [];
  const matchedDeals = dealsData?.deals || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">{validationData.lenderCompanyName || validationData.lenderName}</h1>
              <p className="text-xs text-muted-foreground">Borrower Portal</p>
            </div>
          </div>
          {user && (
            <div className="text-right">
              <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as JoinView)}>
          <TabsList className="mb-6">
            <TabsTrigger value="quote" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Quote Calculator
            </TabsTrigger>
            {user && (
              <TabsTrigger value="deals" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                My Deals
                {matchedDeals.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{matchedDeals.length}</Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="quote">
            {loadingPrograms ? (
              <div className="py-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground mt-2">Loading loan programs...</p>
              </div>
            ) : (
              <MagicLinkQuoteBuilder
                magicLinkToken={token!}
                programs={programs}
                userType="borrower"
                lenderName={validationData.lenderName}
                companyName={validationData.lenderCompanyName}
              />
            )}
          </TabsContent>

          {user && (
            <TabsContent value="deals">
              {matchedDeals.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium">No Deals Found</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      No existing deals are associated with your email address ({user.email}).
                      Use the Quote Calculator to price out a new deal.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {matchedDeals.map((deal: any) => (
                    <Card key={deal.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{deal.projectName || deal.dealName}</CardTitle>
                          <Badge variant={deal.status === "active" ? "default" : "secondary"}>
                            {deal.status}
                          </Badge>
                        </div>
                        {deal.propertyAddress && (
                          <CardDescription>{deal.propertyAddress}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-4 text-sm">
                          {deal.loanAmount && (
                            <div>
                              <span className="text-muted-foreground">Loan Amount:</span>{" "}
                              <span className="font-medium">${Number(deal.loanAmount).toLocaleString()}</span>
                            </div>
                          )}
                          {deal.loanType && (
                            <div>
                              <span className="text-muted-foreground">Type:</span>{" "}
                              <span className="font-medium">{deal.loanType}</span>
                            </div>
                          )}
                          {deal.currentStage && (
                            <div>
                              <span className="text-muted-foreground">Stage:</span>{" "}
                              <span className="font-medium">{deal.currentStage}</span>
                            </div>
                          )}
                        </div>
                        {deal.portalToken && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => window.location.href = `/portal/${deal.portalToken}`}
                          >
                            View Deal Portal
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
