import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Bot, Users, Info, RotateCcw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Default prompts (mirrors what is hardcoded in the server) ──────────────────

const LENDER_DEFAULTS = {
  intro: `You are Lendry AI, an expert loan processing assistant for commercial real estate. You help lenders and processors manage their deal pipeline efficiently.`,
  capabilities: `Search and retrieve deal information by name, borrower, property, or project number
View deal documents, tasks, stages, and full timeline history
Make batch changes across multiple deals at once (update documents, create tasks, add notes, change stages)
Draft professional emails and SMS messages for borrowers and brokers
Suggest responses to unread emails linked to deals
Send and read in-app messages to borrowers and brokers on specific deals
Analyze deal health and detect portfolio-wide anomalies
Recommend next actions based on deal state
Answer questions about loan programs, eligibility criteria, fund criteria, and lending states`,
  rules: `When a user mentions a deal by name or description, ALWAYS use search_deals first to find the correct deal before taking action.
When asked about multiple deals or "my deals", use list_user_deals WITHOUT a status filter to get everything, then summarize.
For any communication drafts, ALWAYS save them for approval — never claim an email was sent.
When reporting batch results, always state how many succeeded and failed.
Be proactive: if you notice issues (overdue tasks, missing docs) while looking at a deal, mention them.
Reference deals by name and borrower, not just ID numbers.
Keep responses concise but thorough. Use markdown formatting for readability.
When sending in-app messages, use send_deal_message. When checking for messages, use get_deal_messages.
Always include the deal status in your summaries so the user knows the state of each deal.`,
};

const BROKER_DEFAULTS = {
  intro: `You are Lendry, an AI loan-program assistant for brokers working with Sphinx Capital.

Your job is to help brokers understand Sphinx Capital's loan programs, eligibility criteria, underwriting guidelines, and document requirements so they can pre-qualify deals before submitting them.

When you do not have enough information, respond with: "I don't have that detail in my knowledge base — please contact your loan officer at Sphinx Capital for the most accurate answer."`,
  capabilities: `Answer questions about active loan programs and their eligibility criteria
Explain underwriting guidelines and document requirements
Help brokers pre-qualify deals before formal submission
Explain which property types and states are eligible for each program
Describe indicative rate ranges (always directing brokers to run a formal quote for actual pricing)`,
  rules: `Only answer using the knowledge pack provided. If the answer is not in the knowledge pack, say so plainly and suggest the broker contact their loan officer.
NEVER reveal information about other brokers, other brokers' deals, internal pricing rates, internal margins, or specific lender/fund names. Talk about programs in generic Sphinx Capital terms.
NEVER quote a specific interest rate, point, or fee. You may share indicative ranges from the knowledge pack, but always direct the broker to the Quotes tab for actual pricing.
Keep responses concise and broker-friendly. Use bullet points when listing eligibility criteria.
If a question is unrelated to commercial lending, loan programs, or Sphinx Capital, politely redirect.`,
};

// ── Types ──────────────────────────────────────────────────────────────────────

type AgentKey = "lender" | "broker";

interface AgentDraft {
  enabled: boolean;
  intro: string;
  capabilities: string;
  rules: string;
}

