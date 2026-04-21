import { useMemo } from "react";
import { useLocation } from "wouter";
import { useSearch } from "wouter/use-browser-location";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, ScrollText, Send, ListChecks, UserMinus } from "lucide-react";
import CommsChannelsPage from "./comms/channels";
import CommsTemplatesPage from "./comms/templates";
import CommsSendPage from "./comms/send";
import CommsSendLogPage from "./comms/log";
import CommsOptOutsPage from "./comms/opt-outs";

const TAB_VALUES = ["channels", "templates", "send", "log", "opt-outs"] as const;
type TabValue = typeof TAB_VALUES[number];

const DEFAULT_TAB: TabValue = "channels";

function parseTab(search: string): TabValue {
  const params = new URLSearchParams(search);
  const t = params.get("tab");
  return t && (TAB_VALUES as readonly string[]).includes(t)
    ? (t as TabValue)
    : DEFAULT_TAB;
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
          Configure communication channels, templates, and outbound messaging in one place.
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto">
          <TabsTrigger value="channels" data-testid="tab-channels" className="gap-2">
            <Radio className="w-4 h-4" />
            <span>Channels</span>
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates" className="gap-2">
            <ScrollText className="w-4 h-4" />
            <span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="send" data-testid="tab-send" className="gap-2">
            <Send className="w-4 h-4" />
            <span>Send Message</span>
          </TabsTrigger>
          <TabsTrigger value="log" data-testid="tab-log" className="gap-2">
            <ListChecks className="w-4 h-4" />
            <span>Send Log</span>
          </TabsTrigger>
          <TabsTrigger value="opt-outs" data-testid="tab-opt-outs" className="gap-2">
            <UserMinus className="w-4 h-4" />
            <span>Opt-Outs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-4">
          <CommsChannelsPage />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <CommsTemplatesPage />
        </TabsContent>
        <TabsContent value="send" className="mt-4">
          <CommsSendPage />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <CommsSendLogPage />
        </TabsContent>
        <TabsContent value="opt-outs" className="mt-4">
          <CommsOptOutsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
