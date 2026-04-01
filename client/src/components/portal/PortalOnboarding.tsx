import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SiGoogle } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Shield,
  BookOpen,
  Rocket,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  FolderKanban,
  Zap,
  MessageSquare,
  Target,
  Inbox,
  DollarSign,
  FileText,
  UserPlus,
  Loader2,
  Building2,
  Upload,
  TrendingUp,
  Send,
  Eye,
  BadgeDollarSign,
} from "lucide-react";

interface OnboardingStep {
  id: number;
  name: string;
  label: string;
  enabled: boolean;
  order: number;
  content: {
    title: string;
    subtitle?: string;
    description?: string;
    url?: string;
    skipEnabled?: boolean;
    body?: string;
    checkboxLabel?: string;
    required?: boolean;
    cards?: Array<{
      id: string;
      icon: string;
      title: string;
      description: string;
      enabled: boolean;
    }>;
    message?: string;
  };
}

interface OnboardingConfig {
  steps: OnboardingStep[];
}

const BORROWER_DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 1, name: "welcome", label: "Welcome", enabled: true, order: 1,
    content: {
      title: "Welcome",
      subtitle: "Let's get you set up",
      description: "We're excited to have you on board. Let's walk through a quick setup.",
    },
  },
  {
    id: 2, name: "account", label: "Account", enabled: true, order: 2,
    content: {
      title: "Create Your Account",
      description: "Sign in or create an account to save your progress and receive updates.",
    },
  },
  {
    id: 3, name: "agreement", label: "Agreement", enabled: true, order: 3,
    content: {
      title: "Agreement",
      body: "By continuing, you acknowledge that you have read and agree to the terms and conditions.",
      checkboxLabel: "I have read and agree to the terms",
      required: true,
    },
  },
  {
    id: 4, name: "tour", label: "Tour", enabled: true, order: 4,
    content: {
      title: "Your Portal",
      description: "Here's what you can do:",
      cards: [
        { id: "inbox", icon: "Inbox", title: "Inbox", description: "View messages and updates about your loan.", enabled: true },
        { id: "loans", icon: "FileText", title: "Loans", description: "Upload documents and track your loan progress.", enabled: true },
      ],
    },
  },
  {
    id: 5, name: "start", label: "Start", enabled: true, order: 5,
    content: {
      title: "You're All Set!",
      message: "Your portal is ready. Let's get started.",
    },
  },
];

const BROKER_DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 1, name: "welcome", label: "Welcome", enabled: true, order: 1,
    content: {
      title: "Welcome",
      subtitle: "Let's get you set up",
      description: "We're excited to have you on board. Let's walk through a quick setup.",
    },
  },
  {
    id: 2, name: "account", label: "Account", enabled: true, order: 2,
    content: {
      title: "Create Your Account",
      description: "Sign in or create an account to save your progress and receive updates.",
    },
  },
  {
    id: 3, name: "profile", label: "Profile", enabled: true, order: 3,
    content: {
      title: "Your Company Profile",
      subtitle: "Help us know your business",
      description: "Tell us about your brokerage so we can match you with the right programs.",
    },
  },
  {
    id: 4, name: "agreement", label: "Agreement", enabled: true, order: 4,
    content: {
      title: "Partnership Agreement",
      body: "By signing this agreement, you acknowledge that you have read and agree to the terms and conditions of our partnership program.",
      checkboxLabel: "I have read and agree to the partnership agreement",
      required: true,
    },
  },
  {
    id: 5, name: "tour", label: "Tour", enabled: true, order: 5,
    content: {
      title: "Your Broker Portal",
      description: "Here's how to get started:",
      cards: [
        { id: "submit-deal", icon: "Send", title: "Submit a Deal", description: "Fill out a quick form with your deal details. Our AI instantly analyzes it and matches it to our lending programs.", enabled: true },
        { id: "track-status", icon: "Eye", title: "Track Deal Status", description: "See real-time updates on every deal — from submission through approval, with AI analysis results included.", enabled: true },
        { id: "upload-docs", icon: "Upload", title: "Upload Documents", description: "Securely upload required documents for each deal. We'll tell you exactly what's needed based on the deal type.", enabled: true },
        { id: "commissions", icon: "BadgeDollarSign", title: "View Commissions", description: "Track your earnings, broker points, and YSP for every closed deal.", enabled: true },
        { id: "messaging", icon: "MessageSquare", title: "Message Our Team", description: "Communicate directly with loan officers and processors through your portal inbox.", enabled: true },
      ],
    },
  },
  {
    id: 6, name: "start", label: "Start", enabled: true, order: 6,
    content: {
      title: "You're All Set!",
      message: "Your portal is ready. Submit your first deal to get started!",
    },
  },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, FolderKanban, Zap, MessageSquare, Target, Inbox, DollarSign, FileText, BookOpen, Shield,
  Send, Eye, Upload, BadgeDollarSign, Building2, TrendingUp,
};

