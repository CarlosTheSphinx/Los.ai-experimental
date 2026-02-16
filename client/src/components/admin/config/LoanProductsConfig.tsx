import { useTenantConfig } from "@/hooks/use-tenant-config";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { Save, Plus, Trash2, ChevronDown, ChevronRight, Package } from "lucide-react";

interface LoanProduct {
  id: string;
  name: string;
  enabled: boolean;
  minLoanAmount: number;
  maxLoanAmount: number;
  allowedPropertyTypes: string[];
  allowedStates: string;
  loanTerms: string;
  requiredDocuments: string;
  notes: string;
}

const defaults = {
  products: [
    {
      id: "dscr",
      name: "DSCR",
      enabled: true,
      minLoanAmount: 100000,
      maxLoanAmount: 5000000,
      allowedPropertyTypes: ["Single Family Residence", "2-4 Unit", "Multifamily (5+ Units)", "Rental Portfolio", "Mixed-Use"],
      allowedStates: "",
      loanTerms: "30-Year Fixed, 5/1 ARM, 7/1 ARM",
      requiredDocuments: "Appraisal, Rent Roll, Entity Docs, Insurance",
      notes: "",
    },
    {
      id: "fix_flip",
      name: "Fix & Flip",
      enabled: true,
      minLoanAmount: 75000,
      maxLoanAmount: 3000000,
      allowedPropertyTypes: ["Single Family Residence", "2-4 Unit", "Multifamily (5+ Units)"],
      allowedStates: "",
      loanTerms: "12 Month, 18 Month, 24 Month",
      requiredDocuments: "Scope of Work, Contractor Bids, Entity Docs, Insurance",
      notes: "",
    },
    {
      id: "bridge",
      name: "Bridge",
      enabled: true,
      minLoanAmount: 100000,
      maxLoanAmount: 5000000,
      allowedPropertyTypes: ["Single Family Residence", "2-4 Unit", "Multifamily (5+ Units)", "Rental Portfolio", "Mixed-Use"],
      allowedStates: "",
      loanTerms: "12 Month, 24 Month",
      requiredDocuments: "Appraisal, Entity Docs, Insurance",
      notes: "",
    },
    {
      id: "guc",
      name: "Ground Up Construction",
      enabled: false,
      minLoanAmount: 150000,
      maxLoanAmount: 5000000,
      allowedPropertyTypes: ["Single Family Residence", "2-4 Unit", "Infill Lot"],
      allowedStates: "",
      loanTerms: "12 Month, 18 Month, 24 Month",
      requiredDocuments: "Plans & Permits, Scope of Work, Builder Resume, Entity Docs, Insurance",
      notes: "",
    },
  ] as LoanProduct[],
};

