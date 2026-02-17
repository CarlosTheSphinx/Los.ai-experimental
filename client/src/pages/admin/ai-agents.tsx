import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import {
  FileSearch,
  Shield,
  Mail,
  Settings,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Zap,
  TrendingUp,
  Play,
  GitBranch,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Pencil,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Timer,
  Power,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AgentConfiguration {
  id: number;
  agentType: string;
  name: string;
  systemPrompt: string;
  toolDefinitions: any[];
  modelProvider: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface AgentRun {
  id: number;
  agentType: string;
  projectId: number | null;
  configurationId: number | null;
  status: "running" | "completed" | "failed" | "cancelled";
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  triggerType: string | null;
  triggeredBy: number | null;
  startedAt: string;
  completedAt: string | null;
  dealTitle?: string;
  userEmail?: string;
}

interface PipelineAgentStep {
  id: number;
  agentType: string;
  name: string;
  description: string | null;
  stepOrder: number;
  isEnabled: boolean;
  triggerCondition: { type: string; config: Record<string, any> };
  inputMapping: { sources?: string[] };
  outputMapping: { delivers?: string[] };
  retryOnFailure: boolean;
  maxRetries: number;
  timeoutSeconds: number;
  createdAt: string;
  updatedAt: string;
}

const TRIGGER_TYPES = [
  { value: "document_uploaded", label: "Document Uploaded", description: "Fires when new documents are uploaded to the deal" },
  { value: "previous_step_complete", label: "Previous Step Complete", description: "Fires when the preceding agent finishes successfully" },
  { value: "stage_change", label: "Stage Change", description: "Fires when a deal moves to a new stage" },
  { value: "manual", label: "Manual Only", description: "Only runs when manually triggered by an admin" },
  { value: "scheduled", label: "Scheduled", description: "Runs on a time-based schedule" },
];

const AVAILABLE_DATA_SOURCES = [
  "deal_documents", "document_metadata", "document_extractions",
  "credit_policies", "loan_program_rules", "agent_findings",
  "deal_context", "borrower_info", "broker_info", "financial_data",
  "property_appraisals", "title_reports", "insurance_docs",
];

const AVAILABLE_OUTPUTS = [
  "extracted_fields", "document_classification", "quality_assessment", "anomalies",
  "risk_assessment", "policy_findings", "financial_metrics", "conditions",
  "email_drafts", "sms_notifications", "status_updates", "condition_letters",
  "deal_summary", "compliance_flags", "missing_documents",
];

interface AgentCardConfig {
  type: string;
  name: string;
  icon: React.ReactNode;
  description: string;
}

const AGENT_CONFIGS: Record<string, AgentCardConfig> = {
  document_intelligence: {
    type: "document_intelligence",
    name: "Document Intelligence",
    icon: <FileSearch className="w-6 h-6" />,
    description: "Extracts structured data from uploaded documents",
  },
  processor: {
    type: "processor",
    name: "Loan Processor",
    icon: <Shield className="w-6 h-6" />,
    description: "Analyzes deals against credit policies and document requirements",
  },
  communication: {
    type: "communication",
    name: "Communication Agent",
    icon: <Mail className="w-6 h-6" />,
    description: "Drafts borrower and broker communications from findings",
  },
};

const MODEL_PROVIDERS = ["openai", "anthropic"];
const OPENAI_MODELS = ["gpt-4o", "gpt-4-turbo", "gpt-5-mini"];
const ANTHROPIC_MODELS = ["claude-sonnet-4-5-20250929", "claude-opus-4-6"];

const DEFAULT_TEMPLATE_VARIABLES: Record<string, string[]> = {
  document_intelligence: [
    "{{document_path}}",
    "{{document_type}}",
    "{{document_content}}",
    "{{extraction_fields}}",
  ],
  processor: [
    "{{deal_id}}",
    "{{deal_documents}}",
    "{{credit_policy}}",
    "{{financial_summary}}",
    "{{missing_documents}}",
  ],
  communication: [
    "{{borrower_name}}",
    "{{borrower_email}}",
    "{{deal_findings}}",
    "{{required_documents}}",
    "{{next_steps}}",
  ],
};

function AgentCard({
  config,
  configuration,
  stats,
  onConfigure,
  onViewRuns,
}: {
  config: AgentCardConfig;
  configuration: AgentConfiguration | undefined;
  stats: {
    totalRuns: number;
    avgDuration: number;
    successRate: number;
  };
  onConfigure: () => void;
  onViewRuns: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="text-primary mt-1">{config.icon}</div>
            <div>
              <CardTitle className="text-lg">{config.name}</CardTitle>
              <CardDescription className="text-sm mt-1">{config.description}</CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "ml-2 mt-1",
              configuration?.isActive
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-gray-50 text-gray-600 border-gray-200"
            )}
          >
            {configuration?.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div>
            <div className="text-xs text-muted-foreground">Total Runs</div>
            <div className="text-xl font-bold">{stats.totalRuns}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Avg Duration</div>
            <div className="text-xl font-bold">{Math.round(stats.avgDuration)}ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Success Rate</div>
            <div className="text-xl font-bold">{Math.round(stats.successRate)}%</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 mt-auto">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onConfigure}
            disabled={!configuration}
          >
            <Settings className="w-4 h-4 mr-1" />
            Configure
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onViewRuns}
          >
            <TrendingUp className="w-4 h-4 mr-1" />
            View Runs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigurationEditor({
  isOpen,
  onOpenChange,
  agentType,
  configuration,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  agentType: string;
  configuration: AgentConfiguration | undefined;
  onSave: (config: Partial<AgentConfiguration>) => Promise<void>;
}) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelProvider, setModelProvider] = useState("openai");
  const [modelName, setModelName] = useState("claude-sonnet-4-5-20250929");
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [toolDefinitions, setToolDefinitions] = useState("[]");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (configuration) {
      setSystemPrompt(configuration.systemPrompt);
      setModelProvider(configuration.modelProvider);
      setModelName(configuration.modelName);
      setTemperature(configuration.temperature);
      setMaxTokens(configuration.maxTokens);
      setToolDefinitions(JSON.stringify(configuration.toolDefinitions || [], null, 2));
    }
  }, [configuration, isOpen]);

  const handleSave = async () => {
    try {
      // Validate JSON
      try {
        JSON.parse(toolDefinitions);
      } catch {
        toast({
          title: "Invalid JSON",
          description: "Tool definitions must be valid JSON",
          variant: "destructive",
        });
        return;
      }

      setIsSaving(true);
      await onSave({
        systemPrompt,
        modelProvider,
        modelName,
        temperature,
        maxTokens,
        toolDefinitions: JSON.parse(toolDefinitions),
      });
      onOpenChange(false);
      toast({
        title: "Saved",
        description: "Agent configuration updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const availableModels = modelProvider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure {AGENT_CONFIGS[agentType]?.name}</DialogTitle>
          <DialogDescription>
            Customize the system prompt, model settings, and tool definitions for this agent.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="prompt" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
          </TabsList>

          {/* System Prompt Tab */}
          <TabsContent value="prompt" className="space-y-4">
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="font-mono text-sm min-h-96 bg-slate-950 text-slate-50 border-slate-700"
                placeholder="Enter the system prompt for this agent..."
              />
              <p className="text-xs text-muted-foreground">
                Use template variables like {"{{variable_name}}"} to inject dynamic content
              </p>
            </div>
          </TabsContent>

          {/* Model Settings Tab */}
          <TabsContent value="model" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Model Provider</Label>
                <Select value={modelProvider} onValueChange={setModelProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_PROVIDERS.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider.charAt(0).toUpperCase() + provider.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Model Name</Label>
                <Select value={modelName} onValueChange={setModelName}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Temperature: {temperature.toFixed(2)}</Label>
                <span className="text-xs text-muted-foreground">0 (precise) - 1 (creative)</span>
              </div>
              <Slider
                value={[temperature]}
                onValueChange={(val) => setTemperature(val[0])}
                min={0}
                max={1}
                step={0.01}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                min={100}
                max={128000}
              />
            </div>
          </TabsContent>

          {/* Tool Definitions Tab */}
          <TabsContent value="tools" className="space-y-4">
            <div className="space-y-2">
              <Label>Tool Definitions (JSON)</Label>
              <Textarea
                value={toolDefinitions}
                onChange={(e) => setToolDefinitions(e.target.value)}
                className="font-mono text-sm min-h-96 bg-slate-950 text-slate-50 border-slate-700"
                placeholder='Enter tool definitions as JSON array...'
              />
              <p className="text-xs text-muted-foreground">
                Define the tools/functions available to this agent as a JSON array
              </p>
            </div>
          </TabsContent>

          {/* Template Variables Tab */}
          <TabsContent value="variables" className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 mb-3">
                Available template variables for <strong>{AGENT_CONFIGS[agentType]?.name}</strong>:
              </p>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_TEMPLATE_VARIABLES[agentType]?.map((variable) => (
                  <code
                    key={variable}
                    className="bg-white px-3 py-1 rounded border border-blue-200 text-xs font-mono text-blue-700"
                  >
                    {variable}
                  </code>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunHistoryTable({
  runs,
  agentTypeFilter,
  onAgentTypeFilterChange,
}: {
  runs: AgentRun[];
  agentTypeFilter: string;
  onAgentTypeFilterChange: (type: string) => void;
}) {
  const filteredRuns = agentTypeFilter && agentTypeFilter !== "all"
    ? runs.filter((run) => run.agentType === agentTypeFilter)
    : runs;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case "cancelled":
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "failed":
        return "bg-red-50 text-red-700 border-red-200";
      case "running":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "cancelled":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <Select value={agentTypeFilter} onValueChange={onAgentTypeFilterChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by agent type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {Object.entries(AGENT_CONFIGS).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No runs found
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Agent</th>
                <th className="px-4 py-3 text-left font-medium">Deal</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Duration</th>
                <th className="px-4 py-3 text-left font-medium">Tokens (In/Out)</th>
                <th className="px-4 py-3 text-left font-medium">Cost</th>
                <th className="px-4 py-3 text-left font-medium">Triggered By</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => (
                <tr key={run.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {AGENT_CONFIGS[run.agentType]?.name || run.agentType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.dealTitle || `Deal #${run.projectId}`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={cn("flex w-fit gap-1", getStatusColor(run.status))}
                    >
                      {getStatusIcon(run.status)}
                      {run.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {run.durationMs ? (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {Math.round(run.durationMs)}ms
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {run.inputTokens || run.outputTokens ? (
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-yellow-600" />
                        {run.inputTokens}/{run.outputTokens}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {run.estimatedCost ? `$${run.estimatedCost.toFixed(4)}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.userEmail || (run.triggerType ? run.triggerType : "-")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(run.startedAt), "MMM d, HH:mm")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PipelineStepEditor({
  step,
  onSave,
  onClose,
}: {
  step: PipelineAgentStep;
  onSave: (data: Partial<PipelineAgentStep>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(step.name);
  const [description, setDescription] = useState(step.description || "");
  const [triggerType, setTriggerType] = useState(step.triggerCondition?.type || "previous_step_complete");
  const [triggerConfig, setTriggerConfig] = useState(JSON.stringify(step.triggerCondition?.config || {}, null, 2));
  const [inputSources, setInputSources] = useState<string[]>(step.inputMapping?.sources || []);
  const [outputDelivers, setOutputDelivers] = useState<string[]>(step.outputMapping?.delivers || []);
  const [retryOnFailure, setRetryOnFailure] = useState(step.retryOnFailure);
  const [maxRetries, setMaxRetries] = useState(step.maxRetries);
  const [timeoutSeconds, setTimeoutSeconds] = useState(step.timeoutSeconds);

  const handleSave = () => {
    let parsedConfig = {};
    try { parsedConfig = JSON.parse(triggerConfig); } catch {}
    onSave({
      name,
      description: description || null,
      triggerCondition: { type: triggerType, config: parsedConfig },
      inputMapping: { sources: inputSources },
      outputMapping: { delivers: outputDelivers },
      retryOnFailure,
      maxRetries,
      timeoutSeconds,
    });
  };

  const toggleSource = (source: string) => {
    setInputSources(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]);
  };

  const toggleOutput = (output: string) => {
    setOutputDelivers(prev => prev.includes(output) ? prev.filter(o => o !== output) : [...prev, output]);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Pencil className="h-5 w-5" />
          Configure: {step.name}
        </DialogTitle>
        <DialogDescription>
          Set up triggers, data flow, and behavior for this pipeline step
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        <div className="space-y-2">
          <Label>Step Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-step-name" />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} data-testid="input-step-description" />
        </div>

        <div className="space-y-2">
          <Label>Trigger Condition</Label>
          <Select value={triggerType} onValueChange={setTriggerType}>
            <SelectTrigger data-testid="select-trigger-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {TRIGGER_TYPES.find(t => t.value === triggerType)?.description}
          </p>
          {triggerType !== "manual" && triggerType !== "previous_step_complete" && (
            <div className="space-y-1">
              <Label className="text-xs">Trigger Configuration (JSON)</Label>
              <Textarea value={triggerConfig} onChange={(e) => setTriggerConfig(e.target.value)} rows={3} className="font-mono text-xs" data-testid="input-trigger-config" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Input Data Sources</Label>
          <p className="text-xs text-muted-foreground mb-2">What data this agent receives from the deal and previous agents</p>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_DATA_SOURCES.map(source => (
              <Badge
                key={source}
                variant={inputSources.includes(source) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleSource(source)}
                data-testid={`badge-source-${source}`}
              >
                {source.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Output Deliverables</Label>
          <p className="text-xs text-muted-foreground mb-2">What this agent produces and passes to the next step</p>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_OUTPUTS.map(output => (
              <Badge
                key={output}
                variant={outputDelivers.includes(output) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleOutput(output)}
                data-testid={`badge-output-${output}`}
              >
                {output.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch checked={retryOnFailure} onCheckedChange={setRetryOnFailure} data-testid="switch-retry" />
              <Label className="text-sm">Retry on Failure</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Max Retries</Label>
            <Input type="number" min={1} max={5} value={maxRetries} onChange={(e) => setMaxRetries(parseInt(e.target.value) || 1)} disabled={!retryOnFailure} data-testid="input-max-retries" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Timeout (seconds)</Label>
            <Input type="number" min={30} max={1800} value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 300)} data-testid="input-timeout" />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-step">Cancel</Button>
        <Button onClick={handleSave} data-testid="button-save-step">
          <Save className="h-4 w-4 mr-1.5" />
          Save Configuration
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PipelineOrchestrationEditor({
  pipelineSettings,
  toggleAutoRun,
  recentPipelineRuns,
}: {
  pipelineSettings: any;
  toggleAutoRun: (enabled: boolean) => void;
  recentPipelineRuns: any[];
}) {
  const { toast } = useToast();
  const [editingStep, setEditingStep] = useState<PipelineAgentStep | null>(null);

  const { data: pipelineSteps = [], isLoading } = useQuery({
    queryKey: ["/api/admin/agents/pipeline/steps"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agents/pipeline/steps", { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<PipelineAgentStep[]>;
    },
  });

  const { mutate: updateStep } = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PipelineAgentStep> & { id: number }) => {
      return apiRequest("PUT", `/api/admin/agents/pipeline/steps/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/pipeline/steps"] });
      setEditingStep(null);
      toast({ title: "Updated", description: "Pipeline step configuration saved." });
    },
  });

  const { mutate: reorderSteps } = useMutation({
    mutationFn: async (stepIds: number[]) => {
      return apiRequest("PUT", "/api/admin/agents/pipeline/steps/reorder", { stepIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/pipeline/steps"] });
    },
  });

  const { mutate: toggleStepEnabled } = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      return apiRequest("PUT", `/api/admin/agents/pipeline/steps/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/pipeline/steps"] });
    },
  });

  const moveStep = (stepId: number, direction: "up" | "down") => {
    const sorted = [...pipelineSteps].sort((a, b) => a.stepOrder - b.stepOrder);
    const idx = sorted.findIndex(s => s.id === stepId);
    if (direction === "up" && idx > 0) {
      const ids = sorted.map(s => s.id);
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      reorderSteps(ids);
    } else if (direction === "down" && idx < sorted.length - 1) {
      const ids = sorted.map(s => s.id);
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      reorderSteps(ids);
    }
  };

  const sortedSteps = [...pipelineSteps].sort((a, b) => a.stepOrder - b.stepOrder);
  const enabledSteps = sortedSteps.filter(s => s.isEnabled);

  const getAgentIcon = (agentType: string) => {
    return AGENT_CONFIGS[agentType]?.icon || <Settings className="w-5 h-5" />;
  };

  return (
    <>
      <Card data-testid="card-pipeline-orchestration">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Pipeline Orchestration
              </CardTitle>
              <CardDescription className="mt-1">
                Configure the agent chain: order, triggers, and data flow between each step
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant={pipelineSettings?.autoRunPipeline ? "default" : "outline"}
                size="sm"
                onClick={() => toggleAutoRun(!pipelineSettings?.autoRunPipeline)}
                data-testid="button-toggle-auto-trigger"
              >
                <Zap className="h-4 w-4 mr-1.5" />
                {pipelineSettings?.autoRunPipeline ? "Auto-trigger: ON" : "Auto-trigger: OFF"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              {/* Visual Flow Summary */}
              <div className="flex items-center justify-center gap-1.5 py-3 px-4 bg-muted/30 rounded-lg overflow-x-auto">
                {enabledSteps.map((step, i) => (
                  <div key={step.id} className="flex items-center gap-1.5 shrink-0">
                    <div className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium",
                      "bg-background"
                    )}>
                      {getAgentIcon(step.agentType)}
                      <span>{step.name}</span>
                    </div>
                    {i < enabledSteps.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                ))}
                {enabledSteps.length === 0 && (
                  <span className="text-sm text-muted-foreground">No active agents in pipeline</span>
                )}
              </div>

              {/* Detailed Step Cards */}
              <div className="space-y-3">
                {sortedSteps.map((step, idx) => {
                  const triggerLabel = TRIGGER_TYPES.find(t => t.value === step.triggerCondition?.type)?.label || step.triggerCondition?.type;
                  const inputCount = step.inputMapping?.sources?.length || 0;
                  const outputCount = step.outputMapping?.delivers?.length || 0;
                  return (
                    <div
                      key={step.id}
                      className={cn(
                        "border rounded-lg p-4 transition-opacity",
                        !step.isEnabled && "opacity-50"
                      )}
                      data-testid={`pipeline-step-card-${step.id}`}
                    >
                      <div className="flex items-start gap-3 flex-wrap">
                        {/* Reorder + Icon */}
                        <div className="flex flex-col items-center gap-0.5 pt-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => moveStep(step.id, "up")}
                            disabled={idx === 0}
                            data-testid={`button-move-up-${step.id}`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
                            {getAgentIcon(step.agentType)}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => moveStep(step.id, "down")}
                            disabled={idx === sortedSteps.length - 1}
                            data-testid={`button-move-down-${step.id}`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Step Info */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{step.name}</span>
                            <Badge variant="secondary" className="text-xs">Step {idx + 1}</Badge>
                            <Badge variant="outline" className="text-xs">
                              <Zap className="h-3 w-3 mr-1" />
                              {triggerLabel}
                            </Badge>
                          </div>
                          {step.description && (
                            <p className="text-sm text-muted-foreground">{step.description}</p>
                          )}

                          {/* Data Flow */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <ArrowDown className="h-3 w-3" />
                              {inputCount} input{inputCount !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1">
                              <ArrowUp className="h-3 w-3" />
                              {outputCount} output{outputCount !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              {step.timeoutSeconds}s timeout
                            </span>
                            {step.retryOnFailure && (
                              <span className="flex items-center gap-1">
                                <RotateCcw className="h-3 w-3" />
                                {step.maxRetries} retries
                              </span>
                            )}
                          </div>

                          {/* Input/Output Tags */}
                          {(inputCount > 0 || outputCount > 0) && (
                            <div className="space-y-1.5">
                              {inputCount > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Receives:</span>
                                  {step.inputMapping.sources!.slice(0, 4).map(s => (
                                    <Badge key={s} variant="outline" className="text-[10px] py-0">{s.replace(/_/g, " ")}</Badge>
                                  ))}
                                  {inputCount > 4 && <Badge variant="outline" className="text-[10px] py-0">+{inputCount - 4} more</Badge>}
                                </div>
                              )}
                              {outputCount > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Delivers:</span>
                                  {step.outputMapping.delivers!.slice(0, 4).map(o => (
                                    <Badge key={o} variant="outline" className="text-[10px] py-0">{o.replace(/_/g, " ")}</Badge>
                                  ))}
                                  {outputCount > 4 && <Badge variant="outline" className="text-[10px] py-0">+{outputCount - 4} more</Badge>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={step.isEnabled}
                            onCheckedChange={(enabled) => toggleStepEnabled({ id: step.id, isEnabled: enabled })}
                            data-testid={`switch-enable-${step.id}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingStep(step)}
                            data-testid={`button-edit-step-${step.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent Pipeline Runs */}
              {recentPipelineRuns && recentPipelineRuns.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Recent Pipeline Runs
                  </h4>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted border-b">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Deal</th>
                          <th className="px-4 py-2 text-left font-medium">Status</th>
                          <th className="px-4 py-2 text-left font-medium">Progress</th>
                          <th className="px-4 py-2 text-left font-medium">Duration</th>
                          <th className="px-4 py-2 text-left font-medium">Trigger</th>
                          <th className="px-4 py-2 text-left font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentPipelineRuns.slice(0, 10).map((run: any) => (
                          <tr key={run.id} className="border-b hover-elevate">
                            <td className="px-4 py-2">Deal #{run.projectId}</td>
                            <td className="px-4 py-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs capitalize",
                                  run.status === "completed" && "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
                                  run.status === "running" && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
                                  run.status === "failed" && "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                                )}
                              >
                                {run.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                {run.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {run.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                                {run.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              Step {(run.currentAgentIndex || 0) + 1} / {(run.agentSequence || []).length || 3}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {run.totalDurationMs ? `${Math.round(run.totalDurationMs / 1000)}s` : "\u2014"}
                            </td>
                            <td className="px-4 py-2">
                              <Badge variant="outline" className="text-xs">{run.triggerType}</Badge>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {run.startedAt ? format(new Date(run.startedAt), "MMM d, HH:mm") : "\u2014"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No pipeline runs yet. Start a pipeline from any deal's AI Review tab.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Step Editor Dialog */}
      <Dialog open={!!editingStep} onOpenChange={(open) => { if (!open) setEditingStep(null); }}>
        {editingStep && (
          <PipelineStepEditor
            step={editingStep}
            onSave={(data) => updateStep({ id: editingStep.id, ...data })}
            onClose={() => setEditingStep(null)}
          />
        )}
      </Dialog>
    </>
  );
}

export default function AIAgentsPage() {
  const { toast } = useToast();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<string>("");
  const [runHistoryAgentFilter, setRunHistoryAgentFilter] = useState("");

  // Pipeline settings
  const { data: pipelineSettings } = useQuery({
    queryKey: ["/api/admin/agents/pipeline/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agents/pipeline/settings");
      if (!res.ok) return { autoRunPipeline: false };
      return res.json();
    },
  });

  const { mutate: toggleAutoRun } = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", "/api/admin/agents/pipeline/settings", {
        autoRunPipeline: enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/pipeline/settings"] });
      toast({ title: "Updated", description: "Pipeline auto-trigger setting saved." });
    },
  });

  // Recent pipeline runs
  const { data: recentPipelineRuns } = useQuery({
    queryKey: ["/api/admin/agents/pipeline/recent"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agents/pipeline/recent");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch configurations
  const { data: configurations, isLoading: configLoading } = useQuery({
    queryKey: ["/api/admin/agents/configurations"],
    queryFn: async () => {
      const response = await fetch("/api/admin/agents/configurations");
      if (!response.ok) throw new Error("Failed to fetch configurations");
      return response.json() as Promise<AgentConfiguration[]>;
    },
  });

  const [activeTab, setActiveTab] = useState("runs");

  // Fetch runs
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["/api/admin/agents/runs"],
    queryFn: async () => {
      const response = await fetch("/api/admin/agents/runs");
      if (!response.ok) throw new Error("Failed to fetch runs");
      const data = await response.json();
      return (data.runs || data) as AgentRun[];
    },
  });

  // Seed defaults mutation
  const { mutate: seedDefaults, isPending: isSeedingLoading } = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", "/api/admin/agents/seed-defaults", {});
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/configurations"] });
      toast({
        title: "Success",
        description: "Default agent configurations initialized",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initialize agents",
        variant: "destructive",
      });
    },
  });

  // Update configuration mutation
  const { mutate: updateConfiguration } = useMutation({
    mutationFn: async (config: Partial<AgentConfiguration> & { id: number }) => {
      const result = await apiRequest(
        "PUT",
        `/api/admin/agents/configurations/${config.id}`,
        config
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/configurations"] });
    },
  });

  // Calculate stats for an agent
  const getAgentStats = (agentType: string) => {
    const agentRuns = runs?.filter((r) => r.agentType === agentType) || [];
    const completedRuns = agentRuns.filter((r) => r.status === "completed");

    const totalRuns = agentRuns.length;
    const avgDuration =
      completedRuns.length > 0
        ? completedRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) /
          completedRuns.length
        : 0;
    const successRate =
      totalRuns > 0 ? (completedRuns.length / totalRuns) * 100 : 0;

    return { totalRuns, avgDuration, successRate };
  };

  // Get configuration for agent type
  const getConfigurationForAgent = (agentType: string) => {
    return configurations?.find((c) => c.agentType === agentType);
  };

  const hasConfigurations = configurations && configurations.length > 0;

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Agents</h1>
        <p className="text-muted-foreground mt-1">
          Configure and monitor your autonomous loan processing agents
        </p>
      </div>

      {/* Initialize if needed */}
      {!hasConfigurations && configLoading === false ? (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900">Initialize Agent System</h3>
                <p className="text-sm text-blue-700 mt-1">
                  No agent configurations found. Create the default agents to get started.
                </p>
              </div>
              <Button
                onClick={() => seedDefaults()}
                disabled={isSeedingLoading}
                className="ml-4"
              >
                {isSeedingLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  "Initialize Agent System"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-3 gap-6">
        {Object.values(AGENT_CONFIGS).map((config) => (
          <AgentCard
            key={config.type}
            config={config}
            configuration={getConfigurationForAgent(config.type)}
            stats={getAgentStats(config.type)}
            onConfigure={() => {
              setSelectedAgentType(config.type);
              setConfigDialogOpen(true);
            }}
            onViewRuns={() => {
              setRunHistoryAgentFilter(config.type);
              setActiveTab("runs");
              setTimeout(() => {
                document.getElementById("run-history-section")?.scrollIntoView({ behavior: "smooth" });
              }, 100);
            }}
          />
        ))}
      </div>

      {/* Pipeline Orchestration Section */}
      <PipelineOrchestrationEditor
        pipelineSettings={pipelineSettings}
        toggleAutoRun={toggleAutoRun}
        recentPipelineRuns={recentPipelineRuns}
      />

      {/* Configuration Editor Dialog */}
      {selectedAgentType && (
        <ConfigurationEditor
          isOpen={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          agentType={selectedAgentType}
          configuration={getConfigurationForAgent(selectedAgentType)}
          onSave={async (updatedConfig) => {
            const configId = getConfigurationForAgent(selectedAgentType)?.id;
            if (configId) {
              updateConfiguration({
                id: configId,
                ...updatedConfig,
              } as any);
            }
          }}
        />
      )}

      {/* Run History Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="run-history-section">
        <TabsList>
          <TabsTrigger value="runs">Run History</TabsTrigger>
          <TabsTrigger value="dealstory">Deal Story</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-6 mt-6">
          {runsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <RunHistoryTable
              runs={runs || []}
              agentTypeFilter={runHistoryAgentFilter}
              onAgentTypeFilterChange={setRunHistoryAgentFilter}
            />
          )}
        </TabsContent>

        <TabsContent value="dealstory" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Deal Story</CardTitle>
              <CardDescription>
                Understanding the living narrative system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose prose-sm max-w-none">
                <p>
                  Every deal maintains a <strong>living narrative</strong> - a compiled story of all
                  documents, findings, communications, and next steps. This story is continuously
                  updated as:
                </p>
                <ul className="list-disc list-inside space-y-2 mt-3">
                  <li>
                    <strong>Document Intelligence Agent</strong> extracts and analyzes new documents
                  </li>
                  <li>
                    <strong>Loan Processor Agent</strong> evaluates compliance and provides findings
                  </li>
                  <li>
                    <strong>Communication Agent</strong> drafts communications based on findings
                  </li>
                </ul>
                <p className="mt-4">
                  The deal story serves as a dynamic reference point for all parties involved in
                  the loan process, providing context and continuity throughout the lifecycle of
                  a deal.
                </p>
                <p className="mt-4">
                  To view and manage deal stories for specific deals, navigate to the individual
                  deal detail page where you can see the complete narrative and history of that
                  deal's processing.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
