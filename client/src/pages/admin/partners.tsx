import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Plus,
  Mail,
  Phone,
  Building2,
  Users,
  Loader2,
  Send,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Inbox,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/use-branding";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface Partner {
  id: number;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  entityType: string | null;
  experienceLevel: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  loansInProcess: number;
  allTimeLoans: number;
}

interface PartnersResponse {
  partners: Partner[];
}

function getExperienceBadgeVariant(level: string | null): "default" | "secondary" | "outline" {
  switch (level) {
    case "experienced":
      return "default";
    case "intermediate":
      return "secondary";
    case "beginner":
    default:
      return "outline";
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface Broadcast {
  id: number;
  subject: string;
  emailBody: string;
  smsBody: string | null;
  sendEmail: boolean;
  sendSms: boolean;
  recipientCount: number;
  emailsSent: number;
  smsSent: number;
  emailsFailed: number;
  smsFailed: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface InboundMessage {
  message: {
    id: number;
    fromPhone: string;
    toPhone: string;
    body: string;
    isRead: boolean;
    createdAt: string;
    partnerId: number | null;
  };
  partner: {
    id: number;
    name: string;
    companyName: string | null;
  } | null;
}

function getEntityIcon(entityType: string | null) {
  switch (entityType?.toLowerCase()) {
    case "llc":
    case "corporation":
    case "partnership":
      return <Building2 className="h-4 w-4 mr-1.5" />;
    case "individual":
      return <Users className="h-4 w-4 mr-1.5" />;
    default:
      return <Building2 className="h-4 w-4 mr-1.5" />;
  }
}

export default function AdminPartners() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBroadcastDialogOpen, setIsBroadcastDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("partners");
  const { toast } = useToast();
  const { branding } = useBranding();
  
  const [newPartner, setNewPartner] = useState({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    entityType: "",
    experienceLevel: "beginner",
    notes: "",
  });

  const [broadcastForm, setBroadcastForm] = useState({
    subject: "",
    emailBody: "",
    smsBody: "",
    sendEmail: true,
    sendSms: false,
  });

  const { data, isLoading } = useQuery<PartnersResponse>({
    queryKey: ["/api/admin/partners", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      const res = await fetch(`/api/admin/partners?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch partners");
      return res.json();
    },
  });

  const createPartnerMutation = useMutation({
    mutationFn: async (partnerData: typeof newPartner) => {
      return apiRequest("POST", "/api/admin/partners", partnerData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
      setIsAddDialogOpen(false);
      setNewPartner({
        name: "",
        companyName: "",
        email: "",
        phone: "",
        entityType: "",
        experienceLevel: "beginner",
        notes: "",
      });
      toast({
        title: "Partner added",
        description: "The partner has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add partner. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Broadcast queries and mutations
  const { data: broadcastsData } = useQuery<{ broadcasts: Broadcast[] }>({
    queryKey: ["/api/admin/broadcasts"],
    enabled: activeTab === "history",
  });

  const { data: inboxData, refetch: refetchInbox } = useQuery<{ messages: InboundMessage[] }>({
    queryKey: ["/api/admin/sms-inbox"],
    enabled: activeTab === "inbox",
  });

  const { data: unreadCountData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/admin/sms-inbox/unread-count"],
  });

  const sendBroadcastMutation = useMutation({
    mutationFn: async (data: typeof broadcastForm) => {
      return apiRequest("POST", "/api/admin/broadcasts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
      setIsBroadcastDialogOpen(false);
      setBroadcastForm({
        subject: "",
        emailBody: "",
        smsBody: "",
        sendEmail: true,
        sendSms: false,
      });
      toast({
        title: "Broadcast sent",
        description: "Your message is being sent to all partners.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send broadcast. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      return apiRequest("POST", `/api/admin/sms-inbox/${messageId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sms-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sms-inbox/unread-count"] });
    },
  });

  const handleSendBroadcast = () => {
    if (!broadcastForm.subject) {
      toast({
        title: "Missing subject",
        description: "Please enter a subject for your broadcast.",
        variant: "destructive",
      });
      return;
    }
    if (broadcastForm.sendEmail && !broadcastForm.emailBody) {
      toast({
        title: "Missing email body",
        description: "Please enter an email message or disable email sending.",
        variant: "destructive",
      });
      return;
    }
    if (broadcastForm.sendSms && !broadcastForm.smsBody) {
      toast({
        title: "Missing SMS body",
        description: "Please enter an SMS message or disable SMS sending.",
        variant: "destructive",
      });
      return;
    }
    if (!broadcastForm.sendEmail && !broadcastForm.sendSms) {
      toast({
        title: "No delivery method",
        description: "Please select at least email or SMS to send the broadcast.",
        variant: "destructive",
      });
      return;
    }
    sendBroadcastMutation.mutate(broadcastForm);
  };

  const handleCreatePartner = () => {
    if (!newPartner.name) {
      toast({
        title: "Missing fields",
        description: "Please enter a partner name.",
        variant: "destructive",
      });
      return;
    }
    createPartnerMutation.mutate(newPartner);
  };

  const partners = data?.partners || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4">
        <div className="flex flex-col gap-1 md:gap-2 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate" data-testid="text-page-title">Partners</h1>
          <p className="text-sm md:text-base text-muted-foreground hidden sm:block">Manage partner relationships</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={isBroadcastDialogOpen} onOpenChange={setIsBroadcastDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-broadcast">
                <Send className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Broadcast</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] md:w-full">
              <DialogHeader>
                <DialogTitle>Broadcast to All Partners</DialogTitle>
                <DialogDescription>
                  Send a personalized email and/or SMS to all active partners. Use placeholders for personalization.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="bg-muted/50 p-3 rounded-md text-sm">
                  <p className="font-medium mb-1">Available placeholders:</p>
                  <code className="text-xs">{"{{firstName}}"}</code>, <code className="text-xs">{"{{lastName}}"}</code>, <code className="text-xs">{"{{name}}"}</code>, <code className="text-xs">{"{{companyName}}"}</code>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="broadcast-subject">Subject *</Label>
                  <Input
                    id="broadcast-subject"
                    value={broadcastForm.subject}
                    onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
                    placeholder={`Important Update from ${branding.companyName}`}
                    data-testid="input-broadcast-subject"
                  />
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="send-email"
                      checked={broadcastForm.sendEmail}
                      onCheckedChange={(checked) => setBroadcastForm({ ...broadcastForm, sendEmail: !!checked })}
                    />
                    <Label htmlFor="send-email" className="flex items-center gap-1">
                      <Mail className="h-4 w-4" /> Send Email
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="send-sms"
                      checked={broadcastForm.sendSms}
                      onCheckedChange={(checked) => setBroadcastForm({ ...broadcastForm, sendSms: !!checked })}
                    />
                    <Label htmlFor="send-sms" className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" /> Send SMS
                    </Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broadcast-email">Email Body *</Label>
                  <Textarea
                    id="broadcast-email"
                    value={broadcastForm.emailBody}
                    onChange={(e) => setBroadcastForm({ ...broadcastForm, emailBody: e.target.value })}
                    placeholder={`Dear {{firstName}},\n\nWe wanted to share an important update with you...\n\nBest regards,\n${branding.companyName} Team`}
                    rows={8}
                    data-testid="input-broadcast-email"
                  />
                </div>

                {broadcastForm.sendSms && (
                  <div className="space-y-2">
                    <Label htmlFor="broadcast-sms">SMS Message * (160 chars recommended)</Label>
                    <Textarea
                      id="broadcast-sms"
                      value={broadcastForm.smsBody}
                      onChange={(e) => setBroadcastForm({ ...broadcastForm, smsBody: e.target.value })}
                      placeholder={`Hi {{firstName}}, important update from ${branding.companyName}. Check your email for details!`}
                      rows={3}
                      data-testid="input-broadcast-sms"
                    />
                    <p className="text-xs text-muted-foreground">
                      {broadcastForm.smsBody.length}/160 characters
                    </p>
                  </div>
                )}

                <div className="bg-warning/10 border border-warning p-3 rounded-md text-sm text-warning">
                  <strong>Note:</strong> This will send to all {partners.length} active partners. Messages will be sent in the background.
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsBroadcastDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendBroadcast} 
                  disabled={sendBroadcastMutation.isPending}
                  data-testid="button-send-broadcast"
                >
                  {sendBroadcastMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Broadcast
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-partner">
                <Plus className="h-4 w-4 mr-2" />
                Add Partner
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Partner</DialogTitle>
              <DialogDescription>
                Add a new referral partner to your network
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partnerName">Name *</Label>
                  <Input
                    id="partnerName"
                    value={newPartner.name}
                    onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                    placeholder="John Smith"
                    data-testid="input-partner-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company</Label>
                  <Input
                    id="companyName"
                    value={newPartner.companyName}
                    onChange={(e) => setNewPartner({ ...newPartner, companyName: e.target.value })}
                    placeholder="Smith Investments LLC"
                    data-testid="input-company-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newPartner.email}
                    onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                    placeholder="john@example.com"
                    data-testid="input-partner-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={newPartner.phone}
                    onChange={(e) => setNewPartner({ ...newPartner, phone: e.target.value })}
                    placeholder="(310) 555-1234"
                    data-testid="input-partner-phone"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entityType">Entity Type</Label>
                  <Select
                    value={newPartner.entityType}
                    onValueChange={(value) => setNewPartner({ ...newPartner, entityType: value })}
                  >
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LLC">LLC</SelectItem>
                      <SelectItem value="Corporation">Corporation</SelectItem>
                      <SelectItem value="Partnership">Partnership</SelectItem>
                      <SelectItem value="Individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experienceLevel">Experience Level</Label>
                  <Select
                    value={newPartner.experienceLevel}
                    onValueChange={(value) => setNewPartner({ ...newPartner, experienceLevel: value })}
                  >
                    <SelectTrigger data-testid="select-experience-level">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="experienced">Experienced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={newPartner.notes}
                  onChange={(e) => setNewPartner({ ...newPartner, notes: e.target.value })}
                  placeholder="Additional notes about this partner..."
                  data-testid="input-partner-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel-partner">
                Cancel
              </Button>
              <Button
                onClick={handleCreatePartner}
                disabled={createPartnerMutation.isPending}
                data-testid="button-save-partner"
              >
                {createPartnerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Partner"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 md:pb-4 p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search partners..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-partners"
              />
            </div>
            <span className="text-xs md:text-sm text-muted-foreground shrink-0">
              {partners.length} partner{partners.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          {partners.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No partners yet</h3>
              <p className="text-muted-foreground mb-4">Add your first partner to start tracking referrals</p>
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-partner">
                <Plus className="h-4 w-4 mr-2" />
                Add Partner
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="md:hidden space-y-3">
                {partners.map((partner) => (
                  <div key={partner.id} className="border rounded-lg p-3" data-testid={`card-partner-${partner.id}`}>
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                          {getInitials(partner.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" data-testid={`text-partner-name-${partner.id}`}>
                          {partner.name}
                        </div>
                        {partner.companyName && (
                          <div className="text-sm text-muted-foreground truncate">{partner.companyName}</div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant={getExperienceBadgeVariant(partner.experienceLevel)} className="text-xs">
                            {partner.experienceLevel || "beginner"}
                          </Badge>
                          {partner.loansInProcess > 0 && (
                            <Badge variant="outline" className="text-xs">{partner.loansInProcess} active</Badge>
                          )}
                        </div>
                        {(partner.email || partner.phone) && (
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {partner.email && (
                              <div className="flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{partner.email}</span>
                              </div>
                            )}
                            {partner.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />
                                <span>{partner.phone}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table view */}
              <div className="overflow-x-auto hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Name</TableHead>
                      <TableHead className="min-w-[180px]">Contact</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Experience</TableHead>
                      <TableHead className="text-center">In Process</TableHead>
                      <TableHead className="text-center">All-Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((partner) => (
                      <TableRow key={partner.id} data-testid={`row-partner-${partner.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                                {getInitials(partner.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium" data-testid={`text-partner-name-desktop-${partner.id}`}>
                                {partner.name}
                              </div>
                              {partner.companyName && (
                                <div className="text-sm text-muted-foreground">
                                  {partner.companyName}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {partner.email && (
                              <div className="flex items-center text-sm">
                                <Mail className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                <span>{partner.email}</span>
                              </div>
                            )}
                            {partner.phone && (
                              <div className="flex items-center text-sm text-muted-foreground">
                                <Phone className="h-3.5 w-3.5 mr-1.5" />
                                <span>{partner.phone}</span>
                              </div>
                            )}
                            {!partner.email && !partner.phone && (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {partner.entityType ? (
                            <div className="flex items-center text-sm">
                              {getEntityIcon(partner.entityType)}
                              <span>{partner.entityType}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getExperienceBadgeVariant(partner.experienceLevel)}>
                            {partner.experienceLevel || "beginner"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={partner.loansInProcess > 0 ? "text-primary font-medium" : "text-muted-foreground"}>
                            {partner.loansInProcess}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {partner.allTimeLoans}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="partners" data-testid="tab-partners">Partners</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-broadcast-history">Broadcast History</TabsTrigger>
          <TabsTrigger value="inbox" className="relative" data-testid="tab-sms-inbox">
            SMS Inbox
            {(unreadCountData?.unreadCount || 0) > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1.5">
                {unreadCountData?.unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="mt-4">
          <p className="text-sm text-muted-foreground">Partner list is displayed above.</p>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Broadcast History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!broadcastsData?.broadcasts?.length ? (
                <div className="text-center py-8">
                  <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No broadcasts yet</h3>
                  <p className="text-muted-foreground">Send your first broadcast to all partners</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {broadcastsData.broadcasts.map((broadcast) => (
                    <Card key={broadcast.id} className="hover-elevate">
                      <CardContent className="pt-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-medium">{broadcast.subject}</h3>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {broadcast.emailBody.substring(0, 150)}...
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <Badge variant={broadcast.status === 'completed' ? 'default' : broadcast.status === 'sending' ? 'secondary' : 'outline'}>
                              {broadcast.status}
                            </Badge>
                            <p className="text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(broadcast.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 mt-3 text-sm">
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {broadcast.recipientCount} recipients
                          </span>
                          {broadcast.sendEmail && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4 text-success" />
                              {broadcast.emailsSent} emails sent
                              {broadcast.emailsFailed > 0 && (
                                <span className="text-destructive">
                                  ({broadcast.emailsFailed} failed)
                                </span>
                              )}
                            </span>
                          )}
                          {broadcast.sendSms && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-4 w-4" />
                              {broadcast.smsSent} SMS sent
                              {broadcast.smsFailed > 0 && (
                                <span className="text-destructive">
                                  ({broadcast.smsFailed} failed)
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inbox" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                SMS Replies from Partners
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!inboxData?.messages?.length ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No SMS replies yet</h3>
                  <p className="text-muted-foreground">Partner SMS replies will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inboxData.messages.map(({ message, partner }) => (
                    <Card 
                      key={message.id} 
                      className={`hover-elevate cursor-pointer ${!message.isRead ? 'border-primary/50 bg-primary/5' : ''}`}
                      onClick={() => {
                        if (!message.isRead) {
                          markReadMutation.mutate(message.id);
                        }
                      }}
                    >
                      <CardContent className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>
                                {partner ? getInitials(partner.name) : '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {partner ? partner.name : 'Unknown'}
                                {partner?.companyName && (
                                  <span className="text-muted-foreground font-normal ml-1">
                                    ({partner.companyName})
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">{message.fromPhone}</p>
                            </div>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                            {!message.isRead && (
                              <Badge variant="default" className="ml-2">New</Badge>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 text-sm">{message.body}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
