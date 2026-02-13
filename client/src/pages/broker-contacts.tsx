import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, Search, Edit2, Trash2, Mail, MessageSquare, Sparkles } from 'lucide-react';
import { api } from '@shared/routes';

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  contactType: string;
  lastContactedAt?: string;
  notes?: string;
  tags?: string[];
  source?: string;
  isActive: boolean;
  createdAt: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  contactType: string;
  notes: string;
  tags: string[];
  source: string;
}

const initialFormData: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  contactType: 'prospect',
  notes: '',
  tags: [],
  source: '',
};

export default function BrokerContactsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [contactType, setContactType] = useState<string>('');
  const [isActive, setIsActive] = useState<string>('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Fetch contacts
  const { data: contactsData, isLoading, refetch } = useQuery({
    queryKey: ['broker-contacts', search, contactType, isActive],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (contactType) params.append('type', contactType);
      if (isActive) params.append('isActive', isActive);
      params.append('limit', '100');

      const response = await fetch(`${api.baseUrl}/api/broker/contacts?${params}`);
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
  });

  const contacts = contactsData?.contacts || [];
  const total = contactsData?.total || 0;

  // Create/Update contact mutation
  const { mutate: saveContact, isPending: isSaving } = useMutation({
    mutationFn: async (data: FormData) => {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId
        ? `${api.baseUrl}/api/broker/contacts/${editingId}`
        : `${api.baseUrl}/api/broker/contacts`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save contact');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: editingId ? 'Contact updated' : 'Contact created',
        description: editingId
          ? 'Contact has been updated successfully'
          : 'New contact has been added to your list',
      });
      setOpenDialog(false);
      setEditingId(null);
      setFormData(initialFormData);
      queryClient.invalidateQueries({ queryKey: ['broker-contacts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete contact mutation
  const { mutate: deleteContact, isPending: isDeleting } = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${api.baseUrl}/api/broker/contacts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete contact');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Contact deleted',
        description: 'Contact has been removed from your list',
      });
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['broker-contacts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Import CSV mutation
  const { mutate: importCsv, isPending: isImporting } = useMutation({
    mutationFn: async (csvContent: string) => {
      const response = await fetch(`${api.baseUrl}/api/broker/contacts/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import contacts');
      }

      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Import successful',
        description: `Imported ${data.imported} contacts`,
      });
      setCsvFile(null);
      queryClient.invalidateQueries({ queryKey: ['broker-contacts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvContent = event.target?.result as string;
      importCsv(csvContent);
    };
    reader.readAsText(file);
  };

  const handleOpenDialog = (contact?: Contact) => {
    if (contact) {
      setEditingId(contact.id);
      setFormData({
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        contactType: contact.contactType,
        notes: contact.notes || '',
        tags: contact.tags || [],
        source: contact.source || '',
      });
    } else {
      setEditingId(null);
      setFormData(initialFormData);
    }
    setOpenDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveContact(formData);
  };

  const getContactTypeColor = (type: string) => {
    switch (type) {
      case 'prospect':
        return 'bg-blue-100 text-blue-800';
      case 'client':
        return 'bg-green-100 text-green-800';
      case 'referral':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredContacts = contacts.filter((c) => {
    if (contactType && c.contactType !== contactType) return false;
    if (isActive === 'true' && !c.isActive) return false;
    if (isActive === 'false' && c.isActive) return false;
    return true;
  });

  const getContactTypeCounts = () => {
    const counts = { all: total, prospects: 0, clients: 0, referrals: 0, inactive: 0 };
    contacts.forEach((c) => {
      if (!c.isActive) counts.inactive++;
      else if (c.contactType === 'prospect') counts.prospects++;
      else if (c.contactType === 'client') counts.clients++;
      else if (c.contactType === 'referral') counts.referrals++;
    });
    return counts;
  };

  const counts = getContactTypeCounts();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Contacts</h1>
            <p className="text-muted-foreground mt-1">
              Manage and organize your broker contacts
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Contact
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingId ? 'Edit Contact' : 'Add New Contact'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingId
                      ? 'Update the contact information'
                      : 'Fill in the details to add a new contact'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) =>
                          setFormData({ ...formData, firstName: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) =>
                          setFormData({ ...formData, lastName: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) =>
                        setFormData({ ...formData, company: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="contactType">Contact Type</Label>
                    <Select
                      value={formData.contactType}
                      onValueChange={(value) =>
                        setFormData({ ...formData, contactType: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prospect">Prospect</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-input rounded-md text-sm"
                      rows={3}
                    />
                  </div>

                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? 'Saving...' : editingId ? 'Update' : 'Create'} Contact
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <label htmlFor="csv-upload">
              <Button asChild variant="outline" className="gap-2 cursor-pointer">
                <span>
                  <Upload className="w-4 h-4" />
                  Import CSV
                </span>
              </Button>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                disabled={isImporting}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <Tabs value={contactType || 'all'} onValueChange={(value) => setContactType(value === 'all' ? '' : value)}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">
              All <Badge variant="secondary" className="ml-1">{counts.all}</Badge>
            </TabsTrigger>
            <TabsTrigger value="prospect">
              Prospects <Badge variant="secondary" className="ml-1">{counts.prospects}</Badge>
            </TabsTrigger>
            <TabsTrigger value="client">
              Clients <Badge variant="secondary" className="ml-1">{counts.clients}</Badge>
            </TabsTrigger>
            <TabsTrigger value="referral">
              Referrals <Badge variant="secondary" className="ml-1">{counts.referrals}</Badge>
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive <Badge variant="secondary" className="ml-1">{counts.inactive}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={contactType || 'all'} className="mt-6">
            {isLoading ? (
              <div className="text-center py-8">Loading contacts...</div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No contacts found. Create your first contact!
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Last Contacted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((contact: Contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">
                          {contact.firstName} {contact.lastName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {contact.email || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {contact.phone || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {contact.company || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={getContactTypeColor(contact.contactType)}>
                            {contact.contactType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {contact.lastContactedAt
                            ? new Date(contact.lastContactedAt).toLocaleDateString()
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(contact)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteId(contact.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteContact(deleteId);
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

BrokerContactsPage.displayName = 'BrokerContactsPage';