interface SystemSetting {
  id: number;
  settingKey: string;
  settingValue: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function settingVal(settings: SystemSetting[], key: string): string | undefined {
  return settings.find((s) => s.settingKey === key)?.settingValue;
}

function buildDraft(settings: SystemSetting[], agent: AgentKey): AgentDraft {
  const defaults = agent === "lender" ? LENDER_DEFAULTS : BROKER_DEFAULTS;
  const enabled = settingVal(settings, `support_agent_${agent}_enabled`);
  return {
    enabled: enabled !== "false",
    intro: settingVal(settings, `support_agent_${agent}_intro`) ?? defaults.intro,
    capabilities: settingVal(settings, `support_agent_${agent}_capabilities`) ?? defaults.capabilities,
    rules: settingVal(settings, `support_agent_${agent}_rules`) ?? defaults.rules,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SupportAgentConfig() {
  const { toast } = useToast();
  const [activeAgent, setActiveAgent] = useState<AgentKey>("lender");
  const [drafts, setDrafts] = useState<Record<AgentKey, AgentDraft>>({
    lender: { enabled: true, ...LENDER_DEFAULTS },
    broker: { enabled: true, ...BROKER_DEFAULTS },
  });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery<{ settings: SystemSetting[] }>({
    queryKey: ["/api/admin/settings"],
  });

  useEffect(() => {
    if (data?.settings) {
      setDrafts({
        lender: buildDraft(data.settings, "lender"),
        broker: buildDraft(data.settings, "broker"),
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async ({ agent, draft }: { agent: AgentKey; draft: AgentDraft }) => {
      const entries: Array<{ key: string; value: string; description: string }> = [
        {
          key: `support_agent_${agent}_enabled`,
          value: draft.enabled ? "true" : "false",
          description: `Support agent enabled flag for ${agent} assistant`,
        },
        {
          key: `support_agent_${agent}_intro`,
          value: draft.intro,
          description: `Intro & personality prompt for ${agent} assistant`,
        },
        {
          key: `support_agent_${agent}_capabilities`,
          value: draft.capabilities,
          description: `Capabilities list for ${agent} assistant`,
        },
        {
          key: `support_agent_${agent}_rules`,
          value: draft.rules,
          description: `Behavior rules for ${agent} assistant`,
        },
      ];
      await Promise.all(
        entries
          .filter(({ value }) => value.trim().length > 0)
          .map(({ key, value, description }) =>
            apiRequest("PUT", `/api/admin/settings/${key}`, { value, description }),
          ),
      );
    },
    onSuccess: (_, { agent }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Saved",
        description: `${agent === "lender" ? "Lender" : "Broker"} assistant configuration saved.`,
      });
      setSaving(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save assistant configuration.",
        variant: "destructive",
      });
      setSaving(false);
    },
  });

  const handleSave = () => {
    setSaving(true);
    saveMutation.mutate({ agent: activeAgent, draft: drafts[activeAgent] });
  };

  const handleReset = () => {
    const defaults = activeAgent === "lender" ? LENDER_DEFAULTS : BROKER_DEFAULTS;
    setDrafts((prev) => ({
      ...prev,
      [activeAgent]: { ...prev[activeAgent], ...defaults },
    }));
    toast({ title: "Reset to defaults", description: "Fields restored. Click Save to apply." });
  };

  const updateField = (field: keyof AgentDraft, value: string | boolean) => {
    setDrafts((prev) => ({
      ...prev,
      [activeAgent]: { ...prev[activeAgent], [field]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  const draft = drafts[activeAgent];
  const agentLabel = activeAgent === "lender" ? "Lender Assistant" : "Broker Assistant";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Support Agent Configuration
          </CardTitle>
          <CardDescription>
            Control the personality, voice, capabilities, and behavior rules of each chat assistant.
            Changes are saved to the database and take effect on the next message — no restart needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-800 dark:text-blue-300">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Each assistant has three prompt sections you can customize. The <strong>Intro</strong> sets the
              agent's identity and voice. <strong>Capabilities</strong> tells it what it can do. <strong>Behavior
              Rules</strong> controls how it responds, what it refuses, and how it formats answers. Leaving a
              field blank restores the platform default for that section.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Agent toggle */}
      <div className="flex items-center gap-2" data-testid="agent-toggle">
        <button
          onClick={() => setActiveAgent("lender")}
          data-testid="tab-lender-assistant"
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            activeAgent === "lender"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          <Bot className="h-4 w-4" />
          Lender Assistant
        </button>
        <button
          onClick={() => setActiveAgent("broker")}
          data-testid="tab-broker-assistant"
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            activeAgent === "broker"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          <Users className="h-4 w-4" />
          Broker Assistant
        </button>
      </div>

      {/* Enabled toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {activeAgent === "lender" ? <Bot className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                {agentLabel}
                <Badge variant={draft.enabled ? "default" : "secondary"} className="text-xs ml-1" data-testid={`badge-agent-status-${activeAgent}`}>
                  {draft.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {activeAgent === "lender"
                  ? "Visible to lenders and admins in the pipeline sidebar."
                  : "Visible to brokers in the broker portal."}
              </CardDescription>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(val) => updateField("enabled", val)}
              data-testid={`switch-agent-enabled-${activeAgent}`}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Intro & Personality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Intro &amp; Personality</CardTitle>
          <CardDescription>
            The opening paragraph that defines who this assistant is, its name, tone, and primary purpose.
            Shape the voice here — professional, warm, direct, etc.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={draft.intro}
            onChange={(e) => updateField("intro", e.target.value)}
            className="min-h-[140px] font-mono text-sm"
            placeholder="You are..."
            data-testid={`textarea-intro-${activeAgent}`}
          />
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Capabilities</CardTitle>
          <CardDescription>
            One capability per line. These tell the assistant what it can do and help it understand
            what requests are in scope. Add or remove lines freely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={draft.capabilities}
            onChange={(e) => updateField("capabilities", e.target.value)}
            className="min-h-[160px] font-mono text-sm"
            placeholder="One capability per line..."
            data-testid={`textarea-capabilities-${activeAgent}`}
          />
        </CardContent>
      </Card>

      {/* Behavior Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Behavior Rules</CardTitle>
          <CardDescription>
            One rule per line. Use this to control tone, enforce restrictions, define what the assistant
            must never do, and specify formatting preferences. Be explicit — the assistant follows these literally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={draft.rules}
            onChange={(e) => updateField("rules", e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            placeholder="One rule per line..."
            data-testid={`textarea-rules-${activeAgent}`}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          data-testid={`button-reset-${activeAgent}`}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          data-testid={`button-save-${activeAgent}`}
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : `Save ${agentLabel}`}
        </Button>
      </div>
    </div>
  );
}
