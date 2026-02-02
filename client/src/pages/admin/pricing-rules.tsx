import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sparkles,
  Play,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Zap,
  ArrowRight,
  RefreshCw,
  Trash2,
  Eye,
  Rocket,
  Settings2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface LoanProgram {
  id: number;
  name: string;
  description: string | null;
  loanType: string;
  isActive: boolean;
}

interface PricingRuleset {
  id: number;
  programId: number;
  version: number;
  name: string;
  description: string | null;
  rulesJson: any;
  status: string;
  createdBy: number;
  createdAt: string;
  activatedAt: string | null;
  archivedAt: string | null;
}

interface RuleProposal {
  id: number;
  programId: number;
  proposalJson: any;
  aiExplanation: string | null;
  status: string;
  createdAt: string;
}

interface PricingResult {
  eligible: boolean;
  baseRate?: number;
  finalRate?: number;
  points?: number;
  caps?: {
    maxLTC?: number;
    maxLTV?: number;
    maxLTAIV?: number;
    maxLTARV?: number;
  };
  appliedAdjusters?: Array<{
    id: string;
    label: string;
    rateAdd: number;
    pointsAdd: number;
  }>;
  reasons?: string[];
}

export default function PricingRulesPage() {
  const { toast } = useToast();
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [guidelineText, setGuidelineText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<RuleProposal | null>(null);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testInputs, setTestInputs] = useState({
    loanType: "light_rehab",
    tier: "experienced",
    fico: 720,
    ltv: 70,
    purpose: "purchase",
    propertyType: "single-family",
  });
  const [testResult, setTestResult] = useState<PricingResult | null>(null);
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [deployName, setDeployName] = useState("");
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [showAddProgramDialog, setShowAddProgramDialog] = useState(false);
  const [newProgramData, setNewProgramData] = useState({
    name: "",
    description: "",
    loanType: "rtl",
    minLoanAmount: 100000,
    maxLoanAmount: 5000000,
    minLtv: 50,
    maxLtv: 85,
    minInterestRate: 8,
    maxInterestRate: 15,
    termOptions: "12, 24, 36",
  });

  // Fetch programs
  const { data: programsData, isLoading: programsLoading } = useQuery<{ programs: LoanProgram[] }>({
    queryKey: ["/api/admin/programs"],
  });

  // Fetch rulesets for selected program
  const { data: rulesetsData, isLoading: rulesetsLoading } = useQuery<{ rulesets: PricingRuleset[] }>({
    queryKey: ["/api/admin/programs", selectedProgramId, "rulesets"],
    enabled: !!selectedProgramId,
  });

  // Fetch proposals for selected program
  const { data: proposalsData } = useQuery<{ proposals: RuleProposal[] }>({
    queryKey: ["/api/admin/programs", selectedProgramId, "proposals"],
    enabled: !!selectedProgramId,
  });

  const selectedProgram = programsData?.programs?.find(p => p.id === selectedProgramId);
  const activeRuleset = rulesetsData?.rulesets?.find(r => r.status === 'active');
  const draftRulesets = rulesetsData?.rulesets?.filter(r => r.status === 'draft') || [];
  const pendingProposals = proposalsData?.proposals?.filter(p => p.status === 'pending') || [];

  // Create sample ruleset mutation
  const createSampleMutation = useMutation({
    mutationFn: async (programId: number) => {
      const res = await apiRequest("POST", `/api/admin/programs/${programId}/rulesets/sample`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgramId, "rulesets"] });
      toast({ title: "Sample ruleset created", description: "You can now review and activate it." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create sample ruleset", variant: "destructive" });
    },
  });

  // Activate ruleset mutation
  const activateMutation = useMutation({
    mutationFn: async (rulesetId: number) => {
      const res = await apiRequest("POST", `/api/admin/rulesets/${rulesetId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgramId, "rulesets"] });
      toast({ title: "Ruleset activated", description: "The ruleset is now live for pricing." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to activate ruleset", variant: "destructive" });
    },
  });

  // Delete ruleset mutation
  const deleteRulesetMutation = useMutation({
    mutationFn: async (rulesetId: number) => {
      await apiRequest("DELETE", `/api/admin/rulesets/${rulesetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgramId, "rulesets"] });
      toast({ title: "Ruleset deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete ruleset", variant: "destructive" });
    },
  });

  // Create program mutation
  const createProgramMutation = useMutation({
    mutationFn: async (data: typeof newProgramData) => {
      const res = await apiRequest("POST", "/api/admin/programs", {
        ...data,
        eligiblePropertyTypes: ["single-family", "multi-family"],
        isActive: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddProgramDialog(false);
      setNewProgramData({
        name: "",
        description: "",
        loanType: "rtl",
        minLoanAmount: 100000,
        maxLoanAmount: 5000000,
        minLtv: 50,
        maxLtv: 85,
        minInterestRate: 8,
        maxInterestRate: 15,
        termOptions: "12, 24, 36",
      });
      toast({ title: "Program created", description: "You can now configure pricing rules for this program." });
      if (data.program?.id) {
        setSelectedProgramId(data.program.id);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create program", variant: "destructive" });
    },
  });

  // AI analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setIsAnalyzing(true);
      const res = await apiRequest("POST", `/api/admin/programs/${selectedProgramId}/ai-analyze`, {
        guidelineText,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCurrentProposal(data.proposal);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgramId, "proposals"] });
      toast({ title: "Analysis complete", description: "AI has proposed pricing rules based on your guidelines." });
      setGuidelineText("");
    },
    onError: (error: any) => {
      toast({ title: "Analysis failed", description: error.message || "Failed to analyze guidelines", variant: "destructive" });
    },
    onSettled: () => {
      setIsAnalyzing(false);
    },
  });

  // Refine proposal mutation
  const refineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${currentProposal?.id}/refine`, {
        feedback: refineFeedback,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCurrentProposal(data.proposal);
      setRefineFeedback("");
      toast({ title: "Proposal refined", description: "The rules have been updated based on your feedback." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to refine proposal", variant: "destructive" });
    },
  });

  // Deploy proposal mutation
  const deployMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/proposals/${currentProposal?.id}/deploy`, {
        name: deployName || undefined,
        activateImmediately,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgramId, "rulesets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgramId, "proposals"] });
      setCurrentProposal(null);
      setShowDeployDialog(false);
      setDeployName("");
      toast({ 
        title: "Ruleset deployed", 
        description: activateImmediately ? "The new ruleset is now live!" : "Ruleset saved as draft."
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to deploy ruleset", variant: "destructive" });
    },
  });

  // Test ruleset mutation
  const testMutation = useMutation({
    mutationFn: async (rulesetId: number) => {
      const res = await apiRequest("POST", `/api/admin/rulesets/${rulesetId}/test`, {
        inputs: testInputs,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setTestResult(data.result);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to test ruleset", variant: "destructive" });
    },
  });

  const renderRulesetSummary = (rulesJson: any) => {
    if (!rulesJson) return null;
    
    return (
      <div className="space-y-3 text-sm">
        <div>
          <span className="text-muted-foreground">Product:</span>{" "}
          <Badge variant="outline">{rulesJson.product}</Badge>
        </div>
        
        {rulesJson.baseRates && (
          <div>
            <span className="text-muted-foreground">Base Rates:</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(rulesJson.baseRates).map(([type, rate]) => (
                <Badge key={type} variant="secondary">
                  {type}: {String(rate)}%
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {rulesJson.adjusters && rulesJson.adjusters.length > 0 && (
          <div>
            <span className="text-muted-foreground">Adjusters ({rulesJson.adjusters.length}):</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {rulesJson.adjusters.slice(0, 5).map((adj: any) => (
                <Badge key={adj.id} variant="outline" className="text-xs">
                  {adj.label}
                </Badge>
              ))}
              {rulesJson.adjusters.length > 5 && (
                <Badge variant="outline" className="text-xs">+{rulesJson.adjusters.length - 5} more</Badge>
              )}
            </div>
          </div>
        )}
        
        {rulesJson.leverageCaps && rulesJson.leverageCaps.length > 0 && (
          <div>
            <span className="text-muted-foreground">Leverage Caps:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {rulesJson.leverageCaps.map((cap: any) => (
                <Badge key={cap.tier} variant="outline" className="text-xs">
                  {cap.tier}: LTV {(cap.max?.ltv || cap.max?.ltc || 0) * 100}%
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {rulesJson.eligibilityRules && rulesJson.eligibilityRules.length > 0 && (
          <div>
            <span className="text-muted-foreground">Eligibility Rules ({rulesJson.eligibilityRules.length}):</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {rulesJson.eligibilityRules.map((rule: any) => (
                <Badge key={rule.id} variant="destructive" className="text-xs">
                  {rule.label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (programsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Pricing Rules</h1>
          <p className="text-muted-foreground">Configure pricing rules for loan programs using AI or manual setup</p>
        </div>
      </div>

      {/* Program Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Program</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Select
              value={selectedProgramId?.toString() || ""}
              onValueChange={(v) => {
                setSelectedProgramId(parseInt(v));
                setCurrentProposal(null);
              }}
            >
              <SelectTrigger className="w-full max-w-md" data-testid="select-program">
                <SelectValue placeholder="Choose a loan program to configure pricing" />
              </SelectTrigger>
              <SelectContent>
                {(programsData?.programs ?? []).map((program) => (
                  <SelectItem key={program.id} value={program.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Badge variant={program.loanType === 'rtl' ? 'default' : 'secondary'} className="text-xs">
                        {program.loanType.toUpperCase()}
                      </Badge>
                      {program.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setShowAddProgramDialog(true)}
              data-testid="button-add-program"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Program
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedProgram && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Current Status & Quick Actions */}
          <div className="space-y-4">
            {/* Active Ruleset Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Active Ruleset
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rulesetsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : activeRuleset ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{activeRuleset.name}</p>
                        <p className="text-sm text-muted-foreground">Version {activeRuleset.version}</p>
                      </div>
                      <Badge className="bg-green-500">Active</Badge>
                    </div>
                    {renderRulesetSummary(activeRuleset.rulesJson)}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowTestDialog(true);
                        }}
                        data-testid="button-test-active"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Test
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto mb-2" />
                    <p className="text-muted-foreground mb-4">No active pricing rules</p>
                    <Button
                      onClick={() => createSampleMutation.mutate(selectedProgramId)}
                      disabled={createSampleMutation.isPending}
                      data-testid="button-create-sample"
                    >
                      {createSampleMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      Create Sample Ruleset
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Draft Rulesets */}
            {draftRulesets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Draft Rulesets</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {draftRulesets.map((ruleset) => (
                    <div key={ruleset.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{ruleset.name}</p>
                        <p className="text-sm text-muted-foreground">Version {ruleset.version}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowTestDialog(true);
                          }}
                          data-testid={`button-test-draft-${ruleset.id}`}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => activateMutation.mutate(ruleset.id)}
                          disabled={activateMutation.isPending}
                          data-testid={`button-activate-${ruleset.id}`}
                        >
                          <Rocket className="h-4 w-4 mr-1" />
                          Activate
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRulesetMutation.mutate(ruleset.id)}
                          disabled={deleteRulesetMutation.isPending}
                          data-testid={`button-delete-${ruleset.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: AI Rule Generation */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  AI Rule Generator
                </CardTitle>
                <CardDescription>
                  Paste your loan program guidelines and let AI extract the pricing rules
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="guidelines">Program Guidelines</Label>
                  <Textarea
                    id="guidelines"
                    placeholder="Paste your loan program guidelines here. Include information about:
• Base interest rates by loan type
• FICO score adjustments
• LTV requirements and adjustments
• Borrower tier requirements
• Maximum leverage by tier
• Eligibility restrictions
• Geographic overlays"
                    value={guidelineText}
                    onChange={(e) => setGuidelineText(e.target.value)}
                    className="mt-1 min-h-[200px]"
                    data-testid="input-guidelines"
                  />
                </div>
                
                <Button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={!guidelineText.trim() || isAnalyzing}
                  className="w-full"
                  data-testid="button-analyze"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing Guidelines...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Analyze & Generate Rules
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Current Proposal */}
            {currentProposal && (
              <Card className="border-purple-200 dark:border-purple-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    AI Proposal Ready
                  </CardTitle>
                  <CardDescription>{currentProposal.aiExplanation}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="details">
                      <AccordionTrigger>
                        <span className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          View Proposed Rules
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        {renderRulesetSummary(currentProposal.proposalJson)}
                        <div className="mt-4 p-3 bg-muted rounded-lg">
                          <pre className="text-xs overflow-auto max-h-64">
                            {JSON.stringify(currentProposal.proposalJson, null, 2)}
                          </pre>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  {/* Refine */}
                  <div className="space-y-2">
                    <Label htmlFor="refine">Refinement Feedback (optional)</Label>
                    <Textarea
                      id="refine"
                      placeholder="Tell the AI what to change, e.g., 'Increase the FICO adjustment to 0.5%' or 'Add a rural property adjustment'"
                      value={refineFeedback}
                      onChange={(e) => setRefineFeedback(e.target.value)}
                      className="min-h-[80px]"
                      data-testid="input-refine"
                    />
                    <Button
                      variant="outline"
                      onClick={() => refineMutation.mutate()}
                      disabled={!refineFeedback.trim() || refineMutation.isPending}
                      data-testid="button-refine"
                    >
                      {refineMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Refine Proposal
                    </Button>
                  </div>

                  {/* Deploy */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentProposal(null)}
                      data-testid="button-discard"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Discard
                    </Button>
                    <Button
                      onClick={() => setShowDeployDialog(true)}
                      className="flex-1"
                      data-testid="button-deploy"
                    >
                      <Rocket className="h-4 w-4 mr-2" />
                      Deploy Ruleset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pending Proposals */}
            {pendingProposals.length > 0 && !currentProposal && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pending Proposals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingProposals.map((proposal) => (
                    <div key={proposal.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm">{proposal.aiExplanation?.slice(0, 60)}...</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(proposal.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentProposal(proposal)}
                        data-testid={`button-review-${proposal.id}`}
                      >
                        Review
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Test Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Test Pricing Calculation</DialogTitle>
            <DialogDescription>
              Enter loan parameters to test the pricing engine
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Loan Type</Label>
              <Select
                value={testInputs.loanType}
                onValueChange={(v) => setTestInputs({ ...testInputs, loanType: v })}
              >
                <SelectTrigger data-testid="select-test-loan-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light_rehab">Light Rehab</SelectItem>
                  <SelectItem value="heavy_rehab">Heavy Rehab</SelectItem>
                  <SelectItem value="bridge_no_rehab">Bridge (No Rehab)</SelectItem>
                  <SelectItem value="guc">Ground-Up Construction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Borrower Tier</Label>
              <Select
                value={testInputs.tier}
                onValueChange={(v) => setTestInputs({ ...testInputs, tier: v })}
              >
                <SelectTrigger data-testid="select-test-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="institutional">Institutional</SelectItem>
                  <SelectItem value="experienced">Experienced</SelectItem>
                  <SelectItem value="new_investor">New Investor</SelectItem>
                  <SelectItem value="no_experience">No Experience</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>FICO Score</Label>
              <Input
                type="number"
                value={testInputs.fico}
                onChange={(e) => setTestInputs({ ...testInputs, fico: parseInt(e.target.value) })}
                data-testid="input-test-fico"
              />
            </div>
            <div>
              <Label>LTV (%)</Label>
              <Input
                type="number"
                value={testInputs.ltv}
                onChange={(e) => setTestInputs({ ...testInputs, ltv: parseInt(e.target.value) })}
                data-testid="input-test-ltv"
              />
            </div>
            <div>
              <Label>Purpose</Label>
              <Select
                value={testInputs.purpose}
                onValueChange={(v) => setTestInputs({ ...testInputs, purpose: v })}
              >
                <SelectTrigger data-testid="select-test-purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="refinance">Refinance</SelectItem>
                  <SelectItem value="cash_out">Cash Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Property Type</Label>
              <Select
                value={testInputs.propertyType}
                onValueChange={(v) => setTestInputs({ ...testInputs, propertyType: v })}
              >
                <SelectTrigger data-testid="select-test-property">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-family">Single Family</SelectItem>
                  <SelectItem value="multifamily">Multifamily</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {testResult && (
            <Card className={testResult.eligible ? "border-green-200 bg-green-50 dark:bg-green-950" : "border-red-200 bg-red-50 dark:bg-red-950"}>
              <CardContent className="pt-4">
                {testResult.eligible ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Eligible</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div>
                        <p className="text-sm text-muted-foreground">Base Rate</p>
                        <p className="text-lg font-bold">{testResult.baseRate}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Final Rate</p>
                        <p className="text-lg font-bold text-primary">{testResult.finalRate}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Points</p>
                        <p className="text-lg font-bold">{testResult.points}</p>
                      </div>
                    </div>
                    {testResult.appliedAdjusters && testResult.appliedAdjusters.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">Applied Adjustments:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {testResult.appliedAdjusters.map((adj) => (
                            <Badge key={adj.id} variant="outline">
                              {adj.label}: +{adj.rateAdd}%
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {testResult.caps && (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">Leverage Caps:</p>
                        <div className="flex gap-4 mt-1 text-sm">
                          {testResult.caps.maxLTC && <span>LTC: {(testResult.caps.maxLTC * 100).toFixed(0)}%</span>}
                          {testResult.caps.maxLTV && <span>LTV: {(testResult.caps.maxLTV * 100).toFixed(0)}%</span>}
                          {testResult.caps.maxLTAIV && <span>LTAIV: {(testResult.caps.maxLTAIV * 100).toFixed(0)}%</span>}
                          {testResult.caps.maxLTARV && <span>LTARV: {(testResult.caps.maxLTARV * 100).toFixed(0)}%</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                      <XCircle className="h-5 w-5" />
                      <span className="font-medium">Not Eligible</span>
                    </div>
                    {testResult.reasons && (
                      <ul className="mt-2 text-sm text-red-600 dark:text-red-400 list-disc list-inside">
                        {testResult.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (activeRuleset) {
                  testMutation.mutate(activeRuleset.id);
                }
              }}
              disabled={!activeRuleset || testMutation.isPending}
              data-testid="button-run-test"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deploy Dialog */}
      <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy Ruleset</DialogTitle>
            <DialogDescription>
              Create a new ruleset version from this AI proposal
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="deploy-name">Ruleset Name (optional)</Label>
              <Input
                id="deploy-name"
                value={deployName}
                onChange={(e) => setDeployName(e.target.value)}
                placeholder="e.g., Q1 2026 Pricing Update"
                data-testid="input-deploy-name"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="activate-immediately"
                checked={activateImmediately}
                onChange={(e) => setActivateImmediately(e.target.checked)}
                className="rounded border-gray-300"
                data-testid="checkbox-activate"
              />
              <Label htmlFor="activate-immediately">Activate immediately (make live)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
              data-testid="button-confirm-deploy"
            >
              {deployMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Program Dialog */}
      <Dialog open={showAddProgramDialog} onOpenChange={setShowAddProgramDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Loan Program</DialogTitle>
            <DialogDescription>
              Create a new loan program to configure pricing rules for.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="program-name">Program Name *</Label>
              <Input
                id="program-name"
                value={newProgramData.name}
                onChange={(e) => setNewProgramData({ ...newProgramData, name: e.target.value })}
                placeholder="e.g., RTL Light Rehab 2026"
                data-testid="input-program-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="program-description">Description</Label>
              <Textarea
                id="program-description"
                value={newProgramData.description}
                onChange={(e) => setNewProgramData({ ...newProgramData, description: e.target.value })}
                placeholder="Brief description of the loan program"
                data-testid="input-program-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loan-type">Loan Type *</Label>
              <Select
                value={newProgramData.loanType}
                onValueChange={(v) => setNewProgramData({ ...newProgramData, loanType: v })}
              >
                <SelectTrigger data-testid="select-loan-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtl">RTL (Residential Transitional Loan)</SelectItem>
                  <SelectItem value="dscr">DSCR (Debt Service Coverage Ratio)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-loan">Min Loan Amount</Label>
                <Input
                  id="min-loan"
                  type="number"
                  value={newProgramData.minLoanAmount}
                  onChange={(e) => setNewProgramData({ ...newProgramData, minLoanAmount: parseInt(e.target.value) || 0 })}
                  data-testid="input-min-loan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-loan">Max Loan Amount</Label>
                <Input
                  id="max-loan"
                  type="number"
                  value={newProgramData.maxLoanAmount}
                  onChange={(e) => setNewProgramData({ ...newProgramData, maxLoanAmount: parseInt(e.target.value) || 0 })}
                  data-testid="input-max-loan"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-ltv">Min LTV (%)</Label>
                <Input
                  id="min-ltv"
                  type="number"
                  value={newProgramData.minLtv}
                  onChange={(e) => setNewProgramData({ ...newProgramData, minLtv: parseInt(e.target.value) || 0 })}
                  data-testid="input-min-ltv"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-ltv">Max LTV (%)</Label>
                <Input
                  id="max-ltv"
                  type="number"
                  value={newProgramData.maxLtv}
                  onChange={(e) => setNewProgramData({ ...newProgramData, maxLtv: parseInt(e.target.value) || 0 })}
                  data-testid="input-max-ltv"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-rate">Min Interest Rate (%)</Label>
                <Input
                  id="min-rate"
                  type="number"
                  step="0.25"
                  value={newProgramData.minInterestRate}
                  onChange={(e) => setNewProgramData({ ...newProgramData, minInterestRate: parseFloat(e.target.value) || 0 })}
                  data-testid="input-min-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-rate">Max Interest Rate (%)</Label>
                <Input
                  id="max-rate"
                  type="number"
                  step="0.25"
                  value={newProgramData.maxInterestRate}
                  onChange={(e) => setNewProgramData({ ...newProgramData, maxInterestRate: parseFloat(e.target.value) || 0 })}
                  data-testid="input-max-rate"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-options">Term Options (comma-separated months)</Label>
              <Input
                id="term-options"
                value={newProgramData.termOptions}
                onChange={(e) => setNewProgramData({ ...newProgramData, termOptions: e.target.value })}
                placeholder="12, 24, 36"
                data-testid="input-term-options"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProgramDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createProgramMutation.mutate(newProgramData)}
              disabled={createProgramMutation.isPending || !newProgramData.name}
              data-testid="button-create-program"
            >
              {createProgramMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
