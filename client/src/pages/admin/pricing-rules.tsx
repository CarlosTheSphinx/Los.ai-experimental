import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Upload,
  FileText,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { useState, useRef } from "react";
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
  createdAt: string;
  activatedAt: string | null;
}

type Step = "input" | "confirm";

export default function PricingRulesPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Current step in the flow
  const [currentStep, setCurrentStep] = useState<Step>("input");
  
  // Selected program
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  
  // PDF upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Rules text input
  const [rulesText, setRulesText] = useState("");
  
  // Parsed/processed rules for confirmation
  const [parsedRules, setParsedRules] = useState<any>(null);
  const [rulesetName, setRulesetName] = useState("");
  
  // Add program dialog
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

  // Fetch existing rulesets for selected program
  const { data: rulesetsData } = useQuery<{ rulesets: PricingRuleset[] }>({
    queryKey: ["/api/admin/programs", selectedProgramId, "rulesets"],
    enabled: !!selectedProgramId,
  });

  const selectedProgram = programsData?.programs?.find(p => p.id === selectedProgramId);
  const activeRuleset = rulesetsData?.rulesets?.find(r => r.status === 'active');

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
      toast({ title: "Program created", description: "You can now configure pricing rules." });
      if (data.program?.id) {
        setSelectedProgramId(data.program.id);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create program", variant: "destructive" });
    },
  });

  // AI analyze mutation (processes PDF or text rules)
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/programs/${selectedProgramId}/ai-analyze`, {
        guidelines: rulesText,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.proposal) {
        setParsedRules(data.proposal.proposalJson);
        setCurrentStep("confirm");
        toast({ title: "Rules processed", description: "Review and confirm the pricing rules." });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to process rules", variant: "destructive" });
    },
  });

  // Deploy/save ruleset mutation
  const deployMutation = useMutation({
    mutationFn: async () => {
      // First deploy the proposal as a ruleset
      const res = await apiRequest("POST", `/api/admin/programs/${selectedProgramId}/rulesets`, {
        name: rulesetName || `Ruleset ${new Date().toLocaleDateString()}`,
        rulesJson: parsedRules,
        activateImmediately: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgramId, "rulesets"] });
      toast({ title: "Rules saved and activated", description: "The pricing rules are now live." });
      // Reset to input step
      setCurrentStep("input");
      setRulesText("");
      setParsedRules(null);
      setUploadedFile(null);
      setRulesetName("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save rules", variant: "destructive" });
    },
  });

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      toast({ title: "Invalid file", description: "Please upload a PDF file", variant: "destructive" });
      return;
    }
    
    setUploadedFile(file);
    setIsUploading(true);
    
    // For now, we'll just note that a PDF was uploaded
    // In a full implementation, you'd extract text from the PDF
    toast({ 
      title: "PDF uploaded", 
      description: "You can add additional rules in the text area below." 
    });
    setIsUploading(false);
  };

  // Handle proceeding to confirmation
  const handleProceed = () => {
    if (!rulesText.trim() && !uploadedFile) {
      toast({ 
        title: "No rules entered", 
        description: "Please upload a PDF or type in your pricing rules.", 
        variant: "destructive" 
      });
      return;
    }
    
    // Process the rules with AI
    analyzeMutation.mutate();
  };

  // Handle going back
  const handleBack = () => {
    setCurrentStep("input");
  };

  // Handle save/confirm
  const handleSave = () => {
    deployMutation.mutate();
  };

  if (programsLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Pricing Rules</h1>
          <p className="text-muted-foreground">
            {currentStep === "input" 
              ? "Upload a PDF or enter your pricing rules" 
              : "Review and confirm your pricing rules"}
          </p>
        </div>
        {currentStep === "input" && activeRuleset && (
          <Badge variant="outline" className="text-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active ruleset: v{activeRuleset.version}
          </Badge>
        )}
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
                setCurrentStep("input");
                setRulesText("");
                setParsedRules(null);
                setUploadedFile(null);
              }}
            >
              <SelectTrigger className="w-full max-w-md" data-testid="select-program">
                <SelectValue placeholder="Choose a loan program" />
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

      {selectedProgram && currentStep === "input" && (
        <>
          {/* PDF Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Guidelines PDF
              </CardTitle>
              <CardDescription>
                Upload a PDF containing your loan program guidelines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                  data-testid="input-pdf-upload"
                />
                {uploadedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">{uploadedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(uploadedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadedFile(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : isUploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Uploading...</span>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      PDF files only
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Rules Text Input Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Enter Pricing Rules
              </CardTitle>
              <CardDescription>
                Type or paste your pricing rules, rate sheets, or guidelines
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={`Enter your pricing rules here. For example:

