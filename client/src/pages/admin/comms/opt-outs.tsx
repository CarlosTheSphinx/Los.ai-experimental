import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ShieldOff } from "lucide-react";

interface OptOut {
  id: number;
  contactValue: string;
  channel: string;
  source: string;
  optedOutAt: string;
  recipientId: number | null;
}

function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, string> = {
    email: "bg-blue-100 text-blue-800",
    sms: "bg-green-100 text-green-800",
    in_app: "bg-purple-100 text-purple-800",
  };
  const labels: Record<string, string> = { email: "Email", sms: "SMS", in_app: "In-App" };
  return <Badge className={map[channel] || ""}>{labels[channel] || channel}</Badge>;
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, string> = {
    stop_keyword: "STOP Keyword",
    unsubscribe_link: "Unsubscribe Link",
    in_app: "In-App",
    manual: "Manual",
    admin: "Admin",
  };
  return <Badge variant="outline" className="text-xs">{labels[source] || source}</Badge>;
}

export default function CommsOptOutsPage() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [removingEntry, setRemovingEntry] = useState<OptOut | null>(null);
  const [newContact, setNewContact] = useState("");
  const [newChannel, setNewChannel] = useState("email");

  const { data: optOuts = [], isLoading } = useQuery<OptOut[]>({
    queryKey: ["/api/comms/opt-outs"],
  });

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/comms/opt-outs", {
      contactValue: newContact,
      channel: newChannel,
      source: "admin",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/opt-outs"] });
      setShowAdd(false);
      setNewContact("");
      toast({ title: "Suppression added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (entry: OptOut) => apiRequest("DELETE", "/api/comms/opt-outs", {
      contactValue: entry.contactValue,
      channel: entry.channel,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/opt-outs"] });
      setRemovingEntry(null);
      toast({ title: "Suppression removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Opt-Out Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage suppression list. Opted-out recipients will never receive messages on that channel.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="button-add-opt-out">
          <Plus className="h-4 w-4 mr-2" />
          Add Suppression
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading suppressions...</p>
      ) : optOuts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldOff className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No suppressions on record. All recipients are opted in.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {optOuts.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between px-4 py-3"
                data-testid={`opt-out-row-${entry.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelBadge channel={entry.channel} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`opt-out-contact-${entry.id}`}>
                      {entry.contactValue}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <SourceBadge source={entry.source} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.optedOutAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemovingEntry(entry)}
                  data-testid={`button-remove-opt-out-${entry.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Suppression</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opt-out-channel">Channel</Label>
              <Select value={newChannel} onValueChange={v => { setNewChannel(v); setNewContact(""); }}>
                <SelectTrigger id="opt-out-channel" data-testid="select-opt-out-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="in_app">In-App</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-value">
                {newChannel === "in_app" ? "User ID" : newChannel === "sms" ? "Phone Number" : "Email Address"}
              </Label>
              <Input
                id="contact-value"
                data-testid="input-contact-value"
                value={newContact}
                onChange={e => setNewContact(e.target.value)}
                placeholder={
                  newChannel === "in_app" ? "user:123 (enter user:<id>)" :
                  newChannel === "sms" ? "+15551234567" :
                  "email@example.com"
                }
              />
              {newChannel === "in_app" && (
                <p className="text-xs text-muted-foreground">
                  Enter the recipient's user ID in the format <code className="font-mono bg-muted px-1 rounded">user:&lt;id&gt;</code>.
                  In-app suppressions block notification delivery for that user.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} data-testid="button-cancel">Cancel</Button>
            <Button
              disabled={!newContact || addMutation.isPending}
              onClick={() => addMutation.mutate()}
              data-testid="button-add-suppression"
            >
              {addMutation.isPending ? "Adding..." : "Add Suppression"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removingEntry} onOpenChange={v => !v && setRemovingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <strong>{removingEntry?.contactValue}</strong> from the {removingEntry?.channel} suppression list?
            They will be able to receive messages again on this channel.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingEntry(null)} data-testid="button-cancel-remove">Cancel</Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => removingEntry && removeMutation.mutate(removingEntry)}
              data-testid="button-confirm-remove"
            >
              Remove Suppression
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
