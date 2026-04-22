import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calculator, DollarSign, Building, User, Gauge } from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useMemo, useEffect } from "react";

export interface QuoteFormField {
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'number' | 'currency' | 'email' | 'phone' | 'select' | 'yes_no' | 'percentage' | 'date' | 'radio' | 'address';
  required: boolean;
  visible: boolean;
  isDefault?: boolean;
  displayGroup?: string;
  options?: string[];
  conditionalOn?: string;
  conditionalValue?: string;
  readOnly?: boolean;
  autoFilledFrom?: string;
  computedFrom?: string[];
  repeatable?: boolean;
  repeatGroupKey?: string;
}

interface DynamicQuoteFormProps {
  fields: QuoteFormField[];
  onSubmit: (data: Record<string, any>) => void;
  isLoading: boolean;
  defaultData?: Record<string, any> | null;
  programName?: string;
}

const GROUP_CONFIG: Record<string, { label: string; icon: typeof DollarSign }> = {
  loan_details: { label: 'Loan Details', icon: DollarSign },
  property_details: { label: 'Property Details', icon: Building },
  borrower_details: { label: 'Borrower Details', icon: User },
  pricing_questions: { label: 'Pricing Questions', icon: Gauge },
};

function ConditionalField({ field, control, children }: { field: QuoteFormField; control: any; children: React.ReactNode }) {
  const watchedValue = useWatch({ control, name: field.conditionalOn || '_noop_' });

  if (!field.conditionalOn) return <>{children}</>;

  const conditionMet = field.conditionalValue
    ? String(watchedValue || '').toLowerCase() === String(field.conditionalValue).toLowerCase()
    : !!watchedValue;

  if (!conditionMet) return null;
  return <>{children}</>;
}

