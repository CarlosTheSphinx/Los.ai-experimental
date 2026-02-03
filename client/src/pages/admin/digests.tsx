import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CalendarDays, 
  Mail, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ScheduledDigest {
  configId: number;
  projectId: number;
  projectName: string;
  borrowerName: string | null;
  frequency: string;
  timeOfDay: string;
  timezone: string;
  recipientCount: number;
  recipients: Array<{
    id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    deliveryMethod: string;
  }>;
  contentSettings: {
    includeDocumentsNeeded: boolean;
    includeNotes: boolean;
    includeMessages: boolean;
    includeGeneralUpdates: boolean;
  };
  sentDigests: Array<{
    id: number;
    recipientAddress: string;
    deliveryMethod: string;
    status: string;
    documentsCount: number;
    updatesCount: number;
    sentAt: string;
    errorMessage: string | null;
  }>;
}

interface DigestsResponse {
  date: string;
  digests: ScheduledDigest[];
}

export default function AdminDigests() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [detailDigest, setDetailDigest] = useState<ScheduledDigest | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data, isLoading, refetch } = useQuery<DigestsResponse>({
    queryKey: ["/api/admin/digests/scheduled", dateStr],
    queryFn: async () => {
      const response = await fetch(`/api/admin/digests/scheduled?date=${dateStr}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch digests');
      }
      return response.json();
    },
  });

  const digests = data?.digests || [];

  const sentCount = useMemo(() => {
    return digests.reduce((acc, d) => acc + d.sentDigests.length, 0);
  }, [digests]);

  const pendingCount = useMemo(() => {
    const now = new Date();
    return digests.filter(d => {
      const [hours, minutes] = d.timeOfDay.split(':').map(Number);
      const scheduledTime = new Date(selectedDate);
      scheduledTime.setHours(hours, minutes, 0, 0);
      return scheduledTime > now && d.sentDigests.length === 0;
    }).length;
  }, [digests, selectedDate]);

  const goToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1));
  const goToNextDay = () => setSelectedDate(prev => addDays(prev, 1));
  const goToToday = () => setSelectedDate(new Date());

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold" data-testid="text-admin-digests-title">Daily Digests</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          data-testid="button-refresh-digests"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Select Date</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                className="rounded-md border"
                data-testid="calendar-digest-date"
              />
              <div className="flex items-center justify-between mt-3 gap-2">
                <Button variant="outline" size="sm" onClick={goToPreviousDay} data-testid="button-prev-day">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-today">
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={goToNextDay} data-testid="button-next-day">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Summary for {format(selectedDate, "MMM d, yyyy")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Scheduled</span>
                <Badge variant="outline">{digests.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sent</span>
                <Badge variant="default">{sentCount}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pending</span>
                <Badge variant="secondary">{pendingCount}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Digests for {format(selectedDate, "EEEE, MMMM d, yyyy")}
            </CardTitle>
            <CardDescription>
              {digests.length === 0 
                ? "No digests scheduled for this day"
                : `${digests.length} digest${digests.length === 1 ? '' : 's'} scheduled`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : digests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No digests scheduled for this day</p>
                <p className="text-sm mt-2">Digests are configured on individual project pages</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {digests.map((digest) => {
                    const hasSent = digest.sentDigests.length > 0;
                    const allFailed = hasSent && digest.sentDigests.every(d => d.status === 'failed');
                    const [hours, minutes] = digest.timeOfDay.split(':').map(Number);
                    const scheduledTime = new Date(selectedDate);
                    scheduledTime.setHours(hours, minutes, 0, 0);
                    const isPending = scheduledTime > new Date() && !hasSent;

                    return (
                      <div
                        key={digest.configId}
                        className="border rounded-lg p-4 space-y-3 hover-elevate cursor-pointer"
                        onClick={() => setDetailDigest(digest)}
                        data-testid={`digest-card-${digest.configId}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">{digest.projectName}</h3>
                            {digest.borrowerName && (
                              <p className="text-sm text-muted-foreground truncate">
                                Borrower: {digest.borrowerName}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {hasSent ? (
                              allFailed ? (
                                <Badge variant="destructive">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Failed
                                </Badge>
                              ) : (
                                <Badge variant="default">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Sent
                                </Badge>
                              )
                            ) : isPending ? (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Not Sent
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {digest.timeOfDay} {digest.timezone.split('/')[1] || digest.timezone}
                          </div>
                          <div className="flex items-center gap-1">
                            {digest.recipients.some(r => r.deliveryMethod === 'email' || r.deliveryMethod === 'both') && (
                              <Mail className="h-4 w-4" />
                            )}
                            {digest.recipients.some(r => r.deliveryMethod === 'sms' || r.deliveryMethod === 'both') && (
                              <Phone className="h-4 w-4" />
                            )}
                            <span>{digest.recipientCount} recipient{digest.recipientCount === 1 ? '' : 's'}</span>
                          </div>
                        </div>

                        {hasSent && (
                          <div className="flex flex-wrap gap-2 pt-2 border-t">
                            {digest.sentDigests.map((sent, idx) => (
                              <Badge 
                                key={idx} 
                                variant={sent.status === 'sent' ? 'outline' : 'destructive'}
                                className="text-xs"
                              >
                                {sent.deliveryMethod === 'email' ? <Mail className="h-3 w-3 mr-1" /> : <Phone className="h-3 w-3 mr-1" />}
                                {sent.recipientAddress.length > 20 
                                  ? sent.recipientAddress.substring(0, 20) + '...' 
                                  : sent.recipientAddress
                                }
                                {sent.status === 'sent' ? (
                                  <CheckCircle2 className="h-3 w-3 ml-1" />
                                ) : (
                                  <XCircle className="h-3 w-3 ml-1" />
                                )}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailDigest} onOpenChange={() => setDetailDigest(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailDigest?.projectName}</DialogTitle>
            <DialogDescription>
              Digest details for {format(selectedDate, "MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>
          
          {detailDigest && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Schedule</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Time: {detailDigest.timeOfDay} ({detailDigest.timezone})</p>
                    <p>Frequency: {detailDigest.frequency.replace('_', ' ')}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Content Settings</h4>
                  <div className="flex flex-wrap gap-2">
                    {detailDigest.contentSettings.includeDocumentsNeeded && (
                      <Badge variant="outline">Documents Needed</Badge>
                    )}
                    {detailDigest.contentSettings.includeGeneralUpdates && (
                      <Badge variant="outline">General Updates</Badge>
                    )}
                    {detailDigest.contentSettings.includeNotes && (
                      <Badge variant="outline">Notes</Badge>
                    )}
                    {detailDigest.contentSettings.includeMessages && (
                      <Badge variant="outline">Messages</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Recipients ({detailDigest.recipients.length})</h4>
                <div className="border rounded-lg divide-y">
                  {detailDigest.recipients.map((recipient) => (
                    <div key={recipient.id} className="p-3 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{recipient.name || 'Unnamed recipient'}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {recipient.email || recipient.phone || 'No contact info'}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {recipient.deliveryMethod === 'both' ? (
                          <><Mail className="h-3 w-3 mr-1" /><Phone className="h-3 w-3" /></>
                        ) : recipient.deliveryMethod === 'email' ? (
                          <><Mail className="h-3 w-3 mr-1" />Email</>
                        ) : (
                          <><Phone className="h-3 w-3 mr-1" />SMS</>
                        )}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {detailDigest.sentDigests.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Delivery History</h4>
                  <div className="border rounded-lg divide-y">
                    {detailDigest.sentDigests.map((sent, idx) => (
                      <div key={idx} className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {sent.deliveryMethod === 'email' ? (
                              <Mail className="h-4 w-4" />
                            ) : (
                              <Phone className="h-4 w-4" />
                            )}
                            <span className="font-medium">{sent.recipientAddress}</span>
                          </div>
                          <Badge variant={sent.status === 'sent' ? 'default' : 'destructive'}>
                            {sent.status === 'sent' ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" />Sent</>
                            ) : (
                              <><XCircle className="h-3 w-3 mr-1" />Failed</>
                            )}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p>Sent at: {format(new Date(sent.sentAt), "h:mm a")}</p>
                          <p>Content: {sent.documentsCount} documents, {sent.updatesCount} updates</p>
                          {sent.errorMessage && (
                            <p className="text-destructive">Error: {sent.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
