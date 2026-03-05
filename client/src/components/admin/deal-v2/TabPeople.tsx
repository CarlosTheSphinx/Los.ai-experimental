import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mail, Phone, ExternalLink, Copy, Globe, Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-pink-500",
];

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

function getAvatarColor(name: string, index: number) {
  if (!name) return AVATAR_COLORS[index % AVATAR_COLORS.length];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface ThirdParty {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  company?: string;
  notes?: string;
}

const THIRD_PARTY_ROLES = [
  "Title Contact",
  "Attorney",
  "Appraiser",
  "Insurance Agent",
  "Escrow Officer",
  "Contractor",
  "Property Manager",
  "CPA / Accountant",
  "Other",
];

const emptyForm = { name: "", email: "", phone: "", role: "", company: "", notes: "" };

export default function TabPeople({ deal }: { deal: any }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const dealId = deal.projectId || deal.id;

  const { data: teamData } = useQuery<{ teamMembers: { id: number; fullName: string; email: string; role: string }[] }>({
    queryKey: ["/api/admin/team-members"],
  });
  const teamMembers = teamData?.teamMembers ?? [];

  const { data: thirdPartiesData } = useQuery<ThirdParty[]>({
    queryKey: ["/api/admin/deals", dealId, "third-parties"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/${dealId}/third-parties`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.contacts || data.thirdParties || [];
    },
  });
  const thirdParties = thirdPartiesData ?? [];

  const addMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await apiRequest("POST", `/api/admin/deals/${dealId}/third-parties`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "third-parties"] });
      toast({ title: "Contact added" });
      setShowForm(false);
      setForm(emptyForm);
    },
    onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const res = await apiRequest("PATCH", `/api/admin/deals/${dealId}/third-parties/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "third-parties"] });
      toast({ title: "Contact updated" });
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: () => toast({ title: "Failed to update contact", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/deals/${dealId}/third-parties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "third-parties"] });
      toast({ title: "Contact removed" });
    },
    onError: () => toast({ title: "Failed to remove contact", variant: "destructive" }),
  });

  const startEdit = (tp: ThirdParty) => {
    setEditingId(tp.id);
    setForm({ name: tp.name, email: tp.email || "", phone: tp.phone || "", role: tp.role, company: tp.company || "", notes: tp.notes || "" });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.role) {
      toast({ title: "Name and role are required", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      addMutation.mutate(form);
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const borrowerName = deal.borrowerName || `${deal.customerFirstName || ""} ${deal.customerLastName || ""}`.trim();
  const borrowerEmail = deal.borrowerEmail || deal.customerEmail;
  const borrowerPhone = deal.borrowerPhone || deal.customerPhone;
  const borrowerPortalUrl = deal.borrowerPortalToken
    ? `${window.location.origin}/portal/${deal.borrowerPortalToken}`
    : null;
  const brokerPortalUrl = deal.brokerPortalToken
    ? `${window.location.origin}/broker-portal/${deal.brokerPortalToken}`
    : null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-borrower-section-title">
          Borrower
        </h3>
        <Card>
          <CardContent className="py-4 px-5">
            <div className="flex items-start gap-4">
              <div className={cn("w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-[17px] shrink-0", getAvatarColor(borrowerName, 0))} data-testid="avatar-borrower">
                {getInitials(borrowerName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[17px] font-semibold" data-testid="text-borrower-name">{borrowerName || "—"}</span>
                  <Badge variant="secondary" className="text-[12px]">Borrower</Badge>
                  {deal.borrowerPortalEnabled && (
                    <Badge className="text-[12px] bg-emerald-100 text-emerald-700 border-0">Active</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  {borrowerEmail && (
                    <div className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <a href={`mailto:${borrowerEmail}`} className="hover:underline" data-testid="link-borrower-email">{borrowerEmail}</a>
                    </div>
                  )}
                  {borrowerPhone && (
                    <div className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <a href={`tel:${borrowerPhone}`} className="hover:underline" data-testid="link-borrower-phone">{borrowerPhone}</a>
                    </div>
                  )}
                </div>
                {borrowerPortalUrl && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[13px] text-muted-foreground">Borrower Portal</span>
                    <a href={borrowerPortalUrl} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[13px]" data-testid="link-borrower-portal">
                        <ExternalLink className="h-3 w-3 mr-1" /> Open
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[13px]"
                      onClick={() => copyToClipboard(borrowerPortalUrl, "Borrower portal link")}
                      data-testid="button-copy-borrower-portal"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy Link
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {deal.brokerName && (
        <div>
          <h3 className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-broker-section-title">
            Broker
          </h3>
          <Card>
            <CardContent className="py-4 px-5">
              <div className="flex items-start gap-4">
                <div className={cn("w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-[17px] shrink-0", getAvatarColor(deal.brokerName, 1))} data-testid="avatar-broker">
                  {getInitials(deal.brokerName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[17px] font-semibold" data-testid="text-broker-name">{deal.brokerName}</span>
                    <Badge variant="secondary" className="text-[12px]">Broker</Badge>
                  </div>
                  <div className="space-y-1">
                    {deal.brokerEmail && (
                      <div className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <a href={`mailto:${deal.brokerEmail}`} className="hover:underline" data-testid="link-broker-email">{deal.brokerEmail}</a>
                      </div>
                    )}
                    {deal.brokerPhone && (
                      <div className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <a href={`tel:${deal.brokerPhone}`} className="hover:underline" data-testid="link-broker-phone">{deal.brokerPhone}</a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h3 className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-team-section-title">
          Team ({teamMembers.length})
        </h3>
        <Card>
          <CardContent className="py-3 px-5">
            {teamMembers.length === 0 ? (
              <p className="text-[16px] text-muted-foreground py-2">No team members found.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {teamMembers.map((member, idx) => (
                  <div key={member.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1" data-testid={`team-member-${member.id}`}>
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-[14px] shrink-0", getAvatarColor(member.fullName, idx + 2))}>
                      {getInitials(member.fullName || member.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[16px] font-medium truncate">{member.fullName || member.email}</span>
                        <Badge variant="secondary" className="text-[12px] capitalize">{member.role}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <Mail className="h-2.5 w-2.5" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {brokerPortalUrl && (
                  <div className="pt-3 pb-1">
                    <div className="flex items-center gap-2">
                      <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[13px] text-muted-foreground">Broker Portal</span>
                      <a href={brokerPortalUrl} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[13px]" data-testid="link-broker-portal">
                          <ExternalLink className="h-3 w-3 mr-1" /> Open
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[13px]"
                        onClick={() => copyToClipboard(brokerPortalUrl, "Broker portal link")}
                        data-testid="button-copy-broker-portal"
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy Link
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
