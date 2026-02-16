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
  const filteredRuns = agentTypeFilter
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
            <SelectItem value="">All Agents</SelectItem>
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

export default function AIAgentsPage() {
  const { toast } = useToast();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<string>("");
  const [runHistoryAgentFilter, setRunHistoryAgentFilter] = useState("");

  // Fetch configurations
  const { data: configurations, isLoading: configLoading } = useQuery({
    queryKey: ["/api/admin/agents/configurations"],
    queryFn: async () => {
      const response = await fetch("/api/admin/agents/configurations");
      if (!response.ok) throw new Error("Failed to fetch configurations");
      return response.json() as Promise<AgentConfiguration[]>;
    },
  });

  // Fetch runs
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["/api/admin/agents/runs"],
    queryFn: async () => {
      const response = await fetch("/api/admin/agents/runs");
      if (!response.ok) throw new Error("Failed to fetch runs");
      return response.json() as Promise<AgentRun[]>;
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
            }}
          />
        ))}
      </div>

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
      <Tabs defaultValue="runs" className="w-full">
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
