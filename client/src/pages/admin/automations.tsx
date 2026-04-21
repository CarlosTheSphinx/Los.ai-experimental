import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, ScrollText, Users, SendHorizontal, ListChecks, UserMinus, Workflow } from "lucide-react";
import CommsChannelsPage from "./comms/channels";
import CommsTemplatesPage from "./comms/templates";
import CommsSegmentsPage from "./comms/segments";
import CommsBatchSendPage from "./comms/batch-send";
import CommsSendLogPage from "./comms/log";
import CommsOptOutsPage from "./comms/opt-outs";
import CommsAutomationsPage from "./comms/automations";

const TAB_VALUES = ["setup", "templates", "segments", "automations", "batch-send", "log", "opt-outs"] as const;
type TabValue = typeof TAB_VALUES[number];

const DEFAULT_TAB: TabValue = "setup";

// Legacy alias support: ?tab=channels still resolves to setup; ?tab=send → batch-send
function parseTab(search: string): TabValue {
  const params = new URLSearchParams(search);
  const t = params.get("tab");
  if (t === "channels") return "setup";
  if (t === "send") return "batch-send";
  return t && (TAB_VALUES as readonly string[]).includes(t) ? (t as TabValue) : DEFAULT_TAB;
}

export default function AutomationsPage() {
  const [pathname, setLocation] = useLocation();
  const search = useSearch();

  const tab = useMemo(() => parseTab(search), [search]);

  const handleTabChange = (value: string) => {
    const next = (TAB_VALUES as readonly string[]).includes(value)
      ? (value as TabValue)
      : DEFAULT_TAB;
    const params = new URLSearchParams(search);
    params.set("tab", next);
    setLocation(`${pathname}?${params.toString()}`, { replace: true });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="page-automations">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set up channels, build templates, define audience segments, and dispatch messages — all in one place.
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto">
          <TabsTrigger value="setup" data-testid="tab-setup" className="gap-2">
            <Settings className="w-4 h-4" /><span>Setup</span>
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates" className="gap-2">
            <ScrollText className="w-4 h-4" /><span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="segments" data-testid="tab-segments" className="gap-2">
            <Users className="w-4 h-4" /><span>Segments</span>
          </TabsTrigger>
          <TabsTrigger value="automations" data-testid="tab-automations" className="gap-2">
            <Workflow className="w-4 h-4" /><span>Automations</span>
          </TabsTrigger>
          <TabsTrigger value="batch-send" data-testid="tab-batch-send" className="gap-2">
            <SendHorizontal className="w-4 h-4" /><span>Batch Send</span>
          </TabsTrigger>
          <TabsTrigger value="log" data-testid="tab-log" className="gap-2">
            <ListChecks className="w-4 h-4" /><span>Send Log</span>
          </TabsTrigger>
          <TabsTrigger value="opt-outs" data-testid="tab-opt-outs" className="gap-2">
            <UserMinus className="w-4 h-4" /><span>Opt-Outs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-4"><CommsChannelsPage /></TabsContent>
        <TabsContent value="templates" className="mt-4"><CommsTemplatesPage /></TabsContent>
        <TabsContent value="segments" className="mt-4"><CommsSegmentsPage /></TabsContent>
        <TabsContent value="automations" className="mt-4"><CommsAutomationsPage /></TabsContent>
        <TabsContent value="batch-send" className="mt-4"><CommsBatchSendPage /></TabsContent>
        <TabsContent value="log" className="mt-4"><CommsSendLogPage /></TabsContent>
        <TabsContent value="opt-outs" className="mt-4"><CommsOptOutsPage /></TabsContent>
      </Tabs>
    </div>
  );
}