function FieldRenderer({ field, control }: { field: QuoteFormField; control: any }) {
  const testId = `input-${field.fieldKey}`;

  return (
    <FormField
      control={control}
      name={field.fieldKey}
      render={({ field: formField }) => (
        <FormItem>
          <FormLabel className="text-foreground">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</FormLabel>
          <FormControl>
            {renderInput(field, formField, testId)}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function renderInput(field: QuoteFormField, formField: any, testId: string) {
  switch (field.fieldType) {
    case 'currency':
      return (
        <CurrencyInput
          className="h-11 bg-muted border-border focus:bg-background transition-all"
          placeholder={`Enter ${field.label.toLowerCase()}`}
          value={formField.value}
          onChange={formField.onChange}
          data-testid={testId}
          disabled={field.readOnly}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          className="h-11 bg-muted border-border focus:bg-background transition-all"
          placeholder={`Enter ${field.label.toLowerCase()}`}
          {...formField}
          onChange={(e) => formField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
          readOnly={field.readOnly}
          data-testid={testId}
        />
      );

    case 'percentage':
      return (
        <div className="relative">
          <Input
            type="number"
            step="0.01"
            className="h-11 bg-muted border-border focus:bg-background transition-all pr-8"
            placeholder={`Enter ${field.label.toLowerCase()}`}
            {...formField}
            onChange={(e) => formField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
            readOnly={field.readOnly}
            data-testid={testId}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
        </div>
      );

    case 'select':
    case 'radio':
      return (
        <Select onValueChange={formField.onChange} value={formField.value || ''} disabled={field.readOnly}>
          <SelectTrigger className="h-11 bg-muted border-border" data-testid={testId}>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt: any) => {
              const value = typeof opt === 'string' ? opt : opt?.value;
              const label = typeof opt === 'string' ? opt : (opt?.label ?? String(opt?.value ?? ''));
              if (!value) return null;
              return <SelectItem key={value} value={value}>{label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      );

    case 'yes_no':
      return (
        <Select onValueChange={formField.onChange} value={formField.value || ''} disabled={field.readOnly}>
          <SelectTrigger className="h-11 bg-muted border-border" data-testid={testId}>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
          </SelectContent>
        </Select>
      );

    case 'date':
      return (
        <Input
          type="date"
          className="h-11 bg-muted border-border focus:bg-background transition-all"
          {...formField}
          readOnly={field.readOnly}
          data-testid={testId}
        />
      );

    case 'address':
      return (
        <AddressAutocomplete
          value={formField.value || ''}
          onChange={formField.onChange}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          className="h-11 bg-muted border-border focus:bg-background transition-all"
          data-testid={testId}
        />
      );

    case 'email':
      return (
        <Input
          type="email"
          className="h-11 bg-muted border-border focus:bg-background transition-all"
          placeholder={`Enter ${field.label.toLowerCase()}`}
          {...formField}
          readOnly={field.readOnly}
          data-testid={testId}
        />
      );

    case 'phone':
      return (
        <Input
          type="tel"
          className="h-11 bg-muted border-border focus:bg-background transition-all"
          placeholder={`Enter ${field.label.toLowerCase()}`}
          {...formField}
          readOnly={field.readOnly}
          data-testid={testId}
        />
      );

    case 'text':
    default:
      return (
        <Input
          className="h-11 bg-muted border-border focus:bg-background transition-all"
          placeholder={`Enter ${field.label.toLowerCase()}`}
          {...formField}
          readOnly={field.readOnly}
          data-testid={testId}
        />
      );
  }
}

function buildValidationSchema(fields: QuoteFormField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  fields.forEach(f => {
    if (f.visible === false) return;

    let fieldSchema: z.ZodTypeAny;

    switch (f.fieldType) {
      case 'number':
      case 'percentage':
        fieldSchema = f.required
          ? z.union([z.number(), z.string().min(1, `${f.label} is required`)]).refine(v => v !== '' && v !== undefined, { message: `${f.label} is required` })
          : z.any().optional();
        break;
      case 'currency':
        fieldSchema = f.required
          ? z.union([z.number().min(1, `${f.label} is required`), z.string().min(1, `${f.label} is required`)])
          : z.any().optional();
        break;
      case 'email':
        fieldSchema = f.required
          ? z.string().min(1, `${f.label} is required`).email('Invalid email address')
          : z.string().email('Invalid email address').or(z.literal('')).optional();
        break;
      default:
        fieldSchema = f.required
          ? z.string().min(1, `${f.label} is required`)
          : z.string().optional();
        break;
    }

    if (f.readOnly || f.conditionalOn) {
      fieldSchema = z.any().optional();
    }

    shape[f.fieldKey] = fieldSchema;
  });

  shape['_noop_'] = z.any().optional();

  return z.object(shape).passthrough();
}

export function DynamicQuoteForm({ fields, onSubmit, isLoading, defaultData, programName }: DynamicQuoteFormProps) {
  const visibleFields = useMemo(() => fields.filter(f => f.visible !== false), [fields]);

  const schema = useMemo(() => buildValidationSchema(fields), [fields]);

  const defaultValues = useMemo(() => {
    const vals: Record<string, any> = { _noop_: '' };
    visibleFields.forEach(f => {
      if (defaultData && defaultData[f.fieldKey] !== undefined) {
        let val = defaultData[f.fieldKey];
        // yes_no fields are stored as booleans by handleFormSubmit; convert back to strings for the Select.
        if (f.fieldType === 'yes_no' && typeof val === 'boolean') {
          val = val ? 'Yes' : 'No';
        }
        // For select fields, if the stored value is a human label rather than an option ID,
        // reverse-resolve it back to the option ID so the Select renders correctly.
        if ((f.fieldType === 'select' || f.fieldType === 'radio') && val && typeof val === 'string') {
          const options = f.options || [];
          const hasDirectMatch = options.some((o: any) => {
            const v = typeof o === 'string' ? o : o?.value;
            return v === val;
          });
          if (!hasDirectMatch) {
            const byLabel = options.find((o: any) => {
              if (typeof o === 'string') return o.toLowerCase() === val.toLowerCase();
              return o?.label?.toLowerCase() === val.toLowerCase();
            });
            if (byLabel) {
              val = typeof byLabel === 'string' ? byLabel : (byLabel.value ?? val);
            }
          }
        }
        vals[f.fieldKey] = val;
      } else {
        vals[f.fieldKey] = '';
      }
    });
    return vals;
  }, [visibleFields, defaultData]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // Sync form when defaultData changes from outside (e.g. quote duplication or reset).
  // Safe because defaultValues reverse-resolves human labels to option IDs before applying.
  useEffect(() => {
    form.reset(defaultValues);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultData]);

  const handleFormSubmit = (data: Record<string, any>) => {
    const cleaned: Record<string, any> = {};
    visibleFields.forEach(f => {
      const val = data[f.fieldKey];
      if (val !== undefined && val !== '') {
        if (f.fieldType === 'yes_no') {
          cleaned[f.fieldKey] = val === 'Yes' ? true : val === 'No' ? false : val;
        } else {
          cleaned[f.fieldKey] = val;
        }
      }
    });
    onSubmit(cleaned);
  };

  const groups = useMemo(() => {
    const grouped: Record<string, QuoteFormField[]> = {};
    visibleFields.forEach(f => {
      const group = f.displayGroup || 'loan_details';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(f);
    });
    return grouped;
  }, [visibleFields]);

  const groupOrder = useMemo(() => {
    const known = ['pricing_questions', 'loan_details', 'property_details', 'borrower_details'];
    const extra = Object.keys(groups).filter(g => !known.includes(g));
    return [...known, ...extra];
  }, [groups]);

  if (visibleFields.length === 0) {
    return (
      <Card className="w-full bg-background/90 backdrop-blur-sm shadow-xl border-border/60 overflow-hidden">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No form fields configured for this program.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full bg-background/90 backdrop-blur-sm shadow-xl border-border/60 overflow-hidden" data-testid="dynamic-quote-form">
      <CardHeader className="bg-primary/5 border-b border-primary/10 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
              {programName || 'Loan Parameters'}
            </CardTitle>
          </div>
        </div>
        <CardDescription className="text-base text-muted-foreground mt-2">
          Fill in the details below to receive a pricing quote.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-8 px-6 pb-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-8">
            {groupOrder.map((groupKey, groupIdx) => {
              const groupFields = groups[groupKey];
              if (!groupFields || groupFields.length === 0) return null;
              const config = GROUP_CONFIG[groupKey] || { label: groupKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: DollarSign };
              const Icon = config.icon;

              const isPricing = groupKey === 'pricing_questions';

              return (
                <div key={groupKey}>
                  {groupIdx > 0 && <div className="h-px bg-border mb-8" />}
                  <div className={isPricing ? "space-y-6 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30 rounded-lg p-5 -mx-1" : "space-y-6"}>
                    <h3 className={isPricing
                      ? "text-lg font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2"
                      : "text-lg font-semibold text-foreground flex items-center gap-2"
                    }>
                      <Icon className={isPricing ? "w-5 h-5 text-amber-600 dark:text-amber-400" : "w-5 h-5 text-muted-foreground"} />
                      {config.label}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {groupFields.map((field) => (
                        <ConditionalField key={field.fieldKey} field={field} control={form.control}>
                          <FieldRenderer field={field} control={form.control} />
                        </ConditionalField>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 text-lg font-semibold shadow-lg shadow-primary/20 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 transition-all duration-300"
              data-testid="button-submit-quote"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Calculating...
                </>
              ) : (
                "Get Pricing Quote"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