function getIcon(iconName: string) {
  return ICON_MAP[iconName] || BarChart3;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  welcome: CheckCircle2,
  account: UserPlus,
  profile: Building2,
  agreement: Shield,
  tour: BookOpen,
  start: Rocket,
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const LOAN_TYPES = [
  "Bridge", "Construction", "DSCR", "A&D", "Fix & Flip",
  "Long-Term Financing", "Land Development",
];

interface PortalOnboardingProps {
  config?: OnboardingConfig | null;
  portalType: "broker" | "borrower";
  token: string;
  onComplete: () => void;
  magicLinkMode?: boolean;
  lenderCompanyName?: string;
  returnPath?: string;
}

function AccountStep({ portalType, token, returnPath }: { portalType: "broker" | "borrower"; token: string; returnPath?: string }) {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const portalPath = returnPath || (portalType === "broker" ? `/broker-portal/${token}` : `/portal/${token}`);
  const googleAuthUrl = `/api/auth/google?userType=${portalType}&returnTo=${encodeURIComponent(portalPath)}`;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", {
        email: loginEmail,
        password: loginPassword,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid email or password");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (error: any) {
      toast({
        title: "Sign-in failed",
        description: error?.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword.length < 12) {
      toast({ title: "Password must be at least 12 characters", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/register", {
        email: regEmail,
        password: regPassword,
        firstName: regFirstName,
        lastName: regLastName,
        userType: portalType,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Registration failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error?.message || "Could not create account",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="py-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="py-4 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">
            Signed in as {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
        </div>
        <p className="text-xs text-muted-foreground">Your progress will be saved to this account.</p>
      </div>
    );
  }

  return (
    <div className="py-3 space-y-3">
      <Button
        variant="outline"
        className="w-full h-11"
        onClick={() => { window.location.href = googleAuthUrl; }}
        data-testid="button-onboarding-google-auth"
      >
        <SiGoogle className="mr-2 h-4 w-4" />
        Continue with Google
      </Button>

      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          or
        </span>
      </div>

      {authMode === "register" ? (
        <form onSubmit={handleRegister} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label htmlFor="onb-reg-first" className="text-xs">First Name</Label>
              <Input
                id="onb-reg-first"
                value={regFirstName}
                onChange={(e) => setRegFirstName(e.target.value)}
                required
                data-testid="input-onboarding-reg-first"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="onb-reg-last" className="text-xs">Last Name</Label>
              <Input
                id="onb-reg-last"
                value={regLastName}
                onChange={(e) => setRegLastName(e.target.value)}
                required
                data-testid="input-onboarding-reg-last"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="onb-reg-email" className="text-xs">Email</Label>
            <Input
              id="onb-reg-email"
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              required
              data-testid="input-onboarding-reg-email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="onb-reg-password" className="text-xs">Password</Label>
            <Input
              id="onb-reg-password"
              type="password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              required
              minLength={12}
              data-testid="input-onboarding-reg-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-onboarding-register">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create Account
          </Button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="space-y-2.5">
          <div className="space-y-1">
            <Label htmlFor="onb-login-email" className="text-xs">Email</Label>
            <Input
              id="onb-login-email"
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              data-testid="input-onboarding-login-email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="onb-login-password" className="text-xs">Password</Label>
            <Input
              id="onb-login-password"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              data-testid="input-onboarding-login-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-onboarding-login">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sign In
          </Button>
        </form>
      )}

      <div className="text-center text-xs text-muted-foreground">
        {authMode === "register" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className="text-primary hover:underline font-medium"
              data-testid="button-onboarding-switch-to-login"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => setAuthMode("register")}
              className="text-primary hover:underline font-medium"
              data-testid="button-onboarding-switch-to-register"
            >
              Create one
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ProfileStep({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedLoanTypes, setSelectedLoanTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleState = (st: string) => {
    setSelectedStates(prev => prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]);
  };

  const toggleLoanType = (lt: string) => {
    setSelectedLoanTypes(prev => prev.includes(lt) ? prev.filter(l => l !== lt) : [...prev, lt]);
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/auth/profile", {
        brokerCompanyName: companyName,
        brokerLicenseNumber: licenseNumber || null,
        brokerOperatingStates: selectedStates.length > 0 ? selectedStates : null,
        brokerYearsExperience: yearsExperience ? parseInt(yearsExperience) : null,
        brokerPreferredLoanTypes: selectedLoanTypes.length > 0 ? selectedLoanTypes : null,
      });
      if (!res.ok) throw new Error("Failed to save profile");
      onSaved();
    } catch (err: any) {
      toast({ title: "Failed to save profile", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-3 space-y-4 max-h-[400px] overflow-y-auto">
      <div className="space-y-1.5">
        <Label htmlFor="company-name" className="text-xs font-medium">Company Name *</Label>
        <Input
          id="company-name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g., ABC Mortgage Brokerage"
          data-testid="input-broker-company-name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="license-number" className="text-xs font-medium">Broker License # (optional)</Label>
        <Input
          id="license-number"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          placeholder="e.g., NMLS #123456"
          data-testid="input-broker-license"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Years of Experience</Label>
        <Select value={yearsExperience} onValueChange={setYearsExperience}>
          <SelectTrigger data-testid="select-broker-experience">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Less than 1 year</SelectItem>
            <SelectItem value="3">1-3 years</SelectItem>
            <SelectItem value="5">3-5 years</SelectItem>
            <SelectItem value="10">5-10 years</SelectItem>
            <SelectItem value="15">10+ years</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">States You Operate In</Label>
        <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
          {US_STATES.map(st => (
            <label key={st} className="flex items-center gap-1 text-xs cursor-pointer">
              <Checkbox
                checked={selectedStates.includes(st)}
                onCheckedChange={() => toggleState(st)}
                data-testid={`checkbox-state-${st}`}
              />
              {st}
            </label>
          ))}
        </div>
        {selectedStates.length > 0 && (
          <p className="text-xs text-muted-foreground">{selectedStates.length} state(s) selected</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Preferred Loan Types</Label>
        <div className="flex flex-wrap gap-2">
          {LOAN_TYPES.map(lt => (
            <button
              key={lt}
              type="button"
              onClick={() => toggleLoanType(lt)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedLoanTypes.includes(lt)
                  ? "bg-blue-100 border-blue-300 text-blue-700"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
              }`}
              data-testid={`chip-loan-type-${lt.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
            >
              {lt}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={handleSave} className="w-full" disabled={saving} data-testid="button-save-broker-profile">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save & Continue
      </Button>
    </div>
  );
}

export function PortalOnboarding({ config, portalType, token, onComplete, magicLinkMode, lenderCompanyName, returnPath }: PortalOnboardingProps) {
  const { user } = useAuth();

  const { data: tourConfigData } = useQuery<{ settings: Array<{ settingKey: string; settingValue: string }> }>({
    queryKey: ['/api/onboarding/tour-config'],
    enabled: portalType === "broker",
  });

  const defaultSteps = portalType === "broker" ? BROKER_DEFAULT_STEPS : BORROWER_DEFAULT_STEPS;

  const steps = (() => {
    let baseSteps = config?.steps || defaultSteps;

    if (portalType === "broker" && tourConfigData?.settings) {
      const tourSetting = tourConfigData.settings.find(s => s.settingKey === 'broker_onboarding_tour_cards');
      if (tourSetting?.settingValue) {
        try {
          const customCards = JSON.parse(tourSetting.settingValue);
          if (Array.isArray(customCards) && customCards.length > 0) {
            baseSteps = baseSteps.map(step => {
              if (step.name === "tour") {
                return { ...step, content: { ...step.content, cards: customCards } };
              }
              return step;
            });
          }
        } catch {}
      }
    }

    return baseSteps.filter(s => s.enabled).sort((a, b) => a.order - b.order);
  })();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const currentStep = steps[currentStepIndex];
  if (!currentStep) return null;

  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  const StepIcon = STEP_ICONS[currentStep.name] || CheckCircle2;

  const trackStepCompletion = (stepName: string) => {
    if (user) {
      apiRequest("POST", "/api/onboarding/track-step", { stepName, portalType }).catch(() => {});
    }
  };

  const handleNext = () => {
    trackStepCompletion(currentStep.name);
    if (isLastStep) {
      localStorage.setItem(`portal_onboarding_${portalType}_${token}`, "completed");
      if (user) {
        apiRequest("POST", "/api/auth/complete-onboarding", {}).catch(() => {});
      }
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const canProceed = () => {
    if (currentStep.name === "account") {
      return !!user;
    }
    if (currentStep.name === "profile") {
      return profileSaved;
    }
    if (currentStep.name === "agreement" && currentStep.content.required) {
      return agreedToTerms;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4" data-testid="portal-onboarding">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  idx < currentStepIndex
                    ? "bg-blue-600 text-white"
                    : idx === currentStepIndex
                      ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {idx < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${idx < currentStepIndex ? "bg-blue-600" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <StepIcon className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-xl">
              {magicLinkMode && lenderCompanyName && currentStep.name === "welcome"
                ? `Welcome to ${lenderCompanyName}`
                : currentStep.content.title}
            </CardTitle>
            {currentStep.content.subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{currentStep.content.subtitle}</p>
            )}
          </CardHeader>

          <CardContent className="pt-2">
            {currentStep.name === "welcome" && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-600">{currentStep.content.description}</p>
              </div>
            )}

            {currentStep.name === "account" && (
              <AccountStep portalType={portalType} token={token} returnPath={returnPath} />
            )}

            {currentStep.name === "profile" && (
              <ProfileStep onSaved={() => { setProfileSaved(true); handleNext(); }} />
            )}

            {currentStep.name === "agreement" && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{currentStep.content.body}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="agree-terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    data-testid="checkbox-agree-terms"
                  />
                  <label htmlFor="agree-terms" className="text-sm text-gray-700 cursor-pointer">
                    {currentStep.content.checkboxLabel || "I agree to the terms"}
                  </label>
                </div>
              </div>
            )}

            {currentStep.name === "tour" && (
              <div className="py-4 space-y-3">
                {currentStep.content.description && (
                  <p className="text-sm text-gray-600 mb-3">{currentStep.content.description}</p>
                )}
                {currentStep.content.cards?.filter(c => c.enabled).map((card) => {
                  const CardIcon = getIcon(card.icon);
                  return (
                    <div key={card.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white">
                      <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <CardIcon className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{card.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{card.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {currentStep.name === "start" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Rocket className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-sm text-gray-600 mb-4">{currentStep.content.message}</p>
                {portalType === "broker" && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      trackStepCompletion(currentStep.name);
                      localStorage.setItem(`portal_onboarding_${portalType}_${token}`, "completed");
                      if (user) {
                        apiRequest("POST", "/api/auth/complete-onboarding", {}).catch(() => {});
                      }
                      window.location.href = "/commercial-deals/new";
                    }}
                    data-testid="button-submit-first-deal"
                  >
                    <Send className="h-4 w-4" />
                    Submit Your First Deal
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isFirstStep}
                className="gap-1"
                data-testid="button-onboarding-back"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                {currentStep.name === "profile" && !profileSaved && (
                  <Button
                    variant="ghost"
                    onClick={() => { setProfileSaved(true); handleNext(); }}
                    className="text-xs text-muted-foreground"
                    data-testid="button-skip-profile"
                  >
                    Skip for now
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="gap-1"
                  data-testid="button-onboarding-next"
                >
                  {isLastStep ? "Get Started" : "Next"}
                  {!isLastStep && <ChevronRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function hasCompletedOnboarding(portalType: "broker" | "borrower", token: string): boolean {
  return localStorage.getItem(`portal_onboarding_${portalType}_${token}`) === "completed";
}
