import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, Edit, Star, ArrowLeft, Save, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown, X, FileText, Info, Maximize2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { QuotePdfTemplate, QuotePdfTemplateConfig as TemplateConfig, QuotePdfSection, LoiDefaults } from "@shared/schema";

const DEFAULT_CONFIG: TemplateConfig = {
  companyName: "LENDRY AI",
  tagline: "Lending Intelligence",
  logoUrl: "",
  primaryColor: "#0F1729",
  accentColor: "#C9A84C",
  headerText: "Loan Quote",
  footerDisclaimer: "This rate is an estimate based on the information provided. Final approval is subject to full underwriting and verification of all documents. Rates are subject to change without notice.",
  sections: [
    {
      key: "loan_summary",
      label: "Loan Summary",
      enabled: true,
      fields: [
        { key: "loanAmount", label: "Loan Amount", aliases: ["requestedLoanAmount", "loan_amount"] },
        { key: "propertyValue", label: "Property Value", aliases: ["estValuePurchasePrice", "estimatedValue", "purchasePrice"] },
        { key: "ltv", label: "LTV", aliases: ["ltvRatio", "requestedLTV"] },
        { key: "ficoScore", label: "FICO Score", aliases: ["statedFicoScore", "creditScore", "fico"] },
        { key: "loanType", label: "Program", aliases: ["programName", "program"] },
        { key: "propertyType", label: "Property Type" },
      ],
    },
    {
      key: "borrower_info",
      label: "Borrower Information",
      enabled: true,
      fields: [
        { key: "customerName", label: "Borrower Name" },
        { key: "propertyAddress", label: "Property Address" },
        { key: "customerCompanyName", label: "Entity Name", aliases: ["entityName", "companyName"] },
      ],
    },
    {
      key: "pricing",
      label: "Rate & Pricing",
      enabled: true,
      fields: [
        { key: "interestRate", label: "Interest Rate" },
        { key: "pointsCharged", label: "Total Points" },
        { key: "pointsAmount", label: "Points Amount" },
      ],
    },
  ],
  showYsp: false,
  showPoints: true,
  showCommission: false,
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function LoiPreviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex border-b border-gray-200 last:border-b-0">
      <div className="w-[45%] py-0.5 px-1.5 text-[9px] text-muted-foreground border-r border-gray-200">{label}</div>
      <div className="w-[55%] py-0.5 px-1.5 text-[9px] font-medium">{value || "—"}</div>
    </div>
  );
}

