import { useTenantConfig } from "@/hooks/use-tenant-config";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { Save, Building2, Palette, Mail, Scale, Upload, X, Image } from "lucide-react";

const defaults = {
  companyName: "",
  logoLightUrl: "",
  logoDarkUrl: "",
  primaryColor: "#1a56db",
  secondaryColor: "#6b7280",
  accentColor: "#f59e0b",
  emailSenderName: "",
  supportEmail: "",
  footerDisclosures: "",
  documentHeaderEnabled: false,
  documentHeaderText: "",
  licensingText: "",
};

function LogoUploadField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  testId: string;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File must be under 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/settings/upload-image', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      onChange(data.url);
      toast({ title: "Logo uploaded successfully" });
    } catch {
      toast({ title: "Failed to upload logo", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-12 w-24 rounded-md border bg-muted/50 flex items-center justify-center overflow-hidden">
            <img
              src={value}
              alt={label}
              className="max-h-full max-w-full object-contain"
              data-testid={`${testId}-preview`}
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground"
              onClick={() => onChange("")}
              data-testid={`${testId}-remove`}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="h-12 w-24 rounded-md border border-dashed flex items-center justify-center text-muted-foreground">
            <Image className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid={`${testId}-upload`}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {uploading ? "Uploading..." : "Upload File"}
            </Button>
            <span className="text-xs text-muted-foreground">or paste URL below</span>
          </div>
          <Input
            data-testid={testId}
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://example.com/logo.png"
            className="text-xs"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
}

export default function BrandingConfig() {
  const { config, isLoading, hasChanges, updateField, save, isPending, isSuccess } =
    useTenantConfig("tenant_branding", defaults);
  const { toast } = useToast();

  useEffect(() => {
    if (isSuccess) {
      toast({ title: "Branding settings saved", description: "Your branding configuration has been updated." });
    }
  }, [isSuccess]);

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
        <CardTitle data-testid="text-branding-title">Branding & White Label</CardTitle>
        <CardDescription data-testid="text-branding-description">
          Customize the look and feel of your platform, including logos, colors, and legal text.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Company Identity</h3>
          </div>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                data-testid="input-company-name"
                value={config.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                placeholder="Your Company Name"
              />
            </div>
            <LogoUploadField
              label="Logo (Light Mode)"
              value={config.logoLightUrl}
              onChange={(url) => updateField("logoLightUrl", url)}
              testId="input-logo-light-url"
            />
            <LogoUploadField
              label="Logo (Dark Mode)"
              value={config.logoDarkUrl}
              onChange={(url) => updateField("logoDarkUrl", url)}
              testId="input-logo-dark-url"
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Brand Colors</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              { key: "primaryColor" as const, label: "Primary Color" },
              { key: "secondaryColor" as const, label: "Secondary Color" },
              { key: "accentColor" as const, label: "Accent Color" },
            ]).map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={key}
                    data-testid={`input-${key}`}
                    value={config[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder="#000000"
                  />
                  <div
                    data-testid={`preview-${key}`}
                    className="h-9 w-9 shrink-0 rounded-md border"
                    style={{ backgroundColor: config[key] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Email Branding</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="emailSenderName">Sender Name</Label>
              <Input
                id="emailSenderName"
                data-testid="input-email-sender-name"
                value={config.emailSenderName}
                onChange={(e) => updateField("emailSenderName", e.target.value)}
                placeholder="Your Company"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                data-testid="input-support-email"
                type="email"
                value={config.supportEmail}
                onChange={(e) => updateField("supportEmail", e.target.value)}
                placeholder="support@example.com"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Legal & Compliance</h3>
          </div>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="footerDisclosures">Footer Disclosures</Label>
              <Textarea
                id="footerDisclosures"
                data-testid="input-footer-disclosures"
                value={config.footerDisclosures}
                onChange={(e) => updateField("footerDisclosures", e.target.value)}
                placeholder="NMLS #, Equal Housing Lender, etc."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licensingText">Licensing Text</Label>
              <Textarea
                id="licensingText"
                data-testid="input-licensing-text"
                value={config.licensingText}
                onChange={(e) => updateField("licensingText", e.target.value)}
                placeholder="Licensed in the following states..."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="documentHeaderEnabled">Document Header</Label>
                <p className="text-sm text-muted-foreground">Display a branded header on generated documents</p>
              </div>
              <Switch
                id="documentHeaderEnabled"
                data-testid="switch-document-header-enabled"
                checked={config.documentHeaderEnabled}
                onCheckedChange={(checked) => updateField("documentHeaderEnabled", checked)}
              />
            </div>
            {config.documentHeaderEnabled && (
              <div className="space-y-2">
                <Label htmlFor="documentHeaderText">Document Header Text</Label>
                <Input
                  id="documentHeaderText"
                  data-testid="input-document-header-text"
                  value={config.documentHeaderText}
                  onChange={(e) => updateField("documentHeaderText", e.target.value)}
                  placeholder="Header text for generated documents"
                />
              </div>
            )}
          </div>
        </section>

        <Button
          data-testid="button-save-branding"
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
