import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Video, 
  ExternalLink, 
  Loader2,
  BookOpen,
  Shield,
  CheckCircle2
} from 'lucide-react';

interface OnboardingDocument {
  id: number;
  type: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  externalUrl: string | null;
  thumbnailUrl: string | null;
  sortOrder: number;
  isRequired: boolean;
  progress: {
    id: number;
    status: string;
    signedAt: string | null;
    completedAt: string | null;
  } | null;
}

interface OnboardingStatus {
  user: {
    id: number;
    userType: string;
    onboardingCompleted: boolean;
    partnershipAgreementSignedAt: string | null;
    trainingCompletedAt: string | null;
  };
  documents: OnboardingDocument[];
  agreementSigned: boolean;
  trainingCompleted: boolean;
}

export default function ResourcesPage() {
  const { data: status, isLoading } = useQuery<OnboardingStatus>({
    queryKey: ['/api/onboarding/status'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Failed to load resources</p>
      </div>
    );
  }

  const partnershipAgreement = status.documents.find(d => d.type === 'partnership_agreement');
  const trainingDocs = status.documents.filter(d => d.type !== 'partnership_agreement' && d.type.startsWith('training'));
  const otherDocs = status.documents.filter(d => d.type !== 'partnership_agreement' && !d.type.startsWith('training'));

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'training_video':
        return <Video className="h-5 w-5" />;
      case 'training_link':
        return <ExternalLink className="h-5 w-5" />;
      case 'partnership_agreement':
        return <Shield className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const handleOpenDocument = (doc: OnboardingDocument) => {
    if (doc.externalUrl) {
      window.open(doc.externalUrl, '_blank');
    } else if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank');
    }
  };

  const DocumentCard = ({ doc }: { doc: OnboardingDocument }) => (
    <Card className="hover-elevate cursor-pointer" onClick={() => handleOpenDocument(doc)}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
          {getDocumentIcon(doc.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{doc.title}</p>
            {doc.progress?.status === 'completed' && (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          {doc.description && (
            <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="flex-shrink-0">
          <ExternalLink className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Resources</h1>
        <p className="text-muted-foreground">
          Access training materials, agreements, and helpful documents
        </p>
      </div>

      <Tabs defaultValue="training">
        <TabsList className="mb-6">
          <TabsTrigger value="training" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Training Materials
          </TabsTrigger>
          {partnershipAgreement && (
            <TabsTrigger value="agreement" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Partnership Agreement
            </TabsTrigger>
          )}
          {otherDocs.length > 0 && (
            <TabsTrigger value="other" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Other Documents
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="training">
          {trainingDocs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Training Materials</p>
                <p className="text-muted-foreground">Training materials will appear here when available.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {trainingDocs.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </TabsContent>

        {partnershipAgreement && (
          <TabsContent value="agreement">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      {partnershipAgreement.title}
                    </CardTitle>
                    {partnershipAgreement.description && (
                      <CardDescription>{partnershipAgreement.description}</CardDescription>
                    )}
                  </div>
                  {status.agreementSigned && (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Signed
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {status.agreementSigned && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg mb-4">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-300">Agreement Signed</p>
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Signed on {new Date(status.user.partnershipAgreementSignedAt!).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
                
                {(partnershipAgreement.fileUrl || partnershipAgreement.externalUrl) && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => handleOpenDocument(partnershipAgreement)}
                    data-testid="button-view-agreement"
                  >
                    <FileText className="h-4 w-4" />
                    View Partnership Agreement
                    <ExternalLink className="h-4 w-4 ml-auto" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {otherDocs.length > 0 && (
          <TabsContent value="other">
            <div className="space-y-4">
              {otherDocs.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} />
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
