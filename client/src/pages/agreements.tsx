import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Users, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Calendar,
  Send,
  RefreshCw,
  ClipboardList
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Signer {
  id: number;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'viewed' | 'signed';
  signedAt?: string;
  tokenExpiresAt?: string;
}

interface Agreement {
  id: number;
  name: string;
  quoteId: number;
  status: 'draft' | 'pending' | 'completed' | 'expired';
  createdAt: string;
  completedAt?: string;
  signers: Signer[];
}

export default function Agreements() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ success: boolean; documents: Agreement[] }>({
    queryKey: ['/api/documents']
  });

  const resendMutation = useMutation({
    mutationFn: async (documentId: number) => {
      return apiRequest('POST', `/api/documents/${documentId}/send`, {
        senderName: "Sphinx Capital"
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Email Resent", 
        description: "The signing request has been resent to all pending signers." 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to resend signing request", 
        variant: "destructive" 
      });
    }
  });

  const documents = data?.documents || [];
  const sentDocuments = documents.filter(d => d.status !== 'draft');

  const getStatusBadge = (status: string, docId: number) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" data-testid={`badge-status-${docId}`}>Draft</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200" data-testid={`badge-status-${docId}`}>Awaiting Signature</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 border-green-200" data-testid={`badge-status-${docId}`}>Signed</Badge>;
      case 'expired':
        return <Badge variant="destructive" data-testid={`badge-status-${docId}`}>Expired</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`badge-status-${docId}`}>{status}</Badge>;
    }
  };

  const getSignerStatusIcon = (status: string) => {
    switch (status) {
      case 'signed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'viewed':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'sent':
        return <Send className="w-4 h-4 text-amber-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getExpirationDate = (signer: Signer) => {
    if (signer.tokenExpiresAt) {
      return new Date(signer.tokenExpiresAt);
    }
    return null;
  };

  const isExpired = (signer: Signer) => {
    const expDate = getExpirationDate(signer);
    return expDate ? expDate < new Date() : false;
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-primary">Agreements</h1>
              <p className="text-sm text-slate-500">Track documents sent for signature</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : sentDocuments.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 mb-2">No Agreements Yet</h3>
              <p className="text-slate-400">
                When you send a quote for signature, it will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-700">
                All Agreements ({sentDocuments.length})
              </h2>
            </div>

            {sentDocuments.map((doc) => {
              const sentDate = new Date(doc.createdAt);
              const signers = doc.signers || [];
              const firstSigner = signers.length > 0 ? signers[0] : null;
              const expirationDate = firstSigner ? getExpirationDate(firstSigner) : null;
              const expired = firstSigner ? isExpired(firstSigner) : false;

              return (
                <Card key={doc.id} className="overflow-hidden" data-testid={`card-agreement-${doc.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          <h3 className="font-bold text-slate-800 truncate" data-testid={`text-agreement-name-${doc.id}`}>
                            {doc.name}
                          </h3>
                          {getStatusBadge(expired && doc.status === 'pending' ? 'expired' : doc.status, doc.id)}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-4">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            Sent: {sentDate.toLocaleDateString()}
                          </span>
                          {expirationDate && (
                            <span className={`flex items-center gap-1.5 ${expired ? 'text-red-500' : ''}`}>
                              <Clock className="w-4 h-4" />
                              {expired ? 'Expired' : 'Expires'}: {expirationDate.toLocaleDateString()}
                            </span>
                          )}
                          {doc.completedAt && (
                            <span className="flex items-center gap-1.5 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              Signed: {new Date(doc.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        {signers.length > 0 && (
                          <div className="border-t pt-4">
                            <p className="text-sm font-medium text-slate-600 mb-2 flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Signers
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {signers.map((signer) => (
                                <div
                                  key={signer.id}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-sm"
                                  data-testid={`signer-chip-${signer.id}`}
                                >
                                  {getSignerStatusIcon(signer.status)}
                                  <span className="font-medium">{signer.name}</span>
                                  <span className="text-slate-400">({signer.email})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {doc.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resendMutation.mutate(doc.id)}
                            disabled={resendMutation.isPending}
                            data-testid={`button-resend-${doc.id}`}
                          >
                            <RefreshCw className={`w-4 h-4 mr-2 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
                            Resend
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
