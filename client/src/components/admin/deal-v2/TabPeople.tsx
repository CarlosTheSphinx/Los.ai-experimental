import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, ExternalLink, Copy, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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

export default function TabPeople({ deal }: { deal: any }) {
  const { toast } = useToast();

  const { data: teamData } = useQuery<{ teamMembers: { id: number; fullName: string; email: string; role: string }[] }>({
    queryKey: ["/api/admin/team-members"],
  });
  const teamMembers = teamData?.teamMembers ?? [];

  const borrowerName = deal.borrowerName || `${deal.customerFirstName || ""} ${deal.customerLastName || ""}`.trim();
  const borrowerEmail = deal.borrowerEmail || deal.customerEmail;
  const borrowerPhone = deal.borrowerPhone || deal.customerPhone;
  const borrowerPortalUrl = deal.borrowerPortalToken
    ? `${window.location.origin}/borrower-portal/${deal.borrowerPortalToken}`
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
        <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-borrower-section-title">
          Borrower
        </h3>
        <Card>
          <CardContent className="py-4 px-5">
            <div className="flex items-start gap-4">
              <div className={cn("w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-[14px] shrink-0", getAvatarColor(borrowerName, 0))} data-testid="avatar-borrower">
                {getInitials(borrowerName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[14px] font-semibold" data-testid="text-borrower-name">{borrowerName || "—"}</span>
                  <Badge variant="secondary" className="text-[10px]">Borrower</Badge>
                  {deal.borrowerPortalEnabled && (
                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Active</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  {borrowerEmail && (
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <a href={`mailto:${borrowerEmail}`} className="hover:underline" data-testid="link-borrower-email">{borrowerEmail}</a>
                    </div>
                  )}
                  {borrowerPhone && (
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <a href={`tel:${borrowerPhone}`} className="hover:underline" data-testid="link-borrower-phone">{borrowerPhone}</a>
                    </div>
                  )}
                </div>
                {borrowerPortalUrl && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-muted-foreground">Borrower Portal</span>
                    <a href={borrowerPortalUrl} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" data-testid="link-borrower-portal">
                        <ExternalLink className="h-3 w-3 mr-1" /> Open
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
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
          <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-broker-section-title">
            Broker
          </h3>
          <Card>
            <CardContent className="py-4 px-5">
              <div className="flex items-start gap-4">
                <div className={cn("w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-[14px] shrink-0", getAvatarColor(deal.brokerName, 1))} data-testid="avatar-broker">
                  {getInitials(deal.brokerName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-semibold" data-testid="text-broker-name">{deal.brokerName}</span>
                    <Badge variant="secondary" className="text-[10px]">Broker</Badge>
                  </div>
                  <div className="space-y-1">
                    {deal.brokerEmail && (
                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <a href={`mailto:${deal.brokerEmail}`} className="hover:underline" data-testid="link-broker-email">{deal.brokerEmail}</a>
                      </div>
                    )}
                    {deal.brokerPhone && (
                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
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
        <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3" data-testid="text-team-section-title">
          Team ({teamMembers.length})
        </h3>
        <Card>
          <CardContent className="py-3 px-5">
            {teamMembers.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-2">No team members found.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {teamMembers.map((member, idx) => (
                  <div key={member.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1" data-testid={`team-member-${member.id}`}>
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-[12px] shrink-0", getAvatarColor(member.fullName, idx + 2))}>
                      {getInitials(member.fullName || member.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium truncate">{member.fullName || member.email}</span>
                        <Badge variant="secondary" className="text-[10px] capitalize">{member.role}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
                      <span className="text-[11px] text-muted-foreground">Broker Portal</span>
                      <a href={brokerPortalUrl} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" data-testid="link-broker-portal">
                          <ExternalLink className="h-3 w-3 mr-1" /> Open
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
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