function LoiPreview() {
  const navy = "rgb(15, 23, 41)";
  const gold = "rgb(201, 168, 76)";

  return (
    <div
      className="border rounded-md overflow-hidden text-xs space-y-0"
      style={{ maxWidth: 320, fontFamily: "Helvetica, Arial, sans-serif" }}
      data-testid="template-preview"
    >
      <div className="px-3 py-1 text-center border-b" style={{ backgroundColor: navy }}>
        <span className="font-bold text-white text-[10px] tracking-wider">SPHINX CAPITAL</span>
      </div>

      <div className="px-3 pt-2 pb-1">
        <div className="font-bold text-[11px] text-center" style={{ color: navy }}>
          Letter of Intent – BPL Term Loan
        </div>
        <div className="text-[9px] text-muted-foreground mt-1">Date: _______________</div>
        <div className="text-[9px] text-muted-foreground">Re: Loan # ________</div>
      </div>

      <div className="px-3 pb-1">
        <div className="text-[9px] text-muted-foreground italic">Dear _______________,</div>
        <div className="text-[8px] text-muted-foreground mt-0.5 line-clamp-2">
          Thank you for providing Sphinx Capital ("Originator") with the opportunity to present...
        </div>
      </div>

      <div className="px-3 pb-1">
        <div className="px-2 py-0.5 rounded-sm mb-0.5" style={{ backgroundColor: navy }}>
          <span className="font-bold text-[9px] text-white">Preliminary Transaction Details</span>
        </div>
        <div className="border border-gray-200 rounded-sm overflow-hidden">
          <LoiPreviewRow label="Loan Amount" />
          <LoiPreviewRow label="Interest Rate*" />
          <LoiPreviewRow label="Loan Program" value="BPL Term" />
          <LoiPreviewRow label="Borrower FICO" />
          <LoiPreviewRow label="Est. Property Value" />
          <LoiPreviewRow label="LTV" />
          <LoiPreviewRow label="Property Type" />
          <LoiPreviewRow label="Loan Term" value="360 Months" />
          <LoiPreviewRow label="Prepayment Penalty" />
          <LoiPreviewRow label="Est. DSCR" />
        </div>
      </div>

      <div className="px-3 pb-1">
        <div className="px-2 py-0.5 rounded-sm mb-0.5" style={{ backgroundColor: navy }}>
          <span className="font-bold text-[9px] text-white">Estimated Fees & Other Details</span>
        </div>
        <div className="border border-gray-200 rounded-sm overflow-hidden">
          <LoiPreviewRow label="Rate Buydown" value="0% of Loan Amt" />
          <LoiPreviewRow label="Origination Fee" value="__% of Loan Amt" />
          <LoiPreviewRow label="Underwriting Fee" value="$1,500" />
          <LoiPreviewRow label="Legal/Doc Fee" value="$750" />
        </div>
      </div>

      <div className="px-3 py-1 border-t border-dashed border-gray-300">
        <div className="text-[8px] text-muted-foreground text-center font-medium">— Page 2 —</div>
        <div className="px-2 py-0.5 rounded-sm mt-0.5 mb-0.5" style={{ backgroundColor: "#f5f5f5" }}>
          <span className="font-bold text-[9px]" style={{ color: navy }}>Disclaimer</span>
        </div>
        <div className="text-[8px] text-muted-foreground line-clamp-2">
          This Letter of Intent is non-binding and does not constitute a commitment to lend...
        </div>
        <div className="mt-1 pt-1 border-t border-gray-200">
          <div className="font-bold text-[9px]" style={{ color: navy }}>Borrower Acceptance</div>
          <div className="grid grid-cols-2 gap-x-2 mt-0.5">
            <div className="text-[8px] text-muted-foreground">Name: ___________</div>
            <div className="text-[8px] text-muted-foreground">Date: ___________</div>
          </div>
          <div className="text-[8px] text-muted-foreground mt-0.5">Signature: ___________</div>
        </div>
      </div>

      <div className="px-3 py-1 border-t border-dashed border-gray-300">
        <div className="text-[8px] text-muted-foreground text-center font-medium">— Page 3 —</div>
        <div className="font-bold text-[9px] mt-0.5" style={{ color: navy }}>Exhibit A – Property Address</div>
        <div className="text-[8px] text-muted-foreground mt-0.5">Addresses: ___________________________</div>
      </div>
    </div>
  );
}

const LOI_FIELD_DEFAULTS: Required<LoiDefaults> = {
  loanProgram: "BPL Term",
  loanTerm: "360 Months",
  loanType: "30 Year Fixed, P&I",
  escrowAccount: "Yes (Taxes and Insurance)",
  amortizationTerm: "360 Months (P&I Loan)",
  rateBuydown: "0 % of the Loan Amount",
  underwritingFee: "$1,500",
  legalDocFee: "$750",
  introText: 'Thank you for providing Sphinx Capital ("Originator") information regarding your request for business purpose real estate financing. Based on our preliminary and limited review of the information provided, we are pleased to inform you of our interest in pursuing this opportunity further, subject to the terms and conditions set forth below. If the below terms are acceptable, please sign this preliminary approval letter and return it to us no later than one business day. If accepted within this time frame, the terms outlined herein shall expire 45 calendar days from the date of this Letter.',
  disclaimerText: "The proposed Loan Interest Rate and terms may be unilaterally withdrawn or adjusted by Originator in its sole discretion at any time in the event, during the underwriting process, certain loan parameters are determined to be materially and adversely different compared to those presented at the time this Letter was issued.",
  disclaimerText2: "Please note this Preliminary Approval Letter serves to outline the terms of the proposed financing of the referenced transaction. This Preliminary Approval Letter is merely a general proposal and is neither a binding offer nor a contract. Borrower understands and agrees that Originator is not obligated to enter into the transaction contemplated by this Preliminary Approval Letter, on the terms set forth herein, or on any other terms, unless and until Originator obtains internal committee approval, which committee approval shall be predicated on multiple factors including but not limited to satisfactory appraisal, environmental screening report (documenting no environmental risks), specific historical and current operating expense explanations, satisfactory credit review of the borrowing entity and Key Principals, and satisfactory review of the property's market and submarket, and Originator or its capital partner executes and delivers to Borrower final definitive loan documents, the terms of which shall supersede in their entirety the terms set forth herein. No party shall have any legal rights or obligations with respect to the other unless and until a formal application for the potential loan is signed by both Originator and Borrower.",
  closingText: "I appreciate the opportunity to present this proposal and look forward to the possibility of discussing the details of this structure at your convenience. To accept this proposal, please sign the acknowledgment on the following page.",
  vendorText: "We have a Title/Escrow vendor with whom we have a strong relationship, and we believe using this vendor is the cheapest and most efficient option. However, if you have a strong preference to use another vendor, please let us know.",
  rateLockNote: "*The Interest Rate will be locked following the execution date of this Letter of Intent or after all appraisals have been received (indicated based on the box checked above), and the rate lock will be for 45 calendar days. Your Loan Interest Rate is based on loan credit parameters, represented by you (and stated in this Letter), and may be changed if differences are found in underwriting, at Originator's sole discretion.",
  appraisalNote: "Costs can vary based on several factors including geographic region, the service provider and the type of report ordered. Costs are controlled by independent third parties, subject to change without notice. Borrower to pay appraiser directly.",
  feesFootnote: "^ The above estimates do not include title fees, borrower's legal fees, or any other third-party costs incurred while closing the loan.",
};

