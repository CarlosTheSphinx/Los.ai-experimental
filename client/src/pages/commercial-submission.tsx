import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  X,
  Loader2,
  FileText,
  Building2,
  DollarSign,
  Users,
  FolderOpen,
  ClipboardCheck,
} from "lucide-react";

const US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

const STEPS = [
  { label: "Submitter Info", icon: Users },
  { label: "Deal Type", icon: DollarSign },
  { label: "Property", icon: Building2 },
  { label: "Sponsor", icon: Users },
  { label: "Documents", icon: FolderOpen },
  { label: "Review", icon: ClipboardCheck },
];

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

type DocType = "SREO" | "PFS" | "BUDGET" | "TRACK_RECORD" | "APPRAISAL";

interface UploadedDoc {
  docType: DocType;
  file: File;
  objectPath?: string;
  uploaded: boolean;
  uploading?: boolean;
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  SREO: "Schedule of Real Estate Owned (SREO)",
  PFS: "Personal Financial Statement (PFS)",
  BUDGET: "Budget / Pro Forma",
  TRACK_RECORD: "Track Record",
  APPRAISAL: "Appraisal",
};

const formSchema = z.object({
  submitterType: z.enum(["BROKER", "DEVELOPER"], { required_error: "Select a submitter type" }),
  brokerOrDeveloperName: z.string().min(1, "Name is required"),
  companyName: z.string().min(1, "Company name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  roleOnDeal: z.string().min(1, "Role on deal is required"),

  loanType: z.enum(["BRIDGE", "LONG_TERM"], { required_error: "Select a loan type" }),
  requestedLoanAmount: z.coerce.number().min(1, "Loan amount is required"),
  requestedLTV: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  requestedLTC: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  interestOnly: z.boolean(),
  desiredCloseDate: z.string().min(1, "Close date is required"),
  exitStrategyType: z.string().optional(),
  exitStrategyDetails: z.string().optional(),

  propertyName: z.string().min(1, "Property name is required"),
  propertyAddress: z.string().min(1, "Property address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().length(2, "Select a state"),
  zip: z.string().min(5, "ZIP code is required"),
  propertyType: z.enum(["MULTIFAMILY", "INDUSTRIAL", "RETAIL", "OFFICE", "MIXED_USE", "HOSPITALITY", "SELF_STORAGE", "LAND", "OTHER"], { required_error: "Select property type" }),
  occupancyType: z.enum(["STABILIZED", "VALUE_ADD", "LEASE_UP", "GROUND_UP", "OTHER"], { required_error: "Select occupancy type" }),
  unitsOrSqft: z.coerce.number().min(1, "Units/Sq Ft is required"),
  yearBuilt: z.coerce.number().optional().or(z.literal("")),
  purchasePrice: z.coerce.number().optional().or(z.literal("")),
  asIsValue: z.coerce.number().min(1, "As-Is value is required"),
  arvOrStabilizedValue: z.coerce.number().optional().or(z.literal("")),
  currentNOI: z.coerce.number().optional().or(z.literal("")),
  inPlaceRent: z.coerce.number().optional().or(z.literal("")),
  proFormaNOI: z.coerce.number().optional().or(z.literal("")),
  capexBudgetTotal: z.coerce.number().min(0, "CapEx budget is required"),
  businessPlanSummary: z.string().min(50, "Business plan summary must be at least 50 characters"),

  primarySponsorName: z.string().min(1, "Sponsor name is required"),
  primarySponsorExperienceYears: z.coerce.number().min(0, "Experience years is required"),
  numberOfSimilarProjects: z.coerce.number().min(0, "Number of projects is required"),
  netWorth: z.coerce.number().min(0, "Net worth is required"),
  liquidity: z.coerce.number().min(0, "Liquidity is required"),
}).superRefine((data, ctx) => {
  const ltv = data.requestedLTV;
  const ltc = data.requestedLTC;
  const hasLTV = typeof ltv === "number" && ltv > 0;
  const hasLTC = typeof ltc === "number" && ltc > 0;
  if (!hasLTV && !hasLTC) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one of LTV or LTC is required",
      path: ["requestedLTV"],
    });
  }
  if (data.loanType === "BRIDGE") {
    if (!data.exitStrategyType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exit strategy is required for bridge loans",
        path: ["exitStrategyType"],
      });
    }
    if (!data.exitStrategyDetails || data.exitStrategyDetails.length < 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exit strategy details must be at least 20 characters",
        path: ["exitStrategyDetails"],
      });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function CommercialSubmissionPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeDocType, setActiveDocType] = useState<DocType | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      submitterType: undefined,
      brokerOrDeveloperName: "",
      companyName: "",
      email: "",
      phone: "",
      roleOnDeal: "",
      loanType: undefined,
      requestedLoanAmount: "" as unknown as number,
      requestedLTV: "",
      requestedLTC: "",
      interestOnly: false,
      desiredCloseDate: "",
      exitStrategyType: "",
      exitStrategyDetails: "",
      propertyName: "",
      propertyAddress: "",
      city: "",
      state: "",
      zip: "",
      propertyType: undefined,
      occupancyType: undefined,
      unitsOrSqft: "" as unknown as number,
      yearBuilt: "",
      purchasePrice: "",
      asIsValue: "" as unknown as number,
      arvOrStabilizedValue: "",
      currentNOI: "",
      inPlaceRent: "",
      proFormaNOI: "",
      capexBudgetTotal: "" as unknown as number,
      businessPlanSummary: "",
      primarySponsorName: "",
      primarySponsorExperienceYears: "" as unknown as number,
      numberOfSimilarProjects: "" as unknown as number,
      netWorth: "" as unknown as number,
      liquidity: "" as unknown as number,
    },
    mode: "onTouched",
  });

  const prefillDone = useRef(false);
  useEffect(() => {
    if (user && !prefillDone.current) {
      prefillDone.current = true;
      if (user.email) {
        form.setValue("email", user.email);
      }
      const userAny = user as unknown as Record<string, unknown>;
      if (userAny.companyName) {
        form.setValue("companyName", userAny.companyName as string);
      }
      if (userAny.fullName) {
        form.setValue("brokerOrDeveloperName", userAny.fullName as string);
      }
    }
  }, [user]);

  const watchedLoanType = form.watch("loanType");
  const watchedPropertyType = form.watch("propertyType");

  const unitsLabel = watchedPropertyType === "MULTIFAMILY" ? "Units" : "Sq Ft";

  const getRequiredDocTypes = (): DocType[] => {
    const required: DocType[] = ["SREO", "PFS", "BUDGET"];
    if (watchedLoanType === "BRIDGE") {
      required.push("TRACK_RECORD");
    }
    return required;
  };

  const getOptionalDocTypes = (): DocType[] => {
    return ["APPRAISAL"];
  };

  const allRequiredDocsUploaded = () => {
    const required = getRequiredDocTypes();
    return required.every((dt) => uploadedDocs.some((d) => d.docType === dt));
  };

  const stepFields: Record<number, (keyof FormValues)[]> = {
    0: ["submitterType", "brokerOrDeveloperName", "companyName", "email", "phone", "roleOnDeal"],
    1: ["loanType", "requestedLoanAmount", "requestedLTV", "requestedLTC", "interestOnly", "desiredCloseDate", "exitStrategyType", "exitStrategyDetails"],
    2: ["propertyName", "propertyAddress", "city", "state", "zip", "propertyType", "occupancyType", "unitsOrSqft", "yearBuilt", "purchasePrice", "asIsValue", "arvOrStabilizedValue", "currentNOI", "inPlaceRent", "proFormaNOI", "capexBudgetTotal", "businessPlanSummary"],
    3: ["primarySponsorName", "primarySponsorExperienceYears", "numberOfSimilarProjects", "netWorth", "liquidity"],
  };

  const validateStep = async (step: number): Promise<boolean> => {
    if (step === 4 || step === 5) return true;
    const fields = stepFields[step];
    if (!fields) return true;
    const result = await form.trigger(fields);
    return result;
  };

  const handleNext = async () => {
    const valid = await validateStep(currentStep);
    if (!valid) {
      toast({ title: "Validation Error", description: "Please fix the errors before continuing.", variant: "destructive" });
      return;
    }
    if (currentStep === 4 && !allRequiredDocsUploaded()) {
      toast({ title: "Missing Documents", description: "Please upload all required documents before continuing.", variant: "destructive" });
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, 5));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDocType) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({ title: "Invalid File Type", description: "Only PDF, XLS, and XLSX files are allowed.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File Too Large", description: "Maximum file size is 25MB.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const existing = uploadedDocs.findIndex((d) => d.docType === activeDocType);
    const newDoc: UploadedDoc = { docType: activeDocType, file, uploaded: false, uploading: true };

    if (existing >= 0) {
      setUploadedDocs((prev) => prev.map((d, i) => (i === existing ? newDoc : d)));
    } else {
      setUploadedDocs((prev) => [...prev, newDoc]);
    }

    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });

      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!putRes.ok) throw new Error("Failed to upload file");

      setUploadedDocs((prev) =>
        prev.map((d) =>
          d.docType === activeDocType ? { ...d, objectPath, uploaded: true, uploading: false } : d
        )
      );

      toast({ title: "File Uploaded", description: `${DOC_TYPE_LABELS[activeDocType]} uploaded successfully.` });
    } catch (err) {
      setUploadedDocs((prev) => prev.filter((d) => !(d.docType === activeDocType && !d.uploaded)));
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Failed to upload file.",
        variant: "destructive",
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    setActiveDocType(null);
  };

  const removeDoc = (docType: DocType) => {
    setUploadedDocs((prev) => prev.filter((d) => d.docType !== docType));
  };

  const handleSubmit = async () => {
    const allValid = await form.trigger();
    if (!allValid) {
      toast({ title: "Validation Error", description: "Please fix all errors before submitting.", variant: "destructive" });
      return;
    }
    if (!allRequiredDocsUploaded()) {
      toast({ title: "Missing Documents", description: "Please upload all required documents.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const values = form.getValues();

      const submissionData = {
        submitterType: values.submitterType,
        brokerOrDeveloperName: values.brokerOrDeveloperName,
        companyName: values.companyName,
        email: values.email,
        phone: values.phone,
        roleOnDeal: values.roleOnDeal,
        loanType: values.loanType,
        requestedLoanAmount: values.requestedLoanAmount,
        requestedLTV: typeof values.requestedLTV === "number" ? values.requestedLTV : null,
        requestedLTC: typeof values.requestedLTC === "number" ? values.requestedLTC : null,
        interestOnly: values.interestOnly,
        desiredCloseDate: new Date(values.desiredCloseDate).toISOString(),
        exitStrategyType: values.loanType === "BRIDGE" ? values.exitStrategyType : null,
        exitStrategyDetails: values.loanType === "BRIDGE" ? values.exitStrategyDetails : null,
        propertyName: values.propertyName,
        propertyAddress: values.propertyAddress,
        city: values.city,
        state: values.state,
        zip: values.zip,
        propertyType: values.propertyType,
        occupancyType: values.occupancyType,
        unitsOrSqft: values.unitsOrSqft,
        yearBuilt: typeof values.yearBuilt === "number" ? values.yearBuilt : null,
        purchasePrice: typeof values.purchasePrice === "number" ? values.purchasePrice : null,
        asIsValue: values.asIsValue,
        arvOrStabilizedValue: typeof values.arvOrStabilizedValue === "number" ? values.arvOrStabilizedValue : null,
        currentNOI: typeof values.currentNOI === "number" ? values.currentNOI : null,
        inPlaceRent: typeof values.inPlaceRent === "number" ? values.inPlaceRent : null,
        proFormaNOI: typeof values.proFormaNOI === "number" ? values.proFormaNOI : null,
        capexBudgetTotal: values.capexBudgetTotal,
        businessPlanSummary: values.businessPlanSummary,
        primarySponsorName: values.primarySponsorName,
        primarySponsorExperienceYears: values.primarySponsorExperienceYears,
        numberOfSimilarProjects: values.numberOfSimilarProjects,
        netWorth: values.netWorth,
        liquidity: values.liquidity,
        status: "DRAFT",
      };

      const createRes = await apiRequest("POST", "/api/commercial-submissions", submissionData);
      const submission = await createRes.json();
      const submissionId = submission.id;

      for (const doc of uploadedDocs) {
        if (doc.objectPath) {
          await apiRequest("POST", `/api/commercial-submissions/${submissionId}/documents`, {
            docType: doc.docType,
            storageKey: doc.objectPath,
            originalFileName: doc.file.name,
            mimeType: doc.file.type,
            fileSize: doc.file.size,
          });
        }
      }

      await apiRequest("POST", `/api/commercial-submissions/${submissionId}/submit`);

      queryClient.invalidateQueries({ queryKey: ["/api/commercial-submissions"] });

      toast({ title: "Submission Complete", description: "Your commercial deal submission has been received." });
      navigate(`/commercial-submission/${submissionId}/confirmation`);
    } catch (err) {
      toast({
        title: "Submission Failed",
        description: err instanceof Error ? err.message : "An error occurred while submitting.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8 overflow-x-auto" data-testid="step-indicator">
      {STEPS.map((step, idx) => {
        const StepIcon = step.icon;
        const isActive = idx === currentStep;
        const isCompleted = idx < currentStep;
        return (
          <div key={idx} className="flex flex-col items-center min-w-[80px] flex-1">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div
                  className={`h-0.5 flex-1 ${isCompleted ? "bg-primary" : "bg-muted"}`}
                />
              )}
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full border-2 shrink-0 ${
                  isCompleted
                    ? "bg-primary border-primary text-primary-foreground"
                    : isActive
                    ? "border-primary text-primary bg-background"
                    : "border-muted text-muted-foreground bg-background"
                }`}
                data-testid={`step-indicator-${idx}`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${isCompleted ? "bg-primary" : "bg-muted"}`}
                />
              )}
            </div>
            <span
              className={`mt-2 text-xs text-center ${
                isActive ? "font-semibold text-primary" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );

  const renderStep0 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="submitterType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Submitter Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-submitter-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="BROKER">Broker</SelectItem>
                  <SelectItem value="DEVELOPER">Developer</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="brokerOrDeveloperName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Full name" data-testid="input-broker-developer-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Company name" data-testid="input-company-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" placeholder="email@example.com" data-testid="input-email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input {...field} type="tel" placeholder="(555) 123-4567" data-testid="input-phone" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roleOnDeal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role on Deal</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Originator, Principal" data-testid="input-role-on-deal" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="loanType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Loan Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-loan-type">
                    <SelectValue placeholder="Select loan type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="BRIDGE">Bridge</SelectItem>
                  <SelectItem value="LONG_TERM">Long Term</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="requestedLoanAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requested Loan Amount ($)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-requested-loan-amount"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="requestedLTV"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requested LTV (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g. 75"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-requested-ltv"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="requestedLTC"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requested LTC (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g. 80"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-requested-ltc"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="interestOnly"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interest Only</FormLabel>
              <Select
                onValueChange={(v) => field.onChange(v === "true")}
                value={field.value ? "true" : "false"}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-interest-only">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="desiredCloseDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Desired Close Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  data-testid="input-desired-close-date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {watchedLoanType === "BRIDGE" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
          <FormField
            control={form.control}
            name="exitStrategyType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exit Strategy</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-exit-strategy-type">
                      <SelectValue placeholder="Select exit strategy" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="SALE">Sale</SelectItem>
                    <SelectItem value="REFINANCE">Refinance</SelectItem>
                    <SelectItem value="CONSTRUCTION_TO_PERM">Construction to Perm</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="exitStrategyDetails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Exit Strategy Details (min 20 characters)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Describe your exit strategy in detail..."
                      rows={3}
                      data-testid="textarea-exit-strategy-details"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="propertyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Property name" data-testid="input-property-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="propertyAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property Address</FormLabel>
              <FormControl>
                <Input {...field} placeholder="123 Main St" data-testid="input-property-address" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl>
                <Input {...field} placeholder="City" data-testid="input-city" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.value} - {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="zip"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ZIP Code</FormLabel>
              <FormControl>
                <Input {...field} placeholder="12345" data-testid="input-zip" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="propertyType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-property-type">
                    <SelectValue placeholder="Select property type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="MULTIFAMILY">Multifamily</SelectItem>
                  <SelectItem value="INDUSTRIAL">Industrial</SelectItem>
                  <SelectItem value="RETAIL">Retail</SelectItem>
                  <SelectItem value="OFFICE">Office</SelectItem>
                  <SelectItem value="MIXED_USE">Mixed Use</SelectItem>
                  <SelectItem value="HOSPITALITY">Hospitality</SelectItem>
                  <SelectItem value="SELF_STORAGE">Self Storage</SelectItem>
                  <SelectItem value="LAND">Land</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="occupancyType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Occupancy Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-occupancy-type">
                    <SelectValue placeholder="Select occupancy type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="STABILIZED">Stabilized</SelectItem>
                  <SelectItem value="VALUE_ADD">Value Add</SelectItem>
                  <SelectItem value="LEASE_UP">Lease Up</SelectItem>
                  <SelectItem value="GROUND_UP">Ground Up</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="unitsOrSqft"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{unitsLabel}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder={`Number of ${unitsLabel.toLowerCase()}`}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-units-or-sqft"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="yearBuilt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Year Built (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g. 1990"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-year-built"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="purchasePrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purchase Price (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-purchase-price"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="asIsValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>As-Is Value ($)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-as-is-value"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="arvOrStabilizedValue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ARV / Stabilized Value (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-arv-stabilized-value"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currentNOI"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current NOI (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-current-noi"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="inPlaceRent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>In-Place Rent (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-in-place-rent"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="proFormaNOI"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pro Forma NOI (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-pro-forma-noi"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="capexBudgetTotal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CapEx Budget Total ($)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-capex-budget-total"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="businessPlanSummary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Business Plan Summary (min 50 characters)</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Describe the business plan, value-add strategy, and timeline..."
                rows={5}
                data-testid="textarea-business-plan-summary"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="primarySponsorName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Primary Sponsor Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Sponsor name" data-testid="input-primary-sponsor-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="primarySponsorExperienceYears"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Years of Experience</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-experience-years"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="numberOfSimilarProjects"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Similar Projects</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-similar-projects"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="netWorth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Net Worth ($)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-net-worth"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="liquidity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Liquidity ($)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-liquidity"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );

  const renderStep4 = () => {
    const requiredDocs = getRequiredDocTypes();
    const optionalDocs = getOptionalDocTypes();

    return (
      <div className="space-y-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xls,.xlsx"
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-file-upload"
        />

        <div>
          <h3 className="text-sm font-semibold mb-1 text-foreground">Required Documents</h3>
          <p className="text-sm text-muted-foreground mb-4">
            PDF, XLS, or XLSX files only. Maximum 25MB each.
          </p>
          <div className="space-y-3">
            {requiredDocs.map((docType) => {
              const doc = uploadedDocs.find((d) => d.docType === docType);
              return (
                <div
                  key={docType}
                  className="flex items-center justify-between gap-4 p-4 border rounded-md"
                  data-testid={`doc-row-${docType}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-doc-label-${docType}`}>
                        {DOC_TYPE_LABELS[docType]}
                      </p>
                      {doc && (
                        <p className="text-xs text-muted-foreground truncate" data-testid={`text-doc-filename-${docType}`}>
                          {doc.file.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc?.uploading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    {doc?.uploaded && (
                      <Badge variant="secondary" data-testid={`badge-uploaded-${docType}`}>
                        <Check className="w-3 h-3 mr-1" />
                        Uploaded
                      </Badge>
                    )}
                    {doc?.uploaded && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeDoc(docType)}
                        data-testid={`button-remove-doc-${docType}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    {!doc && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveDocType(docType);
                          fileInputRef.current?.click();
                        }}
                        data-testid={`button-upload-${docType}`}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        Upload
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-1 text-foreground">Optional Documents</h3>
          <div className="space-y-3">
            {optionalDocs.map((docType) => {
              const doc = uploadedDocs.find((d) => d.docType === docType);
              return (
                <div
                  key={docType}
                  className="flex items-center justify-between gap-4 p-4 border rounded-md"
                  data-testid={`doc-row-${docType}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-doc-label-${docType}`}>
                        {DOC_TYPE_LABELS[docType]}
                      </p>
                      {doc && (
                        <p className="text-xs text-muted-foreground truncate" data-testid={`text-doc-filename-${docType}`}>
                          {doc.file.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc?.uploading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    {doc?.uploaded && (
                      <Badge variant="secondary" data-testid={`badge-uploaded-${docType}`}>
                        <Check className="w-3 h-3 mr-1" />
                        Uploaded
                      </Badge>
                    )}
                    {doc?.uploaded && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeDoc(docType)}
                        data-testid={`button-remove-doc-${docType}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    {!doc && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveDocType(docType);
                          fileInputRef.current?.click();
                        }}
                        data-testid={`button-upload-${docType}`}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        Upload
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderStep5 = () => {
    const values = form.getValues();
    const requiredDocs = getRequiredDocTypes();
    const missingDocs = requiredDocs.filter((dt) => !uploadedDocs.some((d) => d.docType === dt));
    const canSubmit = Object.keys(form.formState.errors).length === 0 && missingDocs.length === 0;

    return (
      <div className="space-y-6">
        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Submitter Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Submitter Type:</span>{" "}
              <span data-testid="review-submitter-type">{values.submitterType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Name:</span>{" "}
              <span data-testid="review-broker-developer-name">{values.brokerOrDeveloperName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Company:</span>{" "}
              <span data-testid="review-company-name">{values.companyName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{" "}
              <span data-testid="review-email">{values.email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Phone:</span>{" "}
              <span data-testid="review-phone">{values.phone}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Role:</span>{" "}
              <span data-testid="review-role">{values.roleOnDeal}</span>
            </div>
          </div>
        </div>

        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Deal Type</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Loan Type:</span>{" "}
              <span data-testid="review-loan-type">{values.loanType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Loan Amount:</span>{" "}
              <span data-testid="review-loan-amount">{formatCurrency(values.requestedLoanAmount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">LTV:</span>{" "}
              <span data-testid="review-ltv">{typeof values.requestedLTV === "number" ? `${values.requestedLTV}%` : "N/A"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">LTC:</span>{" "}
              <span data-testid="review-ltc">{typeof values.requestedLTC === "number" ? `${values.requestedLTC}%` : "N/A"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Interest Only:</span>{" "}
              <span data-testid="review-interest-only">{values.interestOnly ? "Yes" : "No"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Close Date:</span>{" "}
              <span data-testid="review-close-date">{values.desiredCloseDate}</span>
            </div>
            {values.loanType === "BRIDGE" && (
              <>
                <div>
                  <span className="text-muted-foreground">Exit Strategy:</span>{" "}
                  <span data-testid="review-exit-strategy">{values.exitStrategyType}</span>
                </div>
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">Exit Details:</span>{" "}
                  <span data-testid="review-exit-details">{values.exitStrategyDetails}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Property Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Property Name:</span>{" "}
              <span data-testid="review-property-name">{values.propertyName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Address:</span>{" "}
              <span data-testid="review-property-address">{values.propertyAddress}</span>
            </div>
            <div>
              <span className="text-muted-foreground">City/State/ZIP:</span>{" "}
              <span data-testid="review-city-state-zip">{values.city}, {values.state} {values.zip}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Property Type:</span>{" "}
              <span data-testid="review-property-type">{values.propertyType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Occupancy:</span>{" "}
              <span data-testid="review-occupancy-type">{values.occupancyType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{values.propertyType === "MULTIFAMILY" ? "Units" : "Sq Ft"}:</span>{" "}
              <span data-testid="review-units-sqft">{values.unitsOrSqft}</span>
            </div>
            <div>
              <span className="text-muted-foreground">As-Is Value:</span>{" "}
              <span data-testid="review-as-is-value">{formatCurrency(values.asIsValue)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">CapEx Budget:</span>{" "}
              <span data-testid="review-capex">{formatCurrency(values.capexBudgetTotal)}</span>
            </div>
          </div>
        </div>

        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Sponsor Experience</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Sponsor:</span>{" "}
              <span data-testid="review-sponsor-name">{values.primarySponsorName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Experience:</span>{" "}
              <span data-testid="review-experience-years">{values.primarySponsorExperienceYears} years</span>
            </div>
            <div>
              <span className="text-muted-foreground">Similar Projects:</span>{" "}
              <span data-testid="review-similar-projects">{values.numberOfSimilarProjects}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Net Worth:</span>{" "}
              <span data-testid="review-net-worth">{formatCurrency(values.netWorth)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Liquidity:</span>{" "}
              <span data-testid="review-liquidity">{formatCurrency(values.liquidity)}</span>
            </div>
          </div>
        </div>

        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Documents</h3>
          <div className="space-y-2">
            {uploadedDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            ) : (
              uploadedDocs.map((doc) => (
                <div key={doc.docType} className="flex items-center gap-2 text-sm" data-testid={`review-doc-${doc.docType}`}>
                  <Check className="w-4 h-4 text-green-600" />
                  <span>{DOC_TYPE_LABELS[doc.docType]}</span>
                  <span className="text-muted-foreground">- {doc.file.name}</span>
                </div>
              ))
            )}
            {missingDocs.length > 0 && (
              <div className="mt-2 p-3 border border-destructive/30 rounded-md bg-destructive/5" data-testid="missing-docs-warning">
                <p className="text-sm text-destructive font-medium">Missing required documents:</p>
                <ul className="mt-1 space-y-1">
                  {missingDocs.map((dt) => (
                    <li key={dt} className="text-sm text-destructive">{DOC_TYPE_LABELS[dt]}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const stepTitles = [
    { title: "Submitter Information", description: "Tell us about yourself and your role on this deal." },
    { title: "Deal Type & Terms", description: "Specify the loan type and requested terms." },
    { title: "Property Details", description: "Provide details about the subject property." },
    { title: "Sponsor Experience", description: "Tell us about the primary sponsor's background." },
    { title: "Document Uploads", description: "Upload the required supporting documents." },
    { title: "Review & Submit", description: "Review all information and submit your deal." },
  ];

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return null;
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Commercial Deal Submission</h1>
        <p className="text-sm text-muted-foreground mt-1">Complete all steps to submit your commercial loan deal for review.</p>
      </div>

      {renderStepIndicator()}

      <Card>
        <CardHeader>
          <CardTitle data-testid="text-step-title">{stepTitles[currentStep].title}</CardTitle>
          <CardDescription data-testid="text-step-description">{stepTitles[currentStep].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>
              {renderCurrentStep()}
            </form>
          </Form>

          <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t flex-wrap">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0 || isSubmitting}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            {currentStep < 5 ? (
              <Button onClick={handleNext} disabled={isSubmitting} data-testid="button-next">
                Next
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                data-testid="button-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Submit Deal
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
