import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Plus, User, DollarSign, Building2, Briefcase, Loader2, ClipboardList } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhoneNumber, getPhoneError, getEmailError } from "@/lib/validation";

interface QuoteField {
  fieldKey: string;
  label: string;
  fieldType?: 'text' | 'number' | 'currency' | 'email' | 'phone' | 'select' | 'yes_no' | 'percentage' | 'date' | 'radio' | 'address';
  required: boolean;
  visible: boolean;
  options?: string[];
  conditionalOn?: string;
  conditionalValue?: string;
  readOnly?: boolean;
  autoFilledFrom?: string;
  computedFrom?: string[];
  repeatable?: boolean;
  repeatGroupKey?: string;
}

function formatNumberWithCommas(value: string): string {
  const num = value.replace(/[^0-9]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString('en-US');
}

function stripCommas(value: string): string {
  return value.replace(/,/g, '');
}

export default function NewDeal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [formData, setFormData] = useState<Record<string, string>>({
    borrowerName: "",
    borrowerEmail: "",
    borrowerPhone: "",
    loanAmount: "",
    interestRate: "",
    loanTermMonths: "",
    loanType: "",
    programId: "",
    propertyAddress: "",
    propertyType: "",
    targetCloseDate: "",
    notes: "",
  });

  const { data: programsData, isLoading: programsLoading } = useQuery<{ programs: Array<{ id: number; name: string; loanType: string; isActive: boolean }> }>({
    queryKey: ['/api/programs-with-pricing'],
  });

  const programs = programsData?.programs || [];

  const { data: fieldsData, isLoading: fieldsLoading } = useQuery<{ quoteFormFields: QuoteField[]; termOptions?: string | null }>({
    queryKey: [`/api/programs/${formData.programId}/quote-fields`],
    enabled: !!formData.programId,
  });

  const CONTACT_FIELD_KEYS = new Set(['firstName', 'lastName', 'email', 'phone', 'address']);
  const programFields = fieldsData?.quoteFormFields?.filter(f => f.visible && !CONTACT_FIELD_KEYS.has(f.fieldKey)) || [];
  const termOptionsList = fieldsData?.termOptions ? fieldsData.termOptions.split(',').map(t => t.trim()).filter(Boolean) : [];

  // Auto-populate from borrower profile when email is entered
  const lookupEmail = formData.email || formData.borrowerEmail;
  const { data: profileLookup } = useQuery<{ profile: any | null }>({
    queryKey: ['/api/borrower-profile/lookup', lookupEmail],
    queryFn: async () => {
      const res = await fetch(`/api/borrower-profile/lookup?email=${encodeURIComponent(lookupEmail!)}`);
      if (!res.ok) return { profile: null };
      return res.json();
    },
    enabled: !!lookupEmail && lookupEmail.includes('@'),
    staleTime: 30 * 1000,
  });

  // Auto-fill from profile when found
  const [profileAppliedEmail, setProfileAppliedEmail] = useState('');
  useEffect(() => {
    if (profileLookup?.profile && lookupEmail && lookupEmail !== profileAppliedEmail) {
      const bp = profileLookup.profile;
      const updates: Record<string, string> = {};
      if (bp.firstName && !formData.firstName) updates.firstName = bp.firstName;
      if (bp.lastName && !formData.lastName) updates.lastName = bp.lastName;
      if (bp.phone && !formData.phone && !formData.borrowerPhone) {
        updates.phone = bp.phone;
        updates.borrowerPhone = bp.phone;
      }
      if (!formData.borrowerName && bp.firstName) {
        updates.borrowerName = [bp.firstName, bp.lastName].filter(Boolean).join(' ');
      }
      if (Object.keys(updates).length > 0) {
        setFormData(prev => ({ ...prev, ...updates }));
        toast({ title: "Borrower profile found", description: "Fields auto-populated from existing profile." });
      }
      setProfileAppliedEmail(lookupEmail);
    }
  }, [profileLookup?.profile, lookupEmail]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      // Build borrower info from either direct fields or program intake form fields
      const borrowerFirst = data.firstName || '';
      const borrowerLast = data.lastName || '';
      const derivedName = (borrowerFirst && borrowerLast) ? `${borrowerFirst} ${borrowerLast}`.trim() : data.borrowerName;
      const derivedEmail = data.email || data.borrowerEmail;
      const derivedPhone = data.phone || data.borrowerPhone;
      const payload: Record<string, any> = {
        borrowerName: derivedName,
        borrowerEmail: derivedEmail,
        borrowerPhone: derivedPhone,
        loanAmount: data.loanAmount ? parseFloat(stripCommas(data.loanAmount)) : null,
        interestRate: data.interestRate ? parseFloat(data.interestRate) : null,
        loanTermMonths: data.loanTermMonths ? parseInt(data.loanTermMonths) : null,
        loanType: data.loanType || null,
        programId: data.programId ? parseInt(data.programId) : null,
        propertyAddress: data.propertyAddress || null,
        propertyType: data.propertyType || null,
        targetCloseDate: data.targetCloseDate || null,
        notes: data.notes || null,
      };
      const allIntakeFields = [...programFields];
      for (let m = 2; m <= memberCount; m++) {
        allIntakeFields.push(...getMemberFields(m));
      }
      if (allIntakeFields.length > 0) {
        for (const field of allIntakeFields) {
          const val = data[field.fieldKey];
          if (val !== undefined && val !== '') {
            const key = field.fieldKey;
            if (key === 'loanAmount') {
              payload.loanAmount = parseFloat(stripCommas(val));
            } else if (key === 'propertyType') {
              payload.propertyType = val;
            } else if (key === 'propertyAddress') {
              payload.propertyAddress = val;
            } else if (key === 'loanType' || key === 'loanPurpose' || key === 'purpose') {
              payload.loanType = val;
            } else {
              if (!payload.programFieldData) payload.programFieldData = {};
              payload.programFieldData[key] = isCurrencyField(field) ? parseFloat(stripCommas(val)) : val;
            }
          }
        }
        if (memberCount > 1) {
          if (!payload.programFieldData) payload.programFieldData = {};
          payload.programFieldData._memberCount = memberCount;
        }
      }
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
    const hasName = formData.borrowerName || (formData.firstName && formData.lastName);
    const hasEmail = formData.borrowerEmail || formData.email;
    if (!hasName || !hasEmail) {
      toast({ title: "Please fill in borrower name and email", variant: "destructive" });
      return;
    }
    const allValidationFields = [...programFields.filter(f => !f.repeatable)];
    for (let m = 1; m <= memberCount; m++) {
      const mFields = m === 1
        ? programFields.filter(f => f.repeatable && f.fieldKey.startsWith('member1'))
        : getMemberFields(m);
      allValidationFields.push(...mFields);
    }
    const missingRequired = allValidationFields
      .filter(f => f.required && !f.readOnly && isFieldVisible(f))
      .filter(f => !formData[f.fieldKey]);
    if (missingRequired.length > 0) {
      toast({
        title: "Missing required fields",
        description: missingRequired.map(f => f.label).join(', '),
        variant: "destructive"
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLoanAmountChange = (value: string) => {
    const raw = value.replace(/[^0-9]/g, '');
    setFormData(prev => ({ ...prev, loanAmount: raw ? formatNumberWithCommas(raw) : '' }));
  };

  const LEGACY_CURRENCY_KEYS = new Set(['loanAmount', 'propertyValue', 'asIsValue', 'arv', 'rehabBudget', 'appraisalValue', 'annualTaxes', 'annualInsurance', 'grossMonthlyRent', 'annualHOA', 'originalPurchasePrice', 'purchasePrice', 'member1NetWorth', 'member1Liquidity']);

  const isCurrencyField = (field: QuoteField) =>
    field.fieldType === 'currency' || LEGACY_CURRENCY_KEYS.has(field.fieldKey);

  const isFieldVisible = (field: QuoteField): boolean => {
    if (!field.visible) return false;
    if (field.conditionalOn && field.conditionalValue) {
      const parentVal = formData[field.conditionalOn] || '';
      if (parentVal.toLowerCase() !== field.conditionalValue.toLowerCase()) return false;
    }
    return true;
  };

  const PROPERTY_TYPE_UNITS: Record<string, string> = {
    'Duplex': '2',
    'Triplex': '3',
    'Quadplex': '4',
  };

  useEffect(() => {
    const propType = formData.propertyType || '';
    const autoUnits = PROPERTY_TYPE_UNITS[propType];
    if (autoUnits) {
      if (formData.propertyUnits !== autoUnits) {
        setFormData(prev => ({ ...prev, propertyUnits: autoUnits }));
      }
    } else if (propType === 'Single Family Residence') {
      if (formData.propertyUnits !== '1') {
        setFormData(prev => ({ ...prev, propertyUnits: '1' }));
      }
    } else if (propType && formData.propertyUnits) {
      const prevAutoUnits = Object.values(PROPERTY_TYPE_UNITS).includes(formData.propertyUnits);
      if (prevAutoUnits) {
        setFormData(prev => ({ ...prev, propertyUnits: '' }));
      }
    }
  }, [formData.propertyType]);

  useEffect(() => {
    const monthlyRent = parseFloat(stripCommas(formData.grossMonthlyRent || '0'));
    const annualTaxes = parseFloat(stripCommas(formData.annualTaxes || '0'));
    const annualInsurance = parseFloat(stripCommas(formData.annualInsurance || '0'));
    const annualHOA = parseFloat(stripCommas(formData.annualHOA || '0'));
    const loanAmt = parseFloat(stripCommas(formData.loanAmount || '0'));
    const rate = parseFloat(formData.interestRate || '0');

    if (monthlyRent > 0 && loanAmt > 0 && rate > 0) {
      const monthlyRate = rate / 100 / 12;
      const monthlyPI = loanAmt * monthlyRate;
      const monthlyTI = (annualTaxes + annualInsurance + annualHOA) / 12;
      const totalMonthly = monthlyPI + monthlyTI;
      if (totalMonthly > 0) {
        const dscrVal = (monthlyRent / totalMonthly).toFixed(2);
        if (formData.dscr !== dscrVal) {
          setFormData(prev => ({ ...prev, dscr: dscrVal }));
        }
      }
    }
  }, [formData.grossMonthlyRent, formData.annualTaxes, formData.annualInsurance, formData.annualHOA, formData.loanAmount, formData.interestRate]);

  const [memberCount, setMemberCount] = useState(1);

  const addMember = () => {
    const next = memberCount + 1;
    setMemberCount(next);
  };

  const getMemberFields = (memberNum: number): QuoteField[] => {
    const templateFields = programFields.filter(f => f.repeatGroupKey === 'member' && f.fieldKey.startsWith('member1'));
    return templateFields.map(f => ({
      ...f,
      fieldKey: f.fieldKey.replace('member1', `member${memberNum}`),
      label: f.label.replace('Member 1', `Member ${memberNum}`).replace('Member1', `Member${memberNum}`),
    }));
  };

  const handleAddressSelect = (fieldKey: string, data: { formatted: string; city?: string; state?: string; zip?: string }) => {
    setFormData(prev => {
      const updates: Record<string, string> = { [fieldKey]: data.formatted };
      if (fieldKey === 'propertyAddress') {
        if (data.state) updates.propertyState = data.state;
        if (data.zip) updates.propertyZip = data.zip;
      }
      return { ...prev, ...updates };
    });
  };

  const renderProgramField = (field: QuoteField) => {
    if (!isFieldVisible(field)) return null;
    const key = field.fieldKey;
    const label = `${field.label}${field.required ? ' *' : ''}`;
    const ft = field.fieldType || 'text';

    if (field.readOnly) {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Input
            value={formData[key] || ''}
            readOnly
            className="bg-muted text-muted-foreground cursor-not-allowed"
            data-testid={`input-${key}`}
          />
          {field.computedFrom && <p className="text-[11px] text-muted-foreground">Auto-calculated</p>}
          {field.autoFilledFrom && <p className="text-[11px] text-muted-foreground">Auto-filled from address</p>}
        </div>
      );
    }

    if (ft === 'address') {
      return (
        <div key={key} className="space-y-2 sm:col-span-2">
          <Label>{label}</Label>
          <AddressAutocomplete
            value={formData[key] || ''}
            onChange={(val) => updateField(key, val)}
            onSelectStructured={(data) => handleAddressSelect(key, data)}
            placeholder="Start typing an address..."
            data-testid={`input-${key}`}
          />
        </div>
      );
    }

    if (ft === 'date') {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Input
            type="date"
            value={formData[key] || ''}
            onChange={(e) => updateField(key, e.target.value)}
            data-testid={`input-${key}`}
          />
        </div>
      );
    }

    if (ft === 'select' && field.options?.length) {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Select value={formData[key] || ''} onValueChange={(v) => updateField(key, v)}>
            <SelectTrigger data-testid={`select-${key}`}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (ft === 'yes_no' || ft === 'radio') {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer" data-testid={`radio-${key}-yes`}>
              <input
                type="radio"
                name={key}
                checked={formData[key] === 'yes'}
                onChange={() => updateField(key, 'yes')}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer" data-testid={`radio-${key}-no`}>
              <input
                type="radio"
                name={key}
                checked={formData[key] === 'no'}
                onChange={() => updateField(key, 'no')}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">No</span>
            </label>
          </div>
        </div>
      );
    }

    if (isCurrencyField(field)) {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              value={formData[key] || ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                updateField(key, raw ? formatNumberWithCommas(raw) : '');
              }}
              className="pl-7"
              placeholder=""
              data-testid={`input-${key}`}
            />
          </div>
        </div>
      );
    }

    if (ft === 'email') {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Input
            type="email"
            value={formData[key] || ''}
            onChange={(e) => updateField(key, e.target.value)}
            placeholder=""
            data-testid={`input-${key}`}
          />
        </div>
      );
    }

    if (ft === 'phone') {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Input
            value={formData[key] || ''}
            onChange={(e) => updateField(key, formatPhoneNumber(e.target.value))}
            placeholder="(555) 555-5555"
            data-testid={`input-${key}`}
          />
        </div>
      );
    }

    if (ft === 'number') {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Input
            type="number"
            value={formData[key] || ''}
            onChange={(e) => updateField(key, e.target.value)}
            placeholder=""
            data-testid={`input-${key}`}
          />
        </div>
      );
    }

    if (ft === 'percentage') {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              value={formData[key] || ''}
              onChange={(e) => updateField(key, e.target.value)}
              placeholder=""
              data-testid={`input-${key}`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
          </div>
        </div>
      );
    }

    return (
      <div key={key} className="space-y-2">
        <Label>{label}</Label>
        <Input
          value={formData[key] || ''}
          onChange={(e) => updateField(key, e.target.value)}
          placeholder=""
          data-testid={`input-${key}`}
        />
      </div>
    );
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
          <p className="text-sm text-muted-foreground">Create a new loan deal</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Loan Program
            </CardTitle>
            <CardDescription>Select the loan program for this deal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="programId">Program</Label>
              <Select value={formData.programId} onValueChange={(v) => updateField("programId", v)}>
                <SelectTrigger data-testid="select-program">
                  <SelectValue placeholder={programsLoading ? "Loading programs..." : "Select a loan program"} />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={String(program.id)}>
                      {program.name}
                    </SelectItem>
                  ))}
                  {programs.length === 0 && !programsLoading && (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No loan programs available
                    </div>
                  )}
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
              <AddressAutocomplete
                value={formData.propertyAddress}
                onChange={(val) => updateField("propertyAddress", val)}
                onSelectStructured={(data) => handleAddressSelect("propertyAddress", data)}
                placeholder="123 Main St, City, State 12345"
              />
            </div>
          </CardContent>
        </Card>

        {formData.programId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Borrower Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName || ''}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    placeholder="First name"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName || ''}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    placeholder="Last name"
                    data-testid="input-last-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="borrower@example.com"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) => updateField("phone", formatPhoneNumber(e.target.value))}
                    placeholder="(555) 555-5555"
                    data-testid="input-phone"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {formData.programId && programFields.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Intake Form
              </CardTitle>
              <CardDescription>
                Complete the intake form for this loan program
              </CardDescription>
            </CardHeader>
            <CardContent>
              {fieldsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {programFields.filter(f => !f.repeatable).map(renderProgramField)}
                    {termOptionsList.length > 0 && (
                      <div>
                        <Label htmlFor="loanTermMonths">Loan Term (months)</Label>
                        <Select
                          value={formData.loanTermMonths}
                          onValueChange={(v) => updateField("loanTermMonths", v)}
                        >
                          <SelectTrigger id="loanTermMonths">
                            <SelectValue placeholder="Select term" />
                          </SelectTrigger>
                          <SelectContent>
                            {termOptionsList.map((term) => (
                              <SelectItem key={term} value={term}>
                                {term} months
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {programFields.some(f => f.repeatable && f.repeatGroupKey === 'member') && (
                    <div className="space-y-4">
                      {Array.from({ length: memberCount }, (_, i) => i + 1).map(memberNum => {
                        const fields = memberNum === 1
                          ? programFields.filter(f => f.repeatable && f.fieldKey.startsWith('member1'))
                          : getMemberFields(memberNum);
                        return (
                          <div key={memberNum} className="space-y-3">
                            <div className="flex items-center gap-2 pt-2 border-t border-border">
                              <h4 className="text-sm font-semibold text-foreground" data-testid={`text-member-${memberNum}-header`}>
                                Member {memberNum}
                              </h4>
                              {memberNum > 1 && memberNum === memberCount && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-destructive h-6"
                                  onClick={() => setMemberCount(prev => prev - 1)}
                                  data-testid={`button-remove-member-${memberNum}`}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                              {fields.map(renderProgramField)}
                            </div>
                          </div>
                        );
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={addMember}
                        data-testid="button-add-member"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Member
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!formData.programId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Borrower & Loan Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="borrowerName">Borrower Name *</Label>
                  <Input
                    id="borrowerName"
                    value={formData.borrowerName}
                    onChange={(e) => updateField("borrowerName", e.target.value)}
                    placeholder="John Smith"
                    data-testid="input-borrower-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="borrowerEmail">Borrower Email *</Label>
                  <Input
                    id="borrowerEmail"
                    type="email"
                    value={formData.borrowerEmail}
                    onChange={(e) => updateField("borrowerEmail", e.target.value)}
                    placeholder="john@example.com"
                    data-testid="input-borrower-email"
                  />
                  {getEmailError(formData.borrowerEmail) && <p className="text-xs text-destructive mt-1">{getEmailError(formData.borrowerEmail)}</p>}
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loanAmount">Loan Amount</Label>
                  <Input
                    id="loanAmount"
                    value={formData.loanAmount}
                    onChange={(e) => handleLoanAmountChange(e.target.value)}
                    placeholder=""
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
                    placeholder=""
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
                    placeholder=""
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
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="refinance">Refinance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="propertyType">Property Type</Label>
                  <Select value={formData.propertyType} onValueChange={(v) => updateField("propertyType", v)}>
                    <SelectTrigger data-testid="select-property-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single-family-residence">Single Family Residence</SelectItem>
                      <SelectItem value="2-4-unit">2-4 Unit</SelectItem>
                      <SelectItem value="multifamily-5-plus">Multifamily (5+ Units)</SelectItem>
                      <SelectItem value="rental-portfolio">Rental Portfolio</SelectItem>
                      <SelectItem value="mixed-use">Mixed-Use</SelectItem>
                      <SelectItem value="infill-lot">Infill Lot</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="hospitality">Hospitality</SelectItem>
                      <SelectItem value="industrial">Industrial</SelectItem>
                      <SelectItem value="medical">Medical</SelectItem>
                      <SelectItem value="agricultural">Agricultural</SelectItem>
                      <SelectItem value="special-purpose">Special Purpose</SelectItem>
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
        )}

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
