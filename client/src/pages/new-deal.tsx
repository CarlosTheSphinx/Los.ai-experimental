import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Plus, User, Mail, Phone, Building2, DollarSign, Calendar, FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function NewDeal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    dealName: "",
    borrowerName: "",
    borrowerEmail: "",
    borrowerPhone: "",
    loanAmount: "",
    interestRate: "",
    loanTermMonths: "",
    loanType: "",
    propertyAddress: "",
    propertyType: "",
    targetCloseDate: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        ...data,
        loanAmount: data.loanAmount ? parseFloat(data.loanAmount) : null,
        interestRate: data.interestRate ? parseFloat(data.interestRate) : null,
        loanTermMonths: data.loanTermMonths ? parseInt(data.loanTermMonths) : null,
      };
      return apiRequest('POST', '/api/deals', payload);
    },
    onSuccess: async (res) => {
      const { project } = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      toast({ title: "Deal created successfully" });
      setLocation(`/deals/${project.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create deal", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.dealName || !formData.borrowerName || !formData.borrowerEmail) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/deals">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">New Deal</h1>
          <p className="text-sm text-muted-foreground">Create a new loan deal manually</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Deal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dealName">Deal Name *</Label>
              <Input
                id="dealName"
                value={formData.dealName}
                onChange={(e) => updateField("dealName", e.target.value)}
                placeholder="e.g., Smith Refinance"
                data-testid="input-deal-name"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Borrower Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="borrowerName">Full Name *</Label>
                <Input
                  id="borrowerName"
                  value={formData.borrowerName}
                  onChange={(e) => updateField("borrowerName", e.target.value)}
                  placeholder="John Smith"
                  data-testid="input-borrower-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="borrowerEmail">Email *</Label>
                <Input
                  id="borrowerEmail"
                  type="email"
                  value={formData.borrowerEmail}
                  onChange={(e) => updateField("borrowerEmail", e.target.value)}
                  placeholder="john@example.com"
                  data-testid="input-borrower-email"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="borrowerPhone">Phone</Label>
              <Input
                id="borrowerPhone"
                type="tel"
                value={formData.borrowerPhone}
                onChange={(e) => updateField("borrowerPhone", e.target.value)}
                placeholder="(555) 123-4567"
                data-testid="input-borrower-phone"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Loan Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loanAmount">Loan Amount</Label>
                <Input
                  id="loanAmount"
                  type="number"
                  value={formData.loanAmount}
                  onChange={(e) => updateField("loanAmount", e.target.value)}
                  placeholder="500000"
                  data-testid="input-loan-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate (%)</Label>
                <Input
                  id="interestRate"
                  type="number"
                  step="0.01"
                  value={formData.interestRate}
                  onChange={(e) => updateField("interestRate", e.target.value)}
                  placeholder="7.5"
                  data-testid="input-interest-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loanTermMonths">Term (months)</Label>
                <Input
                  id="loanTermMonths"
                  type="number"
                  value={formData.loanTermMonths}
                  onChange={(e) => updateField("loanTermMonths", e.target.value)}
                  placeholder="12"
                  data-testid="input-loan-term"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanType">Loan Type</Label>
              <Select value={formData.loanType} onValueChange={(v) => updateField("loanType", v)}>
                <SelectTrigger data-testid="select-loan-type">
                  <SelectValue placeholder="Select loan type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge">Bridge Loan</SelectItem>
                  <SelectItem value="fix_and_flip">Fix and Flip</SelectItem>
                  <SelectItem value="ground_up">Ground Up Construction</SelectItem>
                  <SelectItem value="dscr">DSCR</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Property Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="propertyAddress">Property Address</Label>
              <Input
                id="propertyAddress"
                value={formData.propertyAddress}
                onChange={(e) => updateField("propertyAddress", e.target.value)}
                placeholder="123 Main St, City, State 12345"
                data-testid="input-property-address"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="propertyType">Property Type</Label>
                <Select value={formData.propertyType} onValueChange={(v) => updateField("propertyType", v)}>
                  <SelectTrigger data-testid="select-property-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sfr">Single Family</SelectItem>
                    <SelectItem value="multi_family">Multi-Family</SelectItem>
                    <SelectItem value="condo">Condo</SelectItem>
                    <SelectItem value="townhouse">Townhouse</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="mixed_use">Mixed Use</SelectItem>
                    <SelectItem value="land">Land</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetCloseDate">Target Close Date</Label>
                <Input
                  id="targetCloseDate"
                  type="date"
                  value={formData.targetCloseDate}
                  onChange={(e) => updateField("targetCloseDate", e.target.value)}
                  data-testid="input-target-close-date"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
            <CardDescription>Any additional notes about this deal (visible to borrower)</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Enter any notes..."
              rows={4}
              data-testid="input-notes"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/deals">
            <Button type="button" variant="outline" data-testid="button-cancel">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={createMutation.isPending} data-testid="button-create">
            {createMutation.isPending ? (
              "Creating..."
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Deal
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
