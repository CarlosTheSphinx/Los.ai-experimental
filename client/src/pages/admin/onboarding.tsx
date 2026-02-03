import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  FileText, 
  Video, 
  ExternalLink, 
  Shield, 
  Users, 
  Loader2,
  CheckCircle2,
  Clock,
  BookOpen
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
  isActive: boolean;
  targetUserType: string;
  createdAt: string;
}

interface OnboardingUser {
  id: number;
  email: string;
  fullName: string | null;
  userType: string;
  onboardingCompleted: boolean;
  partnershipAgreementSignedAt: string | null;
  trainingCompletedAt: string | null;
  createdAt: string;
}

const documentTypeLabels: Record<string, { label: string; icon: typeof FileText }> = {
  'partnership_agreement': { label: 'Partnership Agreement', icon: Shield },
  'training_doc': { label: 'Training Document', icon: FileText },
  'training_video': { label: 'Training Video', icon: Video },
  'training_link': { label: 'Training Link', icon: ExternalLink },
};

export default function AdminOnboarding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<OnboardingDocument | null>(null);
  const [formData, setFormData] = useState({
    type: 'training_doc',
    title: '',
    description: '',
    fileUrl: '',
    externalUrl: '',
    sortOrder: 0,
    isRequired: true,
    isActive: true,
    targetUserType: 'broker',
  });

  const { data: documentsData, isLoading: docsLoading } = useQuery<{ documents: OnboardingDocument[] }>({
    queryKey: ['/api/admin/onboarding/documents'],
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: OnboardingUser[] }>({
    queryKey: ['/api/admin/onboarding/users'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/admin/onboarding/documents', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/onboarding/documents'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({ title: 'Document created', description: 'The onboarding document has been created.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error?.message || 'Failed to create document', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const res = await apiRequest('PATCH', `/api/admin/onboarding/documents/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/onboarding/documents'] });
      setEditingDocument(null);
      resetForm();
      toast({ title: 'Document updated', description: 'The onboarding document has been updated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error?.message || 'Failed to update document', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/admin/onboarding/documents/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/onboarding/documents'] });
      toast({ title: 'Document deleted', description: 'The onboarding document has been deleted.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error?.message || 'Failed to delete document', variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      type: 'training_doc',
      title: '',
      description: '',
      fileUrl: '',
      externalUrl: '',
      sortOrder: 0,
      isRequired: true,
      isActive: true,
      targetUserType: 'broker',
    });
  };

  const handleEdit = (doc: OnboardingDocument) => {
    setEditingDocument(doc);
    setFormData({
      type: doc.type,
      title: doc.title,
      description: doc.description || '',
      fileUrl: doc.fileUrl || '',
      externalUrl: doc.externalUrl || '',
      sortOrder: doc.sortOrder,
      isRequired: doc.isRequired,
      isActive: doc.isActive,
      targetUserType: doc.targetUserType,
    });
  };

  const handleSubmit = () => {
    if (editingDocument) {
      updateMutation.mutate({ id: editingDocument.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const documents = documentsData?.documents || [];
  const users = usersData?.users || [];

  const brokersPendingOnboarding = users.filter(u => u.userType === 'broker' && !u.onboardingCompleted);
  const brokersCompleted = users.filter(u => u.userType === 'broker' && u.onboardingCompleted);

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Onboarding Management</h1>
          <p className="text-muted-foreground">
            Manage partnership agreements, training materials, and track user onboarding
          </p>
        </div>
      </div>

      <Tabs defaultValue="documents">
        <TabsList className="mb-6">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Documents
            <Badge variant="secondary">{documents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Status
            {brokersPendingOnboarding.length > 0 && (
              <Badge variant="destructive">{brokersPendingOnboarding.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Onboarding Documents</CardTitle>
                  <CardDescription>
                    Configure partnership agreements and training materials for new users
                  </CardDescription>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-document">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Document
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add Onboarding Document</DialogTitle>
                      <DialogDescription>
                        Create a new document for user onboarding
                      </DialogDescription>
                    </DialogHeader>
                    <DocumentForm
                      formData={formData}
                      setFormData={setFormData}
                      onSubmit={handleSubmit}
                      isPending={createMutation.isPending}
                      submitLabel="Create Document"
                    />
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Documents</p>
                  <p className="text-muted-foreground">Add your first onboarding document to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const typeInfo = documentTypeLabels[doc.type] || { label: doc.type, icon: FileText };
                      const TypeIcon = typeInfo.icon;
                      
                      return (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                <TypeIcon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">{doc.title}</p>
                                {doc.description && (
                                  <p className="text-sm text-muted-foreground truncate max-w-xs">{doc.description}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{typeInfo.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {doc.targetUserType === 'all' ? 'All Users' : doc.targetUserType === 'broker' ? 'Brokers' : 'Borrowers'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {doc.isRequired ? (
                              <Badge variant="default">Required</Badge>
                            ) : (
                              <Badge variant="outline">Optional</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.isActive ? (
                              <Badge variant="default" className="bg-green-500">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(doc)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Edit Document</DialogTitle>
                                    <DialogDescription>
                                      Update the onboarding document
                                    </DialogDescription>
                                  </DialogHeader>
                                  <DocumentForm
                                    formData={formData}
                                    setFormData={setFormData}
                                    onSubmit={handleSubmit}
                                    isPending={updateMutation.isPending}
                                    submitLabel="Save Changes"
                                  />
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate(doc.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-500" />
                  Pending Onboarding
                </CardTitle>
                <CardDescription>
                  Brokers who have not completed their onboarding
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : brokersPendingOnboarding.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <p className="text-lg font-medium">All Caught Up!</p>
                    <p className="text-muted-foreground">All brokers have completed their onboarding.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Agreement</TableHead>
                        <TableHead>Training</TableHead>
                        <TableHead>Registered</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brokersPendingOnboarding.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.fullName || 'Unknown'}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {user.partnershipAgreementSignedAt ? (
                              <Badge variant="default" className="bg-green-500">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Signed
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {user.trainingCompletedAt ? (
                              <Badge variant="default" className="bg-green-500">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Completed Onboarding
                </CardTitle>
                <CardDescription>
                  Brokers who have completed their onboarding
                </CardDescription>
              </CardHeader>
              <CardContent>
                {brokersCompleted.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No brokers have completed onboarding yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Agreement Signed</TableHead>
                        <TableHead>Training Completed</TableHead>
                        <TableHead>Registered</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brokersCompleted.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.fullName || 'Unknown'}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.partnershipAgreementSignedAt 
                              ? new Date(user.partnershipAgreementSignedAt).toLocaleDateString()
                              : 'N/A'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.trainingCompletedAt 
                              ? new Date(user.trainingCompletedAt).toLocaleDateString()
                              : 'N/A'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DocumentForm({
  formData,
  setFormData,
  onSubmit,
  isPending,
  submitLabel,
}: {
  formData: {
    type: string;
    title: string;
    description: string;
    fileUrl: string;
    externalUrl: string;
    sortOrder: number;
    isRequired: boolean;
    isActive: boolean;
    targetUserType: string;
  };
  setFormData: (data: typeof formData) => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Document Type</Label>
        <Select
          value={formData.type}
          onValueChange={(value) => setFormData({ ...formData, type: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="partnership_agreement">Partnership Agreement</SelectItem>
            <SelectItem value="training_doc">Training Document</SelectItem>
            <SelectItem value="training_video">Training Video</SelectItem>
            <SelectItem value="training_link">Training Link</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Enter document title"
          data-testid="input-document-title"
        />
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Enter a brief description"
        />
      </div>

      <div className="space-y-2">
        <Label>File URL (for PDFs, videos)</Label>
        <Input
          value={formData.fileUrl}
          onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div className="space-y-2">
        <Label>External URL (for links)</Label>
        <Input
          value={formData.externalUrl}
          onChange={(e) => setFormData({ ...formData, externalUrl: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div className="space-y-2">
        <Label>Target Users</Label>
        <Select
          value={formData.targetUserType}
          onValueChange={(value) => setFormData({ ...formData, targetUserType: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="broker">Brokers Only</SelectItem>
            <SelectItem value="borrower">Borrowers Only</SelectItem>
            <SelectItem value="all">All Users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Sort Order</Label>
        <Input
          type="number"
          value={formData.sortOrder}
          onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Required for onboarding</Label>
        <Switch
          checked={formData.isRequired}
          onCheckedChange={(checked) => setFormData({ ...formData, isRequired: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
        />
      </div>

      <DialogFooter>
        <Button onClick={onSubmit} disabled={isPending || !formData.title}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}