Base Rates:
- Light Rehab: 9.25%
- Heavy Rehab: 9.50%
- Bridge (No Rehab): 9.25%

Adjusters:
- FICO below 700: +0.25%
- LTV above 75%: +0.25%
- Cash-out refinance: +0.50%
- Multifamily property: +1.00%

Eligibility:
- Minimum FICO: 620
- Maximum LTV: 85%
- No cash-out bridge for first-time borrowers`}
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                data-testid="textarea-rules"
              />
              
              <div className="flex justify-end">
                <Button 
                  onClick={handleProceed}
                  disabled={(!rulesText.trim() && !uploadedFile) || analyzeMutation.isPending}
                  data-testid="button-proceed"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {selectedProgram && currentStep === "confirm" && parsedRules && (
        <>
          {/* Confirmation Screen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Confirm Pricing Rules
              </CardTitle>
              <CardDescription>
                Review the parsed pricing rules before saving
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Ruleset Name */}
              <div className="space-y-2">
                <Label htmlFor="ruleset-name">Ruleset Name (optional)</Label>
                <Input
                  id="ruleset-name"
                  value={rulesetName}
                  onChange={(e) => setRulesetName(e.target.value)}
                  placeholder={`${selectedProgram.name} Pricing Rules`}
                  data-testid="input-ruleset-name"
                />
              </div>

              {/* Base Rates */}
              {parsedRules.baseRates && (
                <div className="space-y-2">
                  <h3 className="font-medium">Base Rates</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(parsedRules.baseRates).map(([type, rate]) => (
                      <div key={type} className="bg-muted rounded-lg p-3">
                        <p className="text-sm text-muted-foreground capitalize">
                          {type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-lg font-bold">{String(rate)}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Adjusters */}
              {parsedRules.adjusters && parsedRules.adjusters.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Rate Adjusters</h3>
                  <div className="space-y-2">
                    {parsedRules.adjusters.map((adj: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-muted rounded-lg p-3">
                        <span>{adj.label}</span>
                        <Badge variant={adj.rateAdd > 0 ? "destructive" : "default"}>
                          {adj.rateAdd > 0 ? '+' : ''}{adj.rateAdd}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Leverage Caps */}
              {parsedRules.leverageCaps && parsedRules.leverageCaps.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Leverage Caps</h3>
                  <div className="space-y-2">
                    {parsedRules.leverageCaps.map((cap: any, i: number) => (
                      <div key={i} className="bg-muted rounded-lg p-3">
                        <p className="font-medium capitalize">{cap.tier.replace(/_/g, ' ')}</p>
                        <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                          {cap.max?.ltc && <span>LTC: {(cap.max.ltc * 100)}%</span>}
                          {cap.max?.ltaiv && <span>LTAIV: {(cap.max.ltaiv * 100)}%</span>}
                          {cap.max?.ltarv && <span>LTARV: {(cap.max.ltarv * 100)}%</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Eligibility Rules */}
              {parsedRules.eligibilityRules && parsedRules.eligibilityRules.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Eligibility Rules</h3>
                  <div className="space-y-2">
                    {parsedRules.eligibilityRules.map((rule: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-red-700 dark:text-red-300">
                        <X className="h-4 w-4" />
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" onClick={handleBack} data-testid="button-back">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Edit
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={deployMutation.isPending}
                  data-testid="button-save-rules"
                >
                  {deployMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save & Activate Rules
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedProgram && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Select a Program</h3>
            <p className="text-muted-foreground">
              Choose a loan program above to configure its pricing rules
            </p>
          </CardContent>
        </Card>
      )}

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
