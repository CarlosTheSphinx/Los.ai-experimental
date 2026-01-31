import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  FileText, 
  Users, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Download,
  ExternalLink,
  Calendar
} from "lucide-react";
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";

interface Signer {
  id: number;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'viewed' | 'signed';
  signedAt?: string;
}

interface SigningDocument {
  id: number;
  name: string;
  status: 'draft' | 'pending' | 'completed' | 'expired';
  createdAt: string;
  expiresAt?: string;
  signers: Signer[];
}

export default function Documents() {
  const { data, isLoading } = useQuery<{ success: boolean; documents: SigningDocument[] }>({
    queryKey: ['/api/documents']
  });

  const documents = data?.documents || [];

  const getStatusBadge = (status: string, docId: number) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" data-testid={`badge-status-${docId}`}>Draft</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700" data-testid={`badge-status-${docId}`}>Awaiting Signatures</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-700" data-testid={`badge-status-${docId}`}>Completed</Badge>;
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
        return <Clock className="w-4 h-4 text-amber-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <img src={sphinxLogo} alt="Sphinx Capital" className="h-10 w-auto" />
            <div>
              <h1 className="font-bold text-slate-800">Document Signing</h1>
              <p className="text-sm text-slate-500">Track all documents sent for signature</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/">
              <Button variant="outline" data-testid="link-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Home
              </Button>
            </Link>
            <Link href="/quotes">
              <Button variant="outline" data-testid="link-quotes">
                Quotes
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center py-16" data-testid="loading-documents">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-500">Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <Card className="text-center py-16" data-testid="empty-documents-state">
            <CardContent>
              <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-slate-700 mb-2">No Documents Yet</h2>
              <p className="text-slate-500 mb-6">
                Send a quote for signature to see it here.
              </p>
              <Link href="/quotes">
                <Button data-testid="button-view-quotes">View Quotes</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              All Documents ({documents.length})
            </h2>

            {documents.map((doc) => (
              <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 truncate" data-testid={`text-doc-name-${doc.id}`}>{doc.name}</h3>
                        {getStatusBadge(doc.status, doc.id)}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-500 mb-4 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Created: {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                        {doc.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Expires: {new Date(doc.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="border-t pt-4">
                        <p className="text-sm font-medium text-slate-600 mb-2 flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Signers ({doc.signers.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {doc.signers.map((signer) => (
                            <div
                              key={signer.id}
                              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-sm"
                              data-testid={`signer-chip-${signer.id}`}
                            >
                              {getSignerStatusIcon(signer.status)}
                              <span className="font-medium" data-testid={`text-signer-name-${signer.id}`}>{signer.name}</span>
                              <span className="text-slate-500" data-testid={`text-signer-email-${signer.id}`}>({signer.email})</span>
                              <span className="capitalize text-xs text-slate-400" data-testid={`text-signer-status-${signer.id}`}>{signer.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {doc.status === 'completed' && (
                        <a
                          href={`/api/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" data-testid={`button-download-${doc.id}`}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