function LoiEditableRow({ label, value, onChange, autoFilled }: { label: string; value: string; onChange?: (v: string) => void; autoFilled?: boolean }) {
  return (
    <div className="flex border-b border-border last:border-b-0">
      <div className="w-[40%] py-2 px-3 text-sm text-muted-foreground bg-muted/30 border-r border-border font-medium">{label}</div>
      <div className="w-[60%] py-1 px-2">
        {autoFilled ? (
          <div className="text-sm text-muted-foreground italic py-1">[Auto-filled from quote]</div>
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="h-8 text-sm border-0 shadow-none focus-visible:ring-1 bg-transparent"
            data-testid={`loi-field-${label.toLowerCase().replace(/\s+/g, "-")}`}
          />
        )}
      </div>
    </div>
  );
}

function LoiFullPreviewModal({
  open,
  onOpenChange,
  loiDefaults,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loiDefaults: LoiDefaults;
  onSave: (defaults: LoiDefaults) => void;
}) {
  const [draft, setDraft] = useState<Required<LoiDefaults>>({ ...LOI_FIELD_DEFAULTS, ...loiDefaults });

  useEffect(() => {
    if (open) {
      setDraft({ ...LOI_FIELD_DEFAULTS, ...loiDefaults });
    }
  }, [open, loiDefaults]);

  const upd = (key: keyof LoiDefaults, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const cleaned: LoiDefaults = {};
    for (const [key, val] of Object.entries(draft)) {
      const defaultVal = LOI_FIELD_DEFAULTS[key as keyof LoiDefaults];
      if (val !== defaultVal) {
        (cleaned as any)[key] = val;
      }
    }
    onSave(cleaned);
    onOpenChange(false);
  };

  const navy = "#0F1729";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0" data-testid="loi-full-preview-modal">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Letter of Intent — Full Preview & Edit
          </DialogTitle>
          <DialogDescription>
            Edit default values for the LOI document. Auto-filled fields pull from quote data at download time.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-6">
          <div className="border rounded-lg overflow-hidden bg-white" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
            <div className="text-center py-2 border-b" style={{ backgroundColor: navy }}>
              <span className="font-bold text-white text-xs tracking-[0.2em]">SPHINX CAPITAL</span>
            </div>

            <div className="px-6 pt-4 pb-2 text-center">
              <h2 className="font-bold text-lg" style={{ color: navy }}>Letter of Intent – BPL Term Loan</h2>
            </div>

            <div className="px-6 pb-2 space-y-1 text-sm text-muted-foreground">
              <div>Date: <span className="italic">[Auto-filled or blank]</span></div>
              <div>Re: Loan # <span className="italic">[Auto-filled or blank]</span></div>
              <div className="text-xs">Property Addresses – See Exhibit A</div>
            </div>

            <div className="px-6 pb-2 text-sm text-muted-foreground">
              Dear <span className="italic">[Auto-filled from quote]</span>,
            </div>

            <div className="px-6 pb-3">
              <Label className="text-xs text-muted-foreground mb-1 block">Intro Paragraph</Label>
              <Textarea
                value={draft.introText}
                onChange={(e) => upd("introText", e.target.value)}
                rows={4}
                className="text-sm"
                data-testid="loi-field-intro-text"
              />
            </div>

            <div className="px-6 pb-3">
              <div className="rounded-sm px-3 py-1.5 mb-2" style={{ backgroundColor: navy }}>
                <span className="font-bold text-sm text-white">Preliminary Transaction Details</span>
              </div>
              <div className="border rounded-md overflow-hidden">
                <LoiEditableRow label="Loan Amount" value="" autoFilled />
                <LoiEditableRow label="Interest Rate*" value="" autoFilled />
                <LoiEditableRow label="Loan Program" value={draft.loanProgram} onChange={(v) => upd("loanProgram", v)} />
                <LoiEditableRow label="Borrower FICO" value="" autoFilled />
                <LoiEditableRow label="Est. Property Value" value="" autoFilled />
                <LoiEditableRow label="LTV" value="" autoFilled />
                <LoiEditableRow label="Property Type" value="" autoFilled />
                <LoiEditableRow label="Loan Term" value={draft.loanTerm} onChange={(v) => upd("loanTerm", v)} />
                <LoiEditableRow label="Prepayment Penalty" value="" autoFilled />
                <LoiEditableRow label="Est. DSCR" value="" autoFilled />
                <LoiEditableRow label="Loan Purpose" value="" autoFilled />
                <LoiEditableRow label="Escrow Account" value={draft.escrowAccount} onChange={(v) => upd("escrowAccount", v)} />
                <LoiEditableRow label="Loan Type" value={draft.loanType} onChange={(v) => upd("loanType", v)} />
                <LoiEditableRow label="Amortization Term" value={draft.amortizationTerm} onChange={(v) => upd("amortizationTerm", v)} />
                <LoiEditableRow label="Borrowing Entity" value="" autoFilled />
                <LoiEditableRow label="Rate Lock Preference" value="Signed LOI" autoFilled />
                <LoiEditableRow label="Personal Guaranty" value="" autoFilled />
              </div>
            </div>

            <div className="px-6 pb-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Rate Lock Footnote</Label>
              <Textarea
                value={draft.rateLockNote}
                onChange={(e) => upd("rateLockNote", e.target.value)}
                rows={3}
                className="text-xs italic"
                data-testid="loi-field-rate-lock-note"
              />
            </div>

            <div className="px-6 pb-3">
              <div className="rounded-sm px-3 py-1.5 mb-2" style={{ backgroundColor: navy }}>
                <span className="font-bold text-sm text-white">Estimated Fees & Other Details*</span>
              </div>
              <div className="border rounded-md overflow-hidden">
                <LoiEditableRow label="Rate Buydown" value={draft.rateBuydown} onChange={(v) => upd("rateBuydown", v)} />
                <LoiEditableRow label="Origination Fee" value="" autoFilled />
                <LoiEditableRow label="Underwriting Fee" value={draft.underwritingFee} onChange={(v) => upd("underwritingFee", v)} />
                <LoiEditableRow label="Legal/Doc Fee" value={draft.legalDocFee} onChange={(v) => upd("legalDocFee", v)} />
              </div>
            </div>

            <div className="px-6 pb-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Appraisal Note</Label>
              <Textarea
                value={draft.appraisalNote}
                onChange={(e) => upd("appraisalNote", e.target.value)}
                rows={2}
                className="text-xs italic"
                data-testid="loi-field-appraisal-note"
              />
            </div>

            <div className="px-6 pb-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Fees Footnote</Label>
              <Textarea
                value={draft.feesFootnote}
                onChange={(e) => upd("feesFootnote", e.target.value)}
                rows={2}
                className="text-xs italic"
                data-testid="loi-field-fees-footnote"
              />
            </div>

            <div className="px-6 pb-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Vendor Text</Label>
              <Textarea
                value={draft.vendorText}
                onChange={(e) => upd("vendorText", e.target.value)}
                rows={2}
                className="text-sm"
                data-testid="loi-field-vendor-text"
              />
            </div>

            <div className="px-6 pb-3">
              <Label className="text-xs text-muted-foreground mb-1 block">Closing Paragraph</Label>
              <Textarea
                value={draft.closingText}
                onChange={(e) => upd("closingText", e.target.value)}
                rows={2}
                className="text-sm"
                data-testid="loi-field-closing-text"
              />
            </div>

            <div className="border-t-2 border-dashed border-gray-300 mx-6" />
            <div className="text-center py-1 text-xs text-muted-foreground font-medium">— Page 2 —</div>

            <div className="px-6 pb-3">
              <h3 className="font-bold text-base mb-2" style={{ color: navy }}>Disclaimer</h3>
              <Label className="text-xs text-muted-foreground mb-1 block">Disclaimer Paragraph 1</Label>
              <Textarea
                value={draft.disclaimerText}
                onChange={(e) => upd("disclaimerText", e.target.value)}
                rows={3}
                className="text-sm mb-3"
                data-testid="loi-field-disclaimer-text"
              />
              <Label className="text-xs text-muted-foreground mb-1 block">Disclaimer Paragraph 2</Label>
              <Textarea
                value={draft.disclaimerText2}
                onChange={(e) => upd("disclaimerText2", e.target.value)}
                rows={5}
                className="text-sm"
                data-testid="loi-field-disclaimer-text-2"
              />
            </div>

            <div className="px-6 pb-4">
              <h3 className="font-bold text-base mb-3 text-center" style={{ color: navy }}>Borrower Acceptance</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>Name: ___________________________</div>
                <div>Date: ___________________________</div>
              </div>
              <div className="text-sm text-muted-foreground mt-2">Signature: ___________________________</div>
            </div>

            <div className="border-t-2 border-dashed border-gray-300 mx-6" />
            <div className="text-center py-1 text-xs text-muted-foreground font-medium">— Page 3 —</div>

            <div className="px-6 pb-4">
              <h3 className="font-bold text-base mb-2 text-center" style={{ color: navy }}>Exhibit A – Property Address</h3>
              <div className="text-sm text-muted-foreground">
                Addresses: <span className="italic">[Auto-filled from quote data]</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-2 border-t">
          <p className="text-xs text-muted-foreground mr-auto">Changes are applied to the editor. Remember to save the template to persist.</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} data-testid="button-save-loi-defaults">
            <Save className="h-4 w-4 mr-2" />
            Apply Defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePreview({ config, onExpandLoi }: { config: TemplateConfig; onExpandLoi?: () => void }) {
  if ((config.templateType || "summary") === "loi") {
    return (
      <div className="space-y-2">
        <LoiPreview />
        {onExpandLoi && (
          <Button variant="outline" size="sm" className="w-full" onClick={onExpandLoi} data-testid="button-expand-loi-preview">
            <Maximize2 className="h-3 w-3 mr-2" />
            Full Preview & Edit
          </Button>
        )}
      </div>
    );
  }

  const primary = hexToRgb(config.primaryColor) || { r: 15, g: 23, b: 41 };
  const accent = hexToRgb(config.accentColor) || { r: 201, g: 168, b: 76 };
  const primaryBg = `rgb(${primary.r}, ${primary.g}, ${primary.b})`;
  const accentColor = `rgb(${accent.r}, ${accent.g}, ${accent.b})`;

  const enabledSections = config.sections.filter(s => s.enabled);

  return (
    <div
      className="border rounded-md overflow-hidden text-xs"
      style={{ maxWidth: 320, fontFamily: "Helvetica, Arial, sans-serif" }}
      data-testid="template-preview"
    >
      <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: primaryBg }}>
        <span className="font-bold text-white text-sm">{config.companyName || "Company"}</span>
        {config.tagline && (
          <span style={{ color: accentColor }} className="text-[10px]">{config.tagline}</span>
        )}
      </div>

      <div className="px-3 py-1" style={{ borderBottom: `2px solid ${accentColor}` }} />

      <div className="px-3 py-2">
        <span className="font-bold text-sm" style={{ color: primaryBg }}>{config.headerText || "Loan Quote"}</span>
      </div>

      {enabledSections.map(section => (
        <div key={section.key} className="px-3 pb-2">
          <div className="px-2 py-1 rounded-sm mb-1" style={{ backgroundColor: "#f5f5f5" }}>
            <span className="font-bold text-[10px]" style={{ color: primaryBg }}>{section.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-2">
            {section.fields.slice(0, 4).map(field => (
              <div key={field.key}>
                <div className="text-[9px] text-muted-foreground">{field.label}</div>
                <div className="text-[10px] font-medium">—</div>
              </div>
            ))}
            {section.fields.length > 4 && (
              <div className="text-[9px] text-muted-foreground col-span-2">+{section.fields.length - 4} more fields</div>
            )}
          </div>
        </div>
      ))}

      <div className="px-3 py-2">
        <div className="rounded-sm px-3 py-2 flex gap-6" style={{ backgroundColor: primaryBg }}>
          <div>
            <div className="text-[9px]" style={{ color: accentColor }}>Qualified Rate</div>
            <div className="text-sm font-bold text-white">—%</div>
          </div>
          {config.showPoints && (
            <div>
              <div className="text-[9px]" style={{ color: accentColor }}>Points</div>
              <div className="text-sm font-bold text-white">— pts</div>
            </div>
          )}
        </div>
      </div>

      {config.footerDisclaimer && (
        <div className="px-3 py-1.5 border-t">
          <p className="text-[8px] text-muted-foreground leading-tight line-clamp-2">
            {config.footerDisclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

function SectionEditor({
  section,
  index,
  totalSections,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  section: QuotePdfSection;
  index: number;
  totalSections: number;
  onUpdate: (updated: QuotePdfSection) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [showFields, setShowFields] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const addField = () => {
    if (!newFieldKey || !newFieldLabel) return;
    onUpdate({
      ...section,
      fields: [...section.fields, { key: newFieldKey, label: newFieldLabel }],
    });
    setNewFieldKey("");
    setNewFieldLabel("");
  };

  const removeField = (fieldIndex: number) => {
    onUpdate({
      ...section,
      fields: section.fields.filter((_, i) => i !== fieldIndex),
    });
  };

  return (
    <div className="border rounded-md p-3 space-y-2" data-testid={`section-editor-${section.key}`}>
      <div className="flex items-center gap-2">
        <Switch
          checked={section.enabled}
          onCheckedChange={(checked) => onUpdate({ ...section, enabled: checked })}
          data-testid={`switch-section-${section.key}`}
        />
        <Input
          value={section.label}
          onChange={(e) => onUpdate({ ...section, label: e.target.value })}
          className="flex-1 text-sm"
          data-testid={`input-section-label-${section.key}`}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={index === 0}
            onClick={onMoveUp}
            data-testid={`button-move-up-${section.key}`}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={index === totalSections - 1}
            onClick={onMoveDown}
            data-testid={`button-move-down-${section.key}`}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFields(!showFields)}
            data-testid={`button-toggle-fields-${section.key}`}
          >
            {showFields ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            data-testid={`button-remove-section-${section.key}`}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Key: <code className="bg-muted px-1 rounded">{section.key}</code> · {section.fields.length} fields
      </div>

      {showFields && (
        <div className="space-y-2 pl-4 border-l-2 ml-2">
          {section.fields.map((field, fi) => (
            <div key={fi} className="flex items-center gap-2 text-sm">
              <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="flex-1">{field.label}</span>
              <code className="text-xs text-muted-foreground bg-muted px-1 rounded">{field.key}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => removeField(fi)}
                data-testid={`button-remove-field-${section.key}-${fi}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newFieldLabel}
              onChange={(e) => setNewFieldLabel(e.target.value)}
              placeholder="Label"
              className="text-xs"
              data-testid={`input-new-field-label-${section.key}`}
            />
            <Input
              value={newFieldKey}
              onChange={(e) => setNewFieldKey(e.target.value)}
              placeholder="key"
              className="text-xs font-mono"
              data-testid={`input-new-field-key-${section.key}`}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addField}
              disabled={!newFieldKey || !newFieldLabel}
              data-testid={`button-add-field-${section.key}`}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onBack,
}: {
  template: QuotePdfTemplate | null;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const isNew = !template;
  const [name, setName] = useState(template?.name || "New Template");
  const [isDefault, setIsDefault] = useState(template?.isDefault || false);
  const [config, setConfig] = useState<TemplateConfig>(
    template?.config || { ...DEFAULT_CONFIG }
  );
  const [loiPreviewOpen, setLoiPreviewOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        return await apiRequest("POST", "/api/quote-pdf-templates", {
          name,
          isDefault,
          config,
        });
      } else {
        return await apiRequest("PATCH", `/api/quote-pdf-templates/${template!.id}`, {
          name,
          isDefault,
          config,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-pdf-templates"] });
      toast({ title: isNew ? "Template created" : "Template saved" });
      onBack();
    },
    onError: () => {
      toast({ title: "Failed to save template", variant: "destructive" });
    },
  });

  const updateConfig = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const updateSection = (index: number, updated: QuotePdfSection) => {
    const newSections = [...config.sections];
    newSections[index] = updated;
    updateConfig("sections", newSections);
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const newSections = [...config.sections];
    const target = index + direction;
    if (target < 0 || target >= newSections.length) return;
    [newSections[index], newSections[target]] = [newSections[target], newSections[index]];
    updateConfig("sections", newSections);
  };

  const removeSection = (index: number) => {
    updateConfig("sections", config.sections.filter((_, i) => i !== index));
  };

  const addSection = () => {
    const key = `section_${Date.now()}`;
    updateConfig("sections", [
      ...config.sections,
      { key, label: "New Section", enabled: true, fields: [] },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-template">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-medium" data-testid="text-template-editor-title">
          {isNew ? "New Template" : `Edit: ${template!.name}`}
        </h3>
        <span className="flex-1" />
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-template"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Template"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Template Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-template-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Template Type</Label>
                  <Select
                    value={config.templateType || "summary"}
                    onValueChange={(v) => updateConfig("templateType", v as "summary" | "loi")}
                  >
                    <SelectTrigger data-testid="select-template-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="summary">Quote Summary</SelectItem>
                      <SelectItem value="loi">Letter of Intent (LOI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch
                    checked={isDefault}
                    onCheckedChange={setIsDefault}
                    data-testid="switch-template-default"
                  />
                  <Label>Set as default template</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {(config.templateType || "summary") === "loi" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Letter of Intent Format
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border" data-testid="loi-info-notice">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>
                      The LOI template uses a fixed 3-page format matching the Sphinx Capital BPL Term Loan Letter of Intent:
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><span className="font-medium text-foreground">Page 1</span> — Letter header, Preliminary Transaction Details table, Estimated Fees table</li>
                      <li><span className="font-medium text-foreground">Page 2</span> — Legal disclaimer and Borrower Acceptance signature block</li>
                      <li><span className="font-medium text-foreground">Page 3</span> — Exhibit A with property addresses</li>
                    </ul>
                    <p>
                      Fields like Loan Amount, Interest Rate, Property Value, LTV, FICO, and Property Type are auto-filled from quote data. Other fields are left blank for manual completion.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Branding</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input
                        value={config.companyName}
                        onChange={(e) => updateConfig("companyName", e.target.value)}
                        data-testid="input-pdf-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tagline</Label>
                      <Input
                        value={config.tagline}
                        onChange={(e) => updateConfig("tagline", e.target.value)}
                        data-testid="input-pdf-tagline"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Logo URL</Label>
                    <Input
                      value={config.logoUrl || ""}
                      onChange={(e) => updateConfig("logoUrl", e.target.value)}
                      placeholder="https://example.com/logo.png"
                      data-testid="input-pdf-logo-url"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Primary Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={config.primaryColor}
                          onChange={(e) => updateConfig("primaryColor", e.target.value)}
                          data-testid="input-pdf-primary-color"
                        />
                        <div
                          className="h-9 w-9 shrink-0 rounded-md border"
                          style={{ backgroundColor: config.primaryColor }}
                          data-testid="preview-pdf-primary-color"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Accent Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={config.accentColor}
                          onChange={(e) => updateConfig("accentColor", e.target.value)}
                          data-testid="input-pdf-accent-color"
                        />
                        <div
                          className="h-9 w-9 shrink-0 rounded-md border"
                          style={{ backgroundColor: config.accentColor }}
                          data-testid="preview-pdf-accent-color"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Header Text</Label>
                    <Input
                      value={config.headerText}
                      onChange={(e) => updateConfig("headerText", e.target.value)}
                      data-testid="input-pdf-header-text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer Disclaimer</Label>
                    <Textarea
                      value={config.footerDisclaimer}
                      onChange={(e) => updateConfig("footerDisclaimer", e.target.value)}
                      rows={3}
                      data-testid="input-pdf-footer-disclaimer"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Display Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label>Show Points</Label>
                    <Switch
                      checked={config.showPoints}
                      onCheckedChange={(v) => updateConfig("showPoints", v)}
                      data-testid="switch-show-points"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label>Show YSP</Label>
                    <Switch
                      checked={config.showYsp}
                      onCheckedChange={(v) => updateConfig("showYsp", v)}
                      data-testid="switch-show-ysp"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label>Show Commission</Label>
                    <Switch
                      checked={config.showCommission}
                      onCheckedChange={(v) => updateConfig("showCommission", v)}
                      data-testid="switch-show-commission"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">Sections</CardTitle>
                    <Button variant="outline" size="sm" onClick={addSection} data-testid="button-add-section">
                      <Plus className="h-3 w-3 mr-1" /> Add Section
                    </Button>
                  </div>
                  <CardDescription>Toggle, reorder, and configure which sections appear in the PDF.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {config.sections.map((section, i) => (
                    <SectionEditor
                      key={section.key}
                      section={section}
                      index={i}
                      totalSections={config.sections.length}
                      onUpdate={(updated) => updateSection(i, updated)}
                      onMoveUp={() => moveSection(i, -1)}
                      onMoveDown={() => moveSection(i, 1)}
                      onRemove={() => removeSection(i)}
                    />
                  ))}
                  {config.sections.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No sections configured. Click "Add Section" to get started.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Preview</CardTitle>
              <CardDescription>Simplified preview of the PDF layout</CardDescription>
            </CardHeader>
            <CardContent>
              <TemplatePreview config={config} onExpandLoi={() => setLoiPreviewOpen(true)} />
            </CardContent>
          </Card>
        </div>
      </div>

      <LoiFullPreviewModal
        open={loiPreviewOpen}
        onOpenChange={setLoiPreviewOpen}
        loiDefaults={config.loiDefaults || {}}
        onSave={(defaults) => updateConfig("loiDefaults", defaults)}
      />
    </div>
  );
}

export default function QuotePdfTemplateConfig() {
  const { toast } = useToast();
  const [editingTemplate, setEditingTemplate] = useState<QuotePdfTemplate | null | "new">(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<QuotePdfTemplate[]>({
    queryKey: ["/api/quote-pdf-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/quote-pdf-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-pdf-templates"] });
      toast({ title: "Template deleted" });
      setDeleteDialogId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete template", variant: "destructive" });
    },
  });

  if (editingTemplate !== null) {
    return (
      <TemplateEditor
        template={editingTemplate === "new" ? null : editingTemplate}
        onBack={() => setEditingTemplate(null)}
      />
    );
  }

  const templates = Array.isArray(data) ? data : [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle data-testid="text-quote-pdf-title">Quote PDF Templates</CardTitle>
              <CardDescription data-testid="text-quote-pdf-description">
                Create and manage PDF templates for loan quotes. Configure branding, layout, and which fields appear.
              </CardDescription>
            </div>
            <Button onClick={() => setEditingTemplate("new")} data-testid="button-new-template">
              <Plus className="h-4 w-4 mr-2" /> New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-muted-foreground" data-testid="text-no-templates">
                No PDF templates yet. Create one to customize your quote downloads.
              </p>
              <Button variant="outline" onClick={() => setEditingTemplate("new")} data-testid="button-create-first-template">
                <Plus className="h-4 w-4 mr-2" /> Create First Template
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(template => (
                <div
                  key={template.id}
                  className="flex items-center gap-3 p-3 border rounded-md"
                  data-testid={`template-row-${template.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-template-name-${template.id}`}>
                        {template.name}
                      </span>
                      {template.isDefault && (
                        <Badge variant="secondary" data-testid={`badge-default-${template.id}`}>
                          <Star className="h-3 w-3 mr-1" /> Default
                        </Badge>
                      )}
                      <Badge variant="outline" data-testid={`badge-type-${template.id}`}>
                        {template.config.templateType === "loi" ? "LOI" : "Summary"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {template.config.templateType === "loi"
                        ? `${template.config.companyName} · Letter of Intent format`
                        : `${template.config.companyName} · ${template.config.sections.filter(s => s.enabled).length} sections`
                      }
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingTemplate(template)}
                    data-testid={`button-edit-template-${template.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteDialogId(template.id)}
                    data-testid={`button-delete-template-${template.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogId !== null} onOpenChange={() => setDeleteDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialogId && deleteMutation.mutate(deleteDialogId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-template"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
