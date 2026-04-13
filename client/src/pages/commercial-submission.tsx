import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { STANDARD_LOAN_TYPES, STANDARD_PROPERTY_TYPES, LOAN_TYPE_VALUES, PROPERTY_TYPE_VALUES } from "@shared/loanConstants";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatPhoneNumber } from "@/lib/validation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
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
  Calculator,
  Hammer,
  Banknote,
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
  { label: "Deal Terms", icon: DollarSign },
  { label: "Property", icon: Building2 },
  { label: "Financials", icon: Calculator },
  { label: "Construction", icon: Hammer },
  { label: "Sponsor", icon: Users },
  { label: "Debt", icon: Banknote },
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

  loanType: z.enum(LOAN_TYPE_VALUES as [string, ...string[]], { required_error: "Select a loan type" }),
  requestedLoanAmount: z.coerce.number().min(1, "Loan amount is required"),
  requestedLTV: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  requestedLTC: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  interestOnly: z.boolean(),
  desiredCloseDate: z.string().min(1, "Close date is required"),
  exitStrategyType: z.string().optional(),
  exitStrategyDetails: z.string().optional(),
  loanPurpose: z.string().optional(),
  requestedLoanTerm: z.string().optional(),
  closingTimeline: z.string().optional(),

  propertyName: z.string().min(1, "Property name is required"),
  propertyAddress: z.string().min(1, "Property address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().length(2, "Select a state"),
  zip: z.string().min(5, "ZIP code is required"),
  propertyType: z.enum(PROPERTY_TYPE_VALUES as [string, ...string[]], { required_error: "Select property type" }),
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
  county: z.string().optional(),
  squareFootage: z.coerce.number().optional().or(z.literal("")),
  currentOccupancy: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  propertyCondition: z.string().optional(),
  deferredMaintenanceEstimate: z.coerce.number().optional().or(z.literal("")),
  deferredMaintenancePercent: z.coerce.number().optional().or(z.literal("")),
  environmentalIssues: z.boolean(),
  environmentalDescription: z.string().optional(),
  zoning: z.string().optional(),
  zoningCompliant: z.string().optional(),

  currentAnnualDebtService: z.coerce.number().optional().or(z.literal("")),
  marketRentPsf: z.coerce.number().optional().or(z.literal("")),
  propertyTaxesAnnual: z.coerce.number().optional().or(z.literal("")),
  insuranceAnnual: z.coerce.number().optional().or(z.literal("")),
  numberOfUnits: z.coerce.number().optional().or(z.literal("")),
  unitMixStudios: z.coerce.number().optional().or(z.literal("")),
  unitMix1br: z.coerce.number().optional().or(z.literal("")),
  unitMix2br: z.coerce.number().optional().or(z.literal("")),
  unitMix3br: z.coerce.number().optional().or(z.literal("")),
  averageRent: z.coerce.number().optional().or(z.literal("")),
  marketRent: z.coerce.number().optional().or(z.literal("")),
  numberOfTenants: z.coerce.number().optional().or(z.literal("")),
  largestTenant: z.string().optional(),
  largestTenantPercent: z.coerce.number().optional().or(z.literal("")),
  averageLeaseTermRemaining: z.string().optional(),
  tenantCreditQuality: z.string().optional(),

  totalProjectCost: z.coerce.number().optional().or(z.literal("")),
  landAcquisitionCost: z.coerce.number().optional().or(z.literal("")),
  hardCosts: z.coerce.number().optional().or(z.literal("")),
  softCosts: z.coerce.number().optional().or(z.literal("")),
  contingency: z.coerce.number().optional().or(z.literal("")),
  contingencyPercent: z.coerce.number().optional().or(z.literal("")),
  projectTimeline: z.string().optional(),
  constructionStartDate: z.string().optional(),
  stabilizationDate: z.string().optional(),
  generalContractor: z.string().optional(),
  gcLicensedBonded: z.string().optional(),

  primarySponsorName: z.string().min(1, "Sponsor name is required"),
  primarySponsorExperienceYears: z.coerce.number().min(0, "Experience years is required"),
  numberOfSimilarProjects: z.coerce.number().min(0, "Number of projects is required"),
  netWorth: z.coerce.number().min(0, "Net worth is required"),
  liquidity: z.coerce.number().min(0, "Liquidity is required"),
  entityName: z.string().optional(),
  entityType: z.string().optional(),
  entityDateEstablished: z.string().optional(),
  ownershipStructure: z.string().optional(),
  sponsorCreditScore: z.string().optional(),
  personalLiquidity: z.coerce.number().optional().or(z.literal("")),
  personalNetWorth: z.coerce.number().optional().or(z.literal("")),
  totalUnitsSfOwned: z.coerce.number().optional().or(z.literal("")),
  currentPortfolioValue: z.coerce.number().optional().or(z.literal("")),
  similarDealsLast3Years: z.coerce.number().optional().or(z.literal("")),
  everDefaulted: z.boolean(),
  defaultExplanation: z.string().optional(),
  currentLitigation: z.boolean(),
  litigationExplanation: z.string().optional(),
  bankruptcyLast7Years: z.boolean(),
  bankruptcyExplanation: z.string().optional(),

  currentLender: z.string().optional(),
  currentLoanBalance: z.coerce.number().optional().or(z.literal("")),
  currentInterestRate: z.coerce.number().optional().or(z.literal("")),
  loanMaturityDate: z.string().optional(),
  prepaymentPenalty: z.string().optional(),
  additionalNotes: z.string().optional(),
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
  if (["Bridge", "Fix & Flip", "Construction", "A&D", "Land Development"].includes(data.loanType)) {
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

function formatCurrency(value: number | undefined | string): string {
  if (value === undefined || value === null || value === "") return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
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
      loanPurpose: "",
      requestedLoanTerm: "",
      closingTimeline: "",
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
      county: "",
      squareFootage: "",
      currentOccupancy: "",
      propertyCondition: "",
      deferredMaintenanceEstimate: "",
      deferredMaintenancePercent: "",
      environmentalIssues: false,
      environmentalDescription: "",
      zoning: "",
      zoningCompliant: "",
      currentAnnualDebtService: "",
      marketRentPsf: "",
      propertyTaxesAnnual: "",
      insuranceAnnual: "",
      numberOfUnits: "",
      unitMixStudios: "",
      unitMix1br: "",
      unitMix2br: "",
      unitMix3br: "",
      averageRent: "",
      marketRent: "",
      numberOfTenants: "",
      largestTenant: "",
      largestTenantPercent: "",
      averageLeaseTermRemaining: "",
      tenantCreditQuality: "",
      totalProjectCost: "",
      landAcquisitionCost: "",
      hardCosts: "",
      softCosts: "",
      contingency: "",
      contingencyPercent: "",
      projectTimeline: "",
      constructionStartDate: "",
      stabilizationDate: "",
      generalContractor: "",
      gcLicensedBonded: "",
      primarySponsorName: "",
      primarySponsorExperienceYears: "" as unknown as number,
      numberOfSimilarProjects: "" as unknown as number,
      netWorth: "" as unknown as number,
      liquidity: "" as unknown as number,
      entityName: "",
      entityType: "",
      entityDateEstablished: "",
      ownershipStructure: "",
      sponsorCreditScore: "",
      personalLiquidity: "",
      personalNetWorth: "",
      totalUnitsSfOwned: "",
      currentPortfolioValue: "",
      similarDealsLast3Years: "",
      everDefaulted: false,
      defaultExplanation: "",
      currentLitigation: false,
      litigationExplanation: "",
      bankruptcyLast7Years: false,
      bankruptcyExplanation: "",
      currentLender: "",
      currentLoanBalance: "",
      currentInterestRate: "",
      loanMaturityDate: "",
      prepaymentPenalty: "",
      additionalNotes: "",
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

  const urlPrefillDone = useRef(false);
  useEffect(() => {
    if (!urlPrefillDone.current) {
      urlPrefillDone.current = true;
      const searchParams = new URLSearchParams(window.location.search);
      const preScreenAssetClass = searchParams.get("assetClass");
      const preScreenDealType = searchParams.get("dealType");
      const preScreenState = searchParams.get("state");
      const preScreenLoanAmount = searchParams.get("loanAmount");
      const preScreenCreditScore = searchParams.get("creditScore");

      if (preScreenAssetClass) {
        const mapping: Record<string, string> = {
          "single-family-residence": "Residential",
          "2-4-unit": "Multifamily",
          "multifamily-5-plus": "Multifamily",
          "rental-portfolio": "Residential",
          "mixed-use": "Mixed Use",
          "infill-lot": "Land",
          land: "Land",
          office: "Office",
          retail: "Retail",
          hospitality: "Hospitality",
          industrial: "Industrial",
          medical: "Office",
          agricultural: "Land",
          "special-purpose": "Industrial",
          multifamily: "Multifamily",
          residential: "Residential",
          development: "Development",
          "student-housing": "Student Housing",
          "self-storage": "Self-Storage",
        };
        const mapped = mapping[preScreenAssetClass.toLowerCase()] || preScreenAssetClass;
        if (PROPERTY_TYPE_VALUES.includes(mapped)) {
          form.setValue("propertyType", mapped as any);
        }
      }
      if (preScreenDealType) {
        const dtMapping: Record<string, string> = {
          bridge: "Bridge",
          construction: "Construction",
          dscr: "DSCR",
          "a&d": "A&D",
          "fix-and-flip": "Fix & Flip",
          "fix_and_flip": "Fix & Flip",
          long_term: "Long-Term Financing",
          longterm: "Long-Term Financing",
          permanent: "Long-Term Financing",
          "land-development": "Land Development",
          "land_development": "Land Development",
        };
        const mapped = dtMapping[preScreenDealType.toLowerCase()] || preScreenDealType;
        if (LOAN_TYPE_VALUES.includes(mapped)) {
          form.setValue("loanType", mapped as any);
        }
      }
      if (preScreenState && preScreenState.length === 2) {
        form.setValue("state", preScreenState.toUpperCase());
      }
      if (preScreenLoanAmount) {
        const amt = parseFloat(preScreenLoanAmount);
        if (!isNaN(amt) && amt > 0) {
          form.setValue("requestedLoanAmount", amt);
        }
      }
      if (preScreenCreditScore) {
        form.setValue("sponsorCreditScore", preScreenCreditScore);
      }
    }
  }, []);

  const watchedLoanType = form.watch("loanType");
  const watchedPropertyType = form.watch("propertyType");
  const watchedOccupancyType = form.watch("occupancyType");
  const watchedEnvironmentalIssues = form.watch("environmentalIssues");
  const watchedEverDefaulted = form.watch("everDefaulted");
  const watchedCurrentLitigation = form.watch("currentLitigation");
  const watchedBankruptcyLast7Years = form.watch("bankruptcyLast7Years");

  const unitsLabel = watchedPropertyType === "Multifamily" ? "Units" : "Sq Ft";
  const shortTermLoanTypes = ["Bridge", "Fix & Flip", "Construction", "A&D", "Land Development"];

  const isConstructionStep = watchedOccupancyType === "GROUND_UP" || shortTermLoanTypes.includes(watchedLoanType);

  const getRequiredDocTypes = (): DocType[] => {
    const required: DocType[] = ["SREO", "PFS", "BUDGET"];
    if (shortTermLoanTypes.includes(watchedLoanType)) {
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
    1: ["loanType", "requestedLoanAmount", "requestedLTV", "requestedLTC", "interestOnly", "desiredCloseDate", "exitStrategyType", "exitStrategyDetails", "loanPurpose", "requestedLoanTerm", "closingTimeline"],
    2: ["propertyName", "propertyAddress", "city", "state", "zip", "propertyType", "occupancyType", "unitsOrSqft", "yearBuilt", "purchasePrice", "asIsValue", "arvOrStabilizedValue", "currentNOI", "inPlaceRent", "proFormaNOI", "capexBudgetTotal", "businessPlanSummary", "county", "squareFootage", "currentOccupancy", "propertyCondition", "deferredMaintenanceEstimate", "deferredMaintenancePercent", "environmentalIssues", "environmentalDescription", "zoning", "zoningCompliant"],
    3: ["currentAnnualDebtService", "marketRentPsf", "propertyTaxesAnnual", "insuranceAnnual", "numberOfUnits", "unitMixStudios", "unitMix1br", "unitMix2br", "unitMix3br", "averageRent", "marketRent", "numberOfTenants", "largestTenant", "largestTenantPercent", "averageLeaseTermRemaining", "tenantCreditQuality"],
    4: ["totalProjectCost", "landAcquisitionCost", "hardCosts", "softCosts", "contingency", "contingencyPercent", "projectTimeline", "constructionStartDate", "stabilizationDate", "generalContractor", "gcLicensedBonded"],
    5: ["primarySponsorName", "primarySponsorExperienceYears", "numberOfSimilarProjects", "netWorth", "liquidity", "entityName", "entityType", "entityDateEstablished", "ownershipStructure", "sponsorCreditScore", "personalLiquidity", "personalNetWorth", "totalUnitsSfOwned", "currentPortfolioValue", "similarDealsLast3Years", "everDefaulted", "defaultExplanation", "currentLitigation", "litigationExplanation", "bankruptcyLast7Years", "bankruptcyExplanation"],
    6: ["currentLender", "currentLoanBalance", "currentInterestRate", "loanMaturityDate", "prepaymentPenalty", "additionalNotes"],
  };

  const validateStep = async (step: number): Promise<boolean> => {
    if (step === 3 || step === 4 || step === 6 || step === 7 || step === 8) return true;
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
    if (currentStep === 7 && !allRequiredDocsUploaded()) {
      toast({ title: "Missing Documents", description: "Please upload all required documents before continuing.", variant: "destructive" });
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, 8));
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
      const { uploadURL, objectPath, useDirectUpload } = await urlRes.json();

      let finalObjectPath = objectPath;

      if (useDirectUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const directRes = await fetch("/api/uploads/direct", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!directRes.ok) throw new Error("Failed to upload file");
        const directData = await directRes.json();
        finalObjectPath = directData.objectPath;
      } else {
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!putRes.ok) throw new Error("Failed to upload file");
      }

      setUploadedDocs((prev) =>
        prev.map((d) =>
          d.docType === activeDocType ? { ...d, objectPath: finalObjectPath, uploaded: true, uploading: false } : d
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

      const toNum = (v: any) => (typeof v === "number" ? v : null);
      const toStr = (v: any) => (v && typeof v === "string" && v.length > 0 ? v : null);

      const submissionData = {
        submitterType: values.submitterType,
        brokerOrDeveloperName: values.brokerOrDeveloperName,
        companyName: values.companyName,
        email: values.email,
        phone: values.phone,
        roleOnDeal: values.roleOnDeal,
        loanType: values.loanType,
        requestedLoanAmount: values.requestedLoanAmount,
        requestedLTV: toNum(values.requestedLTV),
        requestedLTC: toNum(values.requestedLTC),
        interestOnly: values.interestOnly,
        desiredCloseDate: new Date(values.desiredCloseDate).toISOString(),
        exitStrategyType: ["Bridge", "Fix & Flip", "Construction", "A&D", "Land Development"].includes(values.loanType) ? toStr(values.exitStrategyType) : null,
        exitStrategyDetails: ["Bridge", "Fix & Flip", "Construction", "A&D", "Land Development"].includes(values.loanType) ? toStr(values.exitStrategyDetails) : null,
        loanPurpose: toStr(values.loanPurpose),
        requestedLoanTerm: toStr(values.requestedLoanTerm),
        closingTimeline: toStr(values.closingTimeline),
        propertyName: values.propertyName,
        propertyAddress: values.propertyAddress,
        city: values.city,
        state: values.state,
        zip: values.zip,
        propertyType: values.propertyType,
        occupancyType: values.occupancyType,
        unitsOrSqft: values.unitsOrSqft,
        yearBuilt: toNum(values.yearBuilt),
        purchasePrice: toNum(values.purchasePrice),
        asIsValue: values.asIsValue,
        arvOrStabilizedValue: toNum(values.arvOrStabilizedValue),
        currentNOI: toNum(values.currentNOI),
        inPlaceRent: toNum(values.inPlaceRent),
        proFormaNOI: toNum(values.proFormaNOI),
        capexBudgetTotal: values.capexBudgetTotal,
        businessPlanSummary: values.businessPlanSummary,
        county: toStr(values.county),
        squareFootage: toNum(values.squareFootage),
        currentOccupancy: toNum(values.currentOccupancy),
        propertyCondition: toStr(values.propertyCondition),
        deferredMaintenanceEstimate: toNum(values.deferredMaintenanceEstimate),
        deferredMaintenancePercent: toNum(values.deferredMaintenancePercent),
        environmentalIssues: values.environmentalIssues,
        environmentalDescription: values.environmentalIssues ? toStr(values.environmentalDescription) : null,
        zoning: toStr(values.zoning),
        zoningCompliant: toStr(values.zoningCompliant),
        currentAnnualDebtService: toNum(values.currentAnnualDebtService),
        marketRentPsf: toNum(values.marketRentPsf),
        propertyTaxesAnnual: toNum(values.propertyTaxesAnnual),
        insuranceAnnual: toNum(values.insuranceAnnual),
        numberOfUnits: toNum(values.numberOfUnits),
        unitMixStudios: toNum(values.unitMixStudios),
        unitMix1br: toNum(values.unitMix1br),
        unitMix2br: toNum(values.unitMix2br),
        unitMix3br: toNum(values.unitMix3br),
        averageRent: toNum(values.averageRent),
        marketRent: toNum(values.marketRent),
        numberOfTenants: toNum(values.numberOfTenants),
        largestTenant: toStr(values.largestTenant),
        largestTenantPercent: toNum(values.largestTenantPercent),
        averageLeaseTermRemaining: toStr(values.averageLeaseTermRemaining),
        tenantCreditQuality: toStr(values.tenantCreditQuality),
        totalProjectCost: toNum(values.totalProjectCost),
        landAcquisitionCost: toNum(values.landAcquisitionCost),
        hardCosts: toNum(values.hardCosts),
        softCosts: toNum(values.softCosts),
        contingency: toNum(values.contingency),
        contingencyPercent: toNum(values.contingencyPercent),
        projectTimeline: toStr(values.projectTimeline),
        constructionStartDate: toStr(values.constructionStartDate),
        stabilizationDate: toStr(values.stabilizationDate),
        generalContractor: toStr(values.generalContractor),
        gcLicensedBonded: toStr(values.gcLicensedBonded),
        primarySponsorName: values.primarySponsorName,
        primarySponsorExperienceYears: values.primarySponsorExperienceYears,
        numberOfSimilarProjects: values.numberOfSimilarProjects,
        netWorth: values.netWorth,
        liquidity: values.liquidity,
        entityName: toStr(values.entityName),
        entityType: toStr(values.entityType),
        entityDateEstablished: toStr(values.entityDateEstablished),
        ownershipStructure: toStr(values.ownershipStructure),
        sponsorCreditScore: toStr(values.sponsorCreditScore),
        personalLiquidity: toNum(values.personalLiquidity),
        personalNetWorth: toNum(values.personalNetWorth),
        totalUnitsSfOwned: toNum(values.totalUnitsSfOwned),
        currentPortfolioValue: toNum(values.currentPortfolioValue),
        similarDealsLast3Years: toNum(values.similarDealsLast3Years),
        everDefaulted: values.everDefaulted,
        defaultExplanation: values.everDefaulted ? toStr(values.defaultExplanation) : null,
        currentLitigation: values.currentLitigation,
        litigationExplanation: values.currentLitigation ? toStr(values.litigationExplanation) : null,
        bankruptcyLast7Years: values.bankruptcyLast7Years,
        bankruptcyExplanation: values.bankruptcyLast7Years ? toStr(values.bankruptcyExplanation) : null,
        currentLender: toStr(values.currentLender),
        currentLoanBalance: toNum(values.currentLoanBalance),
        currentInterestRate: toNum(values.currentInterestRate),
        loanMaturityDate: toStr(values.loanMaturityDate),
        prepaymentPenalty: toStr(values.prepaymentPenalty),
        additionalNotes: toStr(values.additionalNotes),
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
          <div key={idx} className="flex flex-col items-center min-w-[70px] flex-1">
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
                <Input {...field} type="tel" placeholder="(555) 123-4567" data-testid="input-phone" onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))} />
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
                  {STANDARD_LOAN_TYPES.map(lt => (
                    <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>
                  ))}
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
        <FormField
          control={form.control}
          name="loanPurpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Loan Purpose (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Acquisition, Refinance" data-testid="input-loan-purpose" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="requestedLoanTerm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requested Loan Term (optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-requested-loan-term">
                    <SelectValue placeholder="Select term" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="12 months">12 months</SelectItem>
                  <SelectItem value="24 months">24 months</SelectItem>
                  <SelectItem value="36 months">36 months</SelectItem>
                  <SelectItem value="5 years">5 years</SelectItem>
                  <SelectItem value="7 years">7 years</SelectItem>
                  <SelectItem value="10 years">10 years</SelectItem>
                  <SelectItem value="15 years">15 years</SelectItem>
                  <SelectItem value="30 years">30 years</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="closingTimeline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Closing Timeline (optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-closing-timeline">
                    <SelectValue placeholder="Select timeline" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="30 days">30 days</SelectItem>
                  <SelectItem value="45 days">45 days</SelectItem>
                  <SelectItem value="60 days">60 days</SelectItem>
                  <SelectItem value="90 days">90 days</SelectItem>
                  <SelectItem value="120+ days">120+ days</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {shortTermLoanTypes.includes(watchedLoanType) && (
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
                <AddressAutocomplete {...field} placeholder="123 Main St" />
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
          name="county"
          render={({ field }) => (
            <FormItem>
              <FormLabel>County (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="County name" data-testid="input-county" />
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
                  {STANDARD_PROPERTY_TYPES.map(pt => (
                    <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                  ))}
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
          name="squareFootage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Square Footage (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-square-footage"
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
          name="currentOccupancy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Occupancy % (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g. 95"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-current-occupancy"
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
          name="propertyCondition"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property Condition (optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-property-condition">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Excellent">Excellent</SelectItem>
                  <SelectItem value="Good">Good</SelectItem>
                  <SelectItem value="Fair">Fair</SelectItem>
                  <SelectItem value="Poor">Poor</SelectItem>
                </SelectContent>
              </Select>
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
        <FormField
          control={form.control}
          name="deferredMaintenanceEstimate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deferred Maintenance $ (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-deferred-maintenance-estimate"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="deferredMaintenancePercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deferred Maintenance % (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-deferred-maintenance-percent"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="zoning"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Zoning (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. C-2, R-3" data-testid="input-zoning" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="zoningCompliant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Zoning Compliant (optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-zoning-compliant">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="environmentalIssues"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Environmental Issues</FormLabel>
              <Select
                onValueChange={(v) => field.onChange(v === "true")}
                value={field.value ? "true" : "false"}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-environmental-issues">
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
      </div>
      {watchedEnvironmentalIssues && (
        <FormField
          control={form.control}
          name="environmentalDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Environmental Issues Description</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Describe the environmental issues..."
                  rows={3}
                  data-testid="textarea-environmental-description"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
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
      <div>
        <h3 className="text-sm font-semibold mb-3 text-foreground">Income & Expenses</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="currentAnnualDebtService"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Annual Debt Service ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-current-annual-debt-service"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="marketRentPsf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Market Rent PSF ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-market-rent-psf"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="propertyTaxesAnnual"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Property Taxes Annual ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-property-taxes-annual"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="insuranceAnnual"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Insurance Annual ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-insurance-annual"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {watchedPropertyType === "Multifamily" && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Unit Mix</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="numberOfUnits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Units</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-number-of-units"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unitMixStudios"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Studios</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-unit-mix-studios"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unitMix1br"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>1 Bedroom</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-unit-mix-1br"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unitMix2br"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>2 Bedroom</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-unit-mix-2br"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unitMix3br"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>3+ Bedroom</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-unit-mix-3br"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="averageRent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Average Rent ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-average-rent"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="marketRent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Market Rent ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-market-rent"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      )}

      {(watchedPropertyType === "OFFICE" || watchedPropertyType === "RETAIL" || watchedPropertyType === "INDUSTRIAL") && (
        <div className="pt-4 border-t">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Tenant Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="numberOfTenants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Tenants</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-number-of-tenants"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="largestTenant"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Largest Tenant</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Tenant name" data-testid="input-largest-tenant" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="largestTenantPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Largest Tenant % of Space</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                      data-testid="input-largest-tenant-percent"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="averageLeaseTermRemaining"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avg Lease Term Remaining</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. 3 years" data-testid="input-average-lease-term-remaining" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tenantCreditQuality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tenant Credit Quality</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-tenant-credit-quality">
                        <SelectValue placeholder="Select quality" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Investment Grade">Investment Grade</SelectItem>
                      <SelectItem value="National">National</SelectItem>
                      <SelectItem value="Regional">Regional</SelectItem>
                      <SelectItem value="Local">Local</SelectItem>
                      <SelectItem value="Mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => {
    if (!isConstructionStep) {
      return (
        <div className="py-8 text-center">
          <p className="text-muted-foreground" data-testid="text-construction-not-applicable">
            This section is only applicable for construction or bridge loans.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="totalProjectCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total Deal Cost ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-total-project-cost"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="landAcquisitionCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Land Acquisition Cost ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-land-acquisition-cost"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hardCosts"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hard Costs ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-hard-costs"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="softCosts"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Soft Costs ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-soft-costs"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contingency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contingency ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-contingency"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contingencyPercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contingency %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-contingency-percent"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="projectTimeline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project Timeline</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. 18 months" data-testid="input-project-timeline" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="constructionStartDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Construction Start Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    data-testid="input-construction-start-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="stabilizationDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stabilization Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    data-testid="input-stabilization-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="generalContractor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>General Contractor</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Contractor name" data-testid="input-general-contractor" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gcLicensedBonded"
            render={({ field }) => (
              <FormItem>
                <FormLabel>GC Licensed & Bonded</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-gc-licensed-bonded">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    );
  };

  const renderStep5 = () => (
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

      <div className="pt-4 border-t">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Entity Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="entityName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entity Name (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Entity name" data-testid="input-entity-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="entityType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entity Type (optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="LLC">LLC</SelectItem>
                    <SelectItem value="LP">LP</SelectItem>
                    <SelectItem value="Corp">Corp</SelectItem>
                    <SelectItem value="Trust">Trust</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="entityDateEstablished"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date Established (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    data-testid="input-entity-date-established"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="mt-4">
          <FormField
            control={form.control}
            name="ownershipStructure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ownership Structure (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Describe the ownership structure..."
                    rows={3}
                    data-testid="textarea-ownership-structure"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <div className="pt-4 border-t">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Financial Background</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="sponsorCreditScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Credit Score Range (optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-sponsor-credit-score">
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Below 600">Below 600</SelectItem>
                    <SelectItem value="600-649">600-649</SelectItem>
                    <SelectItem value="650-699">650-699</SelectItem>
                    <SelectItem value="700-749">700-749</SelectItem>
                    <SelectItem value="750+">750+</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="personalLiquidity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Personal Liquidity ($) (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-personal-liquidity"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="personalNetWorth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Personal Net Worth ($) (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-personal-net-worth"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="totalUnitsSfOwned"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total Units/SF Owned (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-total-units-sf-owned"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currentPortfolioValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Portfolio Value ($) (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-current-portfolio-value"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="similarDealsLast3Years"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Similar Deals Last 3 Years (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                    data-testid="input-similar-deals-last-3-years"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <div className="pt-4 border-t">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Legal / Credit History</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="everDefaulted"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ever Defaulted on a Loan?</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "true")}
                  value={field.value ? "true" : "false"}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-ever-defaulted">
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
            name="currentLitigation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Litigation?</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "true")}
                  value={field.value ? "true" : "false"}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-current-litigation">
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
            name="bankruptcyLast7Years"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bankruptcy Last 7 Years?</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "true")}
                  value={field.value ? "true" : "false"}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-bankruptcy-last-7-years">
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
        </div>
        {watchedEverDefaulted && (
          <div className="mt-4">
            <FormField
              control={form.control}
              name="defaultExplanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Explanation</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Please explain the default..."
                      rows={3}
                      data-testid="textarea-default-explanation"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
        {watchedCurrentLitigation && (
          <div className="mt-4">
            <FormField
              control={form.control}
              name="litigationExplanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Litigation Explanation</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Please explain the litigation..."
                      rows={3}
                      data-testid="textarea-litigation-explanation"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
        {watchedBankruptcyLast7Years && (
          <div className="mt-4">
            <FormField
              control={form.control}
              name="bankruptcyExplanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bankruptcy Explanation</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Please explain the bankruptcy..."
                      rows={3}
                      data-testid="textarea-bankruptcy-explanation"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="currentLender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Lender (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Lender name" data-testid="input-current-lender" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currentLoanBalance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Loan Balance ($)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-current-loan-balance"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currentInterestRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Interest Rate (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? "" : e.target.value)}
                  data-testid="input-current-interest-rate"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="loanMaturityDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Loan Maturity Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  data-testid="input-loan-maturity-date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="prepaymentPenalty"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prepayment Penalty</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-prepayment-penalty">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="Yield Maintenance">Yield Maintenance</SelectItem>
                  <SelectItem value="Defeasance">Defeasance</SelectItem>
                  <SelectItem value="Step-Down">Step-Down</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="additionalNotes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Additional Notes (optional)</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Any additional information about existing debt..."
                rows={4}
                data-testid="textarea-additional-notes"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  const renderStep7 = () => {
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

  const renderStep8 = () => {
    const values = form.getValues();
    const requiredDocs = getRequiredDocTypes();
    const missingDocs = requiredDocs.filter((dt) => !uploadedDocs.some((d) => d.docType === dt));

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
          <h3 className="text-sm font-semibold text-foreground">Deal Terms</h3>
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
            {values.loanPurpose && (
              <div>
                <span className="text-muted-foreground">Loan Purpose:</span>{" "}
                <span data-testid="review-loan-purpose">{values.loanPurpose}</span>
              </div>
            )}
            {values.requestedLoanTerm && (
              <div>
                <span className="text-muted-foreground">Loan Term:</span>{" "}
                <span data-testid="review-loan-term">{values.requestedLoanTerm}</span>
              </div>
            )}
            {values.closingTimeline && (
              <div>
                <span className="text-muted-foreground">Closing Timeline:</span>{" "}
                <span data-testid="review-closing-timeline">{values.closingTimeline}</span>
              </div>
            )}
            {["Bridge", "Fix & Flip", "Construction", "A&D", "Land Development"].includes(values.loanType) && (
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
            {values.county && (
              <div>
                <span className="text-muted-foreground">County:</span>{" "}
                <span data-testid="review-county">{values.county}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Property Type:</span>{" "}
              <span data-testid="review-property-type">{values.propertyType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Occupancy:</span>{" "}
              <span data-testid="review-occupancy-type">{values.occupancyType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{values.propertyType === "Multifamily" ? "Units" : "Sq Ft"}:</span>{" "}
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
            {values.propertyCondition && (
              <div>
                <span className="text-muted-foreground">Condition:</span>{" "}
                <span data-testid="review-property-condition">{values.propertyCondition}</span>
              </div>
            )}
            {typeof values.currentOccupancy === "number" && (
              <div>
                <span className="text-muted-foreground">Occupancy %:</span>{" "}
                <span data-testid="review-current-occupancy">{values.currentOccupancy}%</span>
              </div>
            )}
            {values.environmentalIssues && (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Environmental Issues:</span>{" "}
                <span data-testid="review-environmental">{values.environmentalDescription || "Yes"}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Financial Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {typeof values.propertyTaxesAnnual === "number" && (
              <div>
                <span className="text-muted-foreground">Property Taxes:</span>{" "}
                <span data-testid="review-property-taxes">{formatCurrency(values.propertyTaxesAnnual)}</span>
              </div>
            )}
            {typeof values.insuranceAnnual === "number" && (
              <div>
                <span className="text-muted-foreground">Insurance:</span>{" "}
                <span data-testid="review-insurance">{formatCurrency(values.insuranceAnnual)}</span>
              </div>
            )}
            {typeof values.currentAnnualDebtService === "number" && (
              <div>
                <span className="text-muted-foreground">Annual Debt Service:</span>{" "}
                <span data-testid="review-debt-service">{formatCurrency(values.currentAnnualDebtService)}</span>
              </div>
            )}
          </div>
        </div>

        {isConstructionStep && (
          <div className="border rounded-md p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Construction Budget</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {typeof values.totalProjectCost === "number" && (
                <div>
                  <span className="text-muted-foreground">Total Project Cost:</span>{" "}
                  <span data-testid="review-total-project-cost">{formatCurrency(values.totalProjectCost)}</span>
                </div>
              )}
              {typeof values.hardCosts === "number" && (
                <div>
                  <span className="text-muted-foreground">Hard Costs:</span>{" "}
                  <span data-testid="review-hard-costs">{formatCurrency(values.hardCosts)}</span>
                </div>
              )}
              {typeof values.softCosts === "number" && (
                <div>
                  <span className="text-muted-foreground">Soft Costs:</span>{" "}
                  <span data-testid="review-soft-costs">{formatCurrency(values.softCosts)}</span>
                </div>
              )}
              {values.generalContractor && (
                <div>
                  <span className="text-muted-foreground">General Contractor:</span>{" "}
                  <span data-testid="review-general-contractor">{values.generalContractor}</span>
                </div>
              )}
              {values.projectTimeline && (
                <div>
                  <span className="text-muted-foreground">Timeline:</span>{" "}
                  <span data-testid="review-project-timeline">{values.projectTimeline}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Sponsor & Entity</h3>
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
            {values.entityName && (
              <div>
                <span className="text-muted-foreground">Entity:</span>{" "}
                <span data-testid="review-entity-name">{values.entityName}</span>
              </div>
            )}
            {values.entityType && (
              <div>
                <span className="text-muted-foreground">Entity Type:</span>{" "}
                <span data-testid="review-entity-type">{values.entityType}</span>
              </div>
            )}
            {values.sponsorCreditScore && (
              <div>
                <span className="text-muted-foreground">Credit Score:</span>{" "}
                <span data-testid="review-credit-score">{values.sponsorCreditScore}</span>
              </div>
            )}
            {values.everDefaulted && (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Default History:</span>{" "}
                <span data-testid="review-default-history">Yes - {values.defaultExplanation || "No details"}</span>
              </div>
            )}
            {values.currentLitigation && (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Litigation:</span>{" "}
                <span data-testid="review-litigation">Yes - {values.litigationExplanation || "No details"}</span>
              </div>
            )}
            {values.bankruptcyLast7Years && (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Bankruptcy:</span>{" "}
                <span data-testid="review-bankruptcy">Yes - {values.bankruptcyExplanation || "No details"}</span>
              </div>
            )}
          </div>
        </div>

        {(values.currentLender || typeof values.currentLoanBalance === "number") && (
          <div className="border rounded-md p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Existing Debt</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {values.currentLender && (
                <div>
                  <span className="text-muted-foreground">Current Lender:</span>{" "}
                  <span data-testid="review-current-lender">{values.currentLender}</span>
                </div>
              )}
              {typeof values.currentLoanBalance === "number" && (
                <div>
                  <span className="text-muted-foreground">Loan Balance:</span>{" "}
                  <span data-testid="review-loan-balance">{formatCurrency(values.currentLoanBalance)}</span>
                </div>
              )}
              {typeof values.currentInterestRate === "number" && (
                <div>
                  <span className="text-muted-foreground">Interest Rate:</span>{" "}
                  <span data-testid="review-current-rate">{values.currentInterestRate}%</span>
                </div>
              )}
              {values.loanMaturityDate && (
                <div>
                  <span className="text-muted-foreground">Maturity Date:</span>{" "}
                  <span data-testid="review-maturity-date">{values.loanMaturityDate}</span>
                </div>
              )}
              {values.prepaymentPenalty && (
                <div>
                  <span className="text-muted-foreground">Prepayment Penalty:</span>{" "}
                  <span data-testid="review-prepayment-penalty">{values.prepaymentPenalty}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Documents</h3>
          <div className="space-y-2">
            {uploadedDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            ) : (
              uploadedDocs.map((doc) => (
                <div key={doc.docType} className="flex items-center gap-2 text-sm" data-testid={`review-doc-${doc.docType}`}>
                  <Check className="w-4 h-4 text-success" />
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
    { title: "Property Details & Condition", description: "Provide details about the subject property." },
    { title: "Financial Details", description: "Income, expenses, and tenant information." },
    { title: "Construction Budget", description: "Budget details for construction or bridge loans." },
    { title: "Sponsor & Entity", description: "Tell us about the sponsor, entity, and background." },
    { title: "Existing Debt", description: "Details about any existing debt on the property." },
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
      case 6: return renderStep6();
      case 7: return renderStep7();
      case 8: return renderStep8();
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

            {currentStep < 8 ? (
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
