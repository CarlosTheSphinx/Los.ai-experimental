import { useTenantConfig } from "@/hooks/use-tenant-config";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { Save, KeyRound, Shield, Globe, Lock } from "lucide-react";

const defaults = {
  passwordLoginEnabled: true,
  magicLinkEnabled: false,
  googleLoginEnabled: false,
  microsoftLoginEnabled: false,
  mfaRequired: false,
  sessionTimeoutMinutes: 480,
  allowedEmailDomains: "",
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumbers: true,
  passwordRequireSpecial: false,
};

export default function AuthSecurityConfig() {
  const { config, isLoading, hasChanges, updateField, save, isPending, isSuccess } =
    useTenantConfig("tenant_auth_security", defaults);
  const { toast } = useToast();

  useEffect(() => {
    if (isSuccess) {
      toast({ title: "Security settings saved", description: "Your authentication and security configuration has been updated." });
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
        <CardTitle data-testid="text-auth-security-title">Authentication & Security</CardTitle>
        <CardDescription data-testid="text-auth-security-description">
          Configure login methods, password policies, and security settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Login Methods</h3>
          </div>
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="passwordLoginEnabled">Password Login</Label>
                <p className="text-sm text-muted-foreground">Allow users to sign in with email and password</p>
              </div>
              <Switch
                id="passwordLoginEnabled"
                data-testid="switch-password-login"
                checked={config.passwordLoginEnabled}
                onCheckedChange={(checked) => updateField("passwordLoginEnabled", checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="magicLinkEnabled">Magic Link</Label>
                <p className="text-sm text-muted-foreground">Allow passwordless sign-in via email link</p>
              </div>
              <Switch
                id="magicLinkEnabled"
                data-testid="switch-magic-link"
                checked={config.magicLinkEnabled}
                onCheckedChange={(checked) => updateField("magicLinkEnabled", checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="googleLoginEnabled">Google Login</Label>
                <p className="text-sm text-muted-foreground">Allow users to sign in with Google</p>
              </div>
              <Switch
                id="googleLoginEnabled"
                data-testid="switch-google-login"
                checked={config.googleLoginEnabled}
                onCheckedChange={(checked) => updateField("googleLoginEnabled", checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="microsoftLoginEnabled">Microsoft Login</Label>
                <p className="text-sm text-muted-foreground">Allow users to sign in with Microsoft</p>
              </div>
              <Switch
                id="microsoftLoginEnabled"
                data-testid="switch-microsoft-login"
                checked={config.microsoftLoginEnabled}
                onCheckedChange={(checked) => updateField("microsoftLoginEnabled", checked)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Security</h3>
          </div>
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="mfaRequired">Require Multi-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground">Enforce MFA for all users in this tenant</p>
              </div>
              <Switch
                id="mfaRequired"
                data-testid="switch-mfa-required"
                checked={config.mfaRequired}
                onCheckedChange={(checked) => updateField("mfaRequired", checked)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sessionTimeoutMinutes">Session Timeout (minutes)</Label>
              <Input
                id="sessionTimeoutMinutes"
                data-testid="input-session-timeout"
                type="number"
                min={1}
                value={config.sessionTimeoutMinutes}
                onChange={(e) => updateField("sessionTimeoutMinutes", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Access Control</h3>
          </div>
          <div className="space-y-2">
            <Label htmlFor="allowedEmailDomains">Allowed Email Domains</Label>
            <Input
              id="allowedEmailDomains"
              data-testid="input-allowed-email-domains"
              value={config.allowedEmailDomains}
              onChange={(e) => updateField("allowedEmailDomains", e.target.value)}
              placeholder="example.com, company.org"
            />
            <p className="text-sm text-muted-foreground">Comma-separated. Leave empty to allow all domains.</p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Password Policy</h3>
          </div>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
              <Input
                id="passwordMinLength"
                data-testid="input-password-min-length"
                type="number"
                min={6}
                max={128}
                value={config.passwordMinLength}
                onChange={(e) => updateField("passwordMinLength", parseInt(e.target.value) || 8)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="passwordRequireUppercase">Require Uppercase</Label>
                <p className="text-sm text-muted-foreground">Require at least one uppercase letter</p>
              </div>
              <Switch
                id="passwordRequireUppercase"
                data-testid="switch-require-uppercase"
                checked={config.passwordRequireUppercase}
                onCheckedChange={(checked) => updateField("passwordRequireUppercase", checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="passwordRequireNumbers">Require Numbers</Label>
                <p className="text-sm text-muted-foreground">Require at least one numeric character</p>
              </div>
              <Switch
                id="passwordRequireNumbers"
                data-testid="switch-require-numbers"
                checked={config.passwordRequireNumbers}
                onCheckedChange={(checked) => updateField("passwordRequireNumbers", checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="passwordRequireSpecial">Require Special Characters</Label>
                <p className="text-sm text-muted-foreground">Require at least one special character</p>
              </div>
              <Switch
                id="passwordRequireSpecial"
                data-testid="switch-require-special"
                checked={config.passwordRequireSpecial}
                onCheckedChange={(checked) => updateField("passwordRequireSpecial", checked)}
              />
            </div>
          </div>
        </section>

        <Button
          data-testid="button-save-auth-security"
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