export default function LoanProductsConfig() {
  const { config, isLoading, hasChanges, updateField, save, isPending, isSuccess } =
    useTenantConfig("tenant_loan_products", defaults);
  const { toast } = useToast();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isSuccess) {
      toast({ title: "Loan products saved", description: "Your loan products configuration has been updated." });
    }
  }, [isSuccess]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateProduct = (index: number, field: keyof LoanProduct, value: any) => {
    const updated = [...config.products];
    updated[index] = { ...updated[index], [field]: value };
    updateField("products", updated);
  };

  const addProduct = () => {
    const newId = `product_${Date.now()}`;
    const newProduct: LoanProduct = {
      id: newId,
      name: "",
      enabled: true,
      minLoanAmount: 0,
      maxLoanAmount: 0,
      allowedPropertyTypes: [],
      allowedStates: "",
      loanTerms: "",
      requiredDocuments: "",
      notes: "",
    };
    updateField("products", [...config.products, newProduct]);
    setExpandedIds(prev => new Set(prev).add(newId));
  };

  const deleteProduct = (index: number) => {
    const product = config.products[index];
    if (!window.confirm(`Delete product "${product.name || "Untitled"}"? This cannot be undone.`)) return;
    const updated = config.products.filter((_: LoanProduct, i: number) => i !== index);
    updateField("products", updated);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-loan-products-title">Loan Products & Programs</CardTitle>
        <CardDescription data-testid="text-loan-products-description">
          Configure available loan products, their limits, and requirements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.products.map((product: LoanProduct, index: number) => {
          const isExpanded = expandedIds.has(product.id);
          return (
            <div key={product.id} className="rounded-md border" data-testid={`card-product-${product.id}`}>
              <div className="flex items-center justify-between gap-2 p-4">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => toggleExpanded(product.id)}
                  data-testid={`button-toggle-product-${product.id}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{product.name || "Untitled Product"}</span>
                  <Badge variant={product.enabled ? "default" : "secondary"} className="ml-2">
                    {product.enabled ? "Active" : "Disabled"}
                  </Badge>
                </button>
                <div className="flex items-center gap-2">
                  <Switch
                    data-testid={`switch-product-enabled-${product.id}`}
                    checked={product.enabled}
                    onCheckedChange={(checked) => updateProduct(index, "enabled", checked)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid={`button-delete-product-${product.id}`}
                    onClick={() => deleteProduct(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`product-name-${product.id}`}>Product Name</Label>
                    <Input
                      id={`product-name-${product.id}`}
                      data-testid={`input-product-name-${product.id}`}
                      value={product.name}
                      onChange={(e) => updateProduct(index, "name", e.target.value)}
                      placeholder="Product name"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`min-loan-${product.id}`}>$ Min Loan Amount</Label>
                      <Input
                        id={`min-loan-${product.id}`}
                        data-testid={`input-min-loan-${product.id}`}
                        type="number"
                        min={0}
                        value={product.minLoanAmount}
                        onChange={(e) => updateProduct(index, "minLoanAmount", parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`max-loan-${product.id}`}>$ Max Loan Amount</Label>
                      <Input
                        id={`max-loan-${product.id}`}
                        data-testid={`input-max-loan-${product.id}`}
                        type="number"
                        min={0}
                        value={product.maxLoanAmount}
                        onChange={(e) => updateProduct(index, "maxLoanAmount", parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`property-types-${product.id}`}>Allowed Property Types</Label>
                    <Textarea
                      id={`property-types-${product.id}`}
                      data-testid={`input-property-types-${product.id}`}
                      value={product.allowedPropertyTypes.join(", ")}
                      onChange={(e) =>
                        updateProduct(
                          index,
                          "allowedPropertyTypes",
                          e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean)
                        )
                      }
                      placeholder="Single Family, 2-4 Unit, Condo, ..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`allowed-states-${product.id}`}>Allowed States</Label>
                    <Input
                      id={`allowed-states-${product.id}`}
                      data-testid={`input-allowed-states-${product.id}`}
                      value={product.allowedStates}
                      onChange={(e) => updateProduct(index, "allowedStates", e.target.value)}
                      placeholder="CA, TX, FL, ... (leave empty for all)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`loan-terms-${product.id}`}>Loan Terms</Label>
                    <Input
                      id={`loan-terms-${product.id}`}
                      data-testid={`input-loan-terms-${product.id}`}
                      value={product.loanTerms}
                      onChange={(e) => updateProduct(index, "loanTerms", e.target.value)}
                      placeholder="30-Year Fixed, 5/1 ARM, ..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`req-docs-${product.id}`}>Required Documents</Label>
                    <Textarea
                      id={`req-docs-${product.id}`}
                      data-testid={`input-req-docs-${product.id}`}
                      value={product.requiredDocuments}
                      onChange={(e) => updateProduct(index, "requiredDocuments", e.target.value)}
                      placeholder="Appraisal, Entity Docs, Insurance, ..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`notes-${product.id}`}>Notes</Label>
                    <Textarea
                      id={`notes-${product.id}`}
                      data-testid={`input-notes-${product.id}`}
                      value={product.notes}
                      onChange={(e) => updateProduct(index, "notes", e.target.value)}
                      placeholder="Internal notes..."
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <Button
          variant="outline"
          data-testid="button-add-product"
          onClick={addProduct}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>

        <Button
          data-testid="button-save-loan-products"
          onClick={save}
          disabled={!hasChanges || isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
