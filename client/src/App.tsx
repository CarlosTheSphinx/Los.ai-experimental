import { Switch, Route, useRoute, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { FeatureFlagProvider } from "@/hooks/use-feature-flags";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Quotes from "@/pages/quotes-unified";
import SignPage from "@/pages/sign";
import Agreements from "@/pages/agreements";
import AgreementDetail from "@/pages/agreement-detail";
import Deals from "@/pages/deals";
import DealDetail from "@/pages/deal-detail";
import NewDeal from "@/pages/new-deal";
import BorrowerPortal from "@/pages/borrower-portal";
import BrokerPortal from "@/pages/broker-portal";
import JoinBorrowerPage from "@/pages/join-borrower";
import JoinBrokerPage from "@/pages/join-broker";
import JoinPersonalPage from "@/pages/join-personal";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import AcceptInvitePage from "@/pages/accept-invite";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminOverview from "@/pages/admin/admin-overview";
import AdminUsers from "@/pages/admin/users";
import AdminSettings from "@/pages/admin/settings";
import AdminTeamPermissions from "@/pages/admin/team-permissions";
import AdminIntegrations from "@/pages/admin/api-keys";
import AdminDeals from "@/pages/admin/deals";

import AdminDealDetail from "@/pages/admin/deal-detail";
import AdminPartners from "@/pages/admin/partners";
import AdminPrograms from "@/pages/admin/programs";
import AdminOnboarding from "@/pages/admin/onboarding";
import AdminDigests from "@/pages/admin/digests";
import AdminDocumentTemplates from "@/pages/admin/document-templates";
import AdminTemplateEditor from "@/pages/admin/template-editor";
import MessagesPage from "@/pages/messages";
import OnboardingPage from "@/pages/onboarding";
import ResourcesPage from "@/pages/resources";
import SelectRolePage from "@/pages/select-role";
import CommercialPreScreenPage from "@/pages/commercial-pre-screen";
import CommercialSubmissionPage from "@/pages/commercial-submission";
import CommercialSubmissionConfirmation from "@/pages/commercial-submission-confirmation";
import CommercialDashboard from "@/pages/commercial-dashboard";
import CommissionsPage from "@/pages/commissions";
import BorrowerQuote from "@/pages/borrower-quote";
import BorrowerQuotes from "@/pages/borrower-quotes";
import AdminCommercialSubmissions from "@/pages/admin/commercial-submissions";
import AdminCommercialDealDetail from "@/pages/admin/commercial-deal-detail";
import CommercialSubmissionDetail from "@/pages/commercial-submission-detail";

import AdminCommercialConfig from "@/pages/admin/commercial-config";

import ProcessorDashboard from "@/pages/admin/processor-dashboard";
import AIAgentsPage from "@/pages/admin/ai-agents";

import SuperAdminDashboard from "@/pages/admin/super-admin-dashboard";
import TenantDetailPage from "@/pages/admin/tenant-detail";
import AdminCreditPolicies from "@/pages/admin/credit-policies";
import EmailInboxPage from "@/pages/admin/email-inbox";
import IntegrationsPage from "@/pages/admin/integrations";
import OnboardingConfigPage from "@/pages/admin/onboarding-config";

import BrokerContactsPage from "@/pages/broker-contacts";
import BrokerOutreachPage from "@/pages/broker-outreach";
import CommercialPipelinePage from "@/pages/admin/commercial-pipeline";
import CommercialFormConfigPage from "@/pages/admin/commercial-form-config";
import CommercialPipelineDetailPage from "@/pages/admin/commercial-pipeline-detail";
import FundManagementPage from "@/pages/admin/fund-management";
import DocumentRulesPage from "@/pages/admin/document-rules";
import BrokerCommercialDeals, { DealForm as BrokerDealForm, DealDetail as BrokerDealDetail } from "@/pages/broker-commercial-deals";
import SettingsPage from "@/pages/settings";
import BorrowerDocumentsPage from "@/pages/borrower-documents";
import BrokerDocumentsPage from "@/pages/broker-documents";
import QuoteDocuments from "@/pages/quote-documents";
import BorrowerPreview from "@/pages/borrower-preview";
import AuthMagicPage from "@/pages/auth-magic";

import { AppLayout } from "@/components/AppLayout";
import PublicHomePage from "@/pages/public/home";
import PublicPricingPage from "@/pages/public/pricing";
import PublicUseCasesPage from "@/pages/public/use-cases";
import PublicContactPage from "@/pages/public/contact";
import PublicApplyPage from "@/pages/public/apply";
import ComingSoonPage from "@/pages/public/coming-soon";
import { Loader2 } from "lucide-react";

const SITE_MODE = import.meta.env.VITE_SITE_MODE || 'full';

function LegacyPortalRedirect({ type }: { type: 'broker' | 'borrower' }) {
  const [, params] = useRoute(type === 'broker' ? "/broker-portal/:token" : "/portal/:token");
  const [, setLocation] = useLocation();
  const token = params?.token;

  const { data, isLoading, error } = useQuery<{ redirectTo: string }>({
    queryKey: ['resolve-portal', type, token],
    queryFn: async () => {
      const res = await fetch(`/api/resolve-portal/${type}/${token}`);
      if (!res.ok) throw new Error('Invalid link');
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (data?.redirectTo) {
    setLocation(data.redirectTo, { replace: true });
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
        <div className="w-full max-w-md mx-4 bg-[#1a2332] border border-gray-700 rounded-lg p-8 text-center space-y-4">
          <div className="h-12 w-12 mx-auto text-red-400 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 className="text-lg font-semibold text-white">Link No Longer Active</h2>
          <p className="text-sm text-gray-400">This portal link is no longer valid. Please contact your lender for an updated link.</p>
          <button onClick={() => setLocation('/login')} className="px-4 py-2 bg-[#C9A84C] hover:bg-[#b8973b] text-white rounded-md text-sm font-medium" data-testid="button-go-login">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1729]">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#C9A84C]" />
        <p className="text-sm text-gray-400">Redirecting to your portal...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!user?.role || user.role === 'user') {
    return <Redirect to="/select-role" />;
  }

  const isAdmin = user?.role && ['admin', 'staff', 'super_admin', 'lender', 'processor'].includes(user.role);
  if (isAdmin && !user?.onboardingCompleted) {
    return <Redirect to="/admin/onboarding" />;
  }

  return (
    <RouteErrorBoundary routeName={Component.displayName || Component.name || 'Route'}>
      <Component />
    </RouteErrorBoundary>
  );
}

function AdminProtectedRoute({ component: Component, skipOnboardingRedirect }: { component: React.ComponentType, skipOnboardingRedirect?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!user?.role || user.role === 'user') {
    return <Redirect to="/select-role" />;
  }

  const isAdmin = user?.role && ['admin', 'staff', 'super_admin', 'lender', 'processor'].includes(user.role);
  if (!isAdmin) {
    return <Redirect to="/" />;
  }

  if (!skipOnboardingRedirect && !user?.onboardingCompleted && location !== '/admin/onboarding') {
    return <Redirect to="/admin/onboarding" />;
  }

  return (
    <RouteErrorBoundary routeName={Component.displayName || Component.name || 'Admin Route'}>
      <Component />
    </RouteErrorBoundary>
  );
}

function SuperAdminProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!user?.role || user.role === 'user') {
    return <Redirect to="/select-role" />;
  }

  if (user?.role !== 'super_admin') {
    return <Redirect to="/" />;
  }

  return (
    <RouteErrorBoundary routeName={Component.displayName || Component.name || 'Super Admin Route'}>
      <Component />
    </RouteErrorBoundary>
  );
}

function AuthRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <RouteErrorBoundary routeName={Component.displayName || Component.name || 'Auth Route'}>
      <Component />
    </RouteErrorBoundary>
  );
}

function MainRoutes() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <Switch>
          <Route path="/" component={() => <ProtectedRoute component={Home} />} />
          <Route path="/quotes" component={() => <ProtectedRoute component={Quotes} />} />
          <Route path="/quotes/:id/documents" component={() => <ProtectedRoute component={QuoteDocuments} />} />
          <Route path="/agreements" component={() => <Redirect to="/quotes?tab=term-sheets" />} />
          <Route path="/agreements/:id" component={() => <ProtectedRoute component={AgreementDetail} />} />
          <Route path="/commissions" component={() => <ProtectedRoute component={CommissionsPage} />} />
          <Route path="/deals" component={() => <ProtectedRoute component={Deals} />} />
          <Route path="/deals/new" component={() => <ProtectedRoute component={NewDeal} />} />
          <Route path="/deals/:id" component={() => <ProtectedRoute component={DealDetail} />} />
          <Route path="/projects" component={() => <Redirect to="/deals" />} />
          <Route path="/projects/new" component={() => <Redirect to="/deals/new" />} />
          <Route path="/projects/:id">{(params) => <Redirect to={`/deals/${params.id}`} />}</Route>
          <Route path="/inbox" component={() => <ProtectedRoute component={MessagesPage} />} />
          <Route path="/messages" component={() => <Redirect to="/inbox" />} />
          <Route path="/resources" component={() => <ProtectedRoute component={ResourcesPage} />} />
          <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
          <Route path="/documents" component={() => <ProtectedRoute component={BorrowerDocumentsPage} />} />
          <Route path="/borrower-quote" component={() => <Redirect to="/quotes" />} />
          <Route path="/borrower-quotes" component={() => <Redirect to="/quotes" />} />
          <Route path="/commercial/dashboard" component={() => <ProtectedRoute component={CommercialDashboard} />} />
          <Route path="/commercial/pre-screen" component={() => <ProtectedRoute component={CommercialPreScreenPage} />} />
          <Route path="/commercial-submission/new" component={() => <ProtectedRoute component={CommercialSubmissionPage} />} />
          <Route path="/commercial-submission/:id/confirmation" component={() => <ProtectedRoute component={CommercialSubmissionConfirmation} />} />
          <Route path="/commercial-submission/:id" component={() => <ProtectedRoute component={CommercialSubmissionDetail} />} />

          {/* Broker Commercial Deals */}
          <Route path="/commercial-deals/new" component={() => <ProtectedRoute component={BrokerDealForm} />} />
          <Route path="/commercial-deals/:id/edit" component={() => <ProtectedRoute component={BrokerDealForm} />} />
          <Route path="/commercial-deals/:id" component={() => <ProtectedRoute component={BrokerDealDetail} />} />
          <Route path="/commercial-deals" component={() => <ProtectedRoute component={BrokerCommercialDeals} />} />

          {/* Broker Routes */}
          <Route path="/broker/documents" component={() => <ProtectedRoute component={BrokerDocumentsPage} />} />
          <Route path="/broker/contacts" component={() => <ProtectedRoute component={BrokerContactsPage} />} />
          <Route path="/broker/outreach" component={() => <ProtectedRoute component={BrokerOutreachPage} />} />
          <Route path="/borrower-preview" component={() => <AdminProtectedRoute component={BorrowerPreview} />} />

          {/* Admin Routes */}
          <Route path="/admin/platform" component={() => <SuperAdminProtectedRoute component={SuperAdminDashboard} />} />
          <Route path="/admin/platform/tenants/:tenantId" component={() => <SuperAdminProtectedRoute component={TenantDetailPage} />} />
          <Route path="/admin/overview" component={() => <AdminProtectedRoute component={AdminOverview} />} />
          <Route path="/admin" component={() => <AdminProtectedRoute component={AdminDashboard} />} />
          <Route path="/admin/dashboard" component={() => <AdminProtectedRoute component={AdminDashboard} />} />
          <Route path="/admin/deals" component={() => <AdminProtectedRoute component={AdminDashboard} />} />
          <Route path="/admin/deals/:id" component={() => <AdminProtectedRoute component={AdminDealDetail} />} />
          <Route path="/admin/partners" component={() => <AdminProtectedRoute component={AdminPartners} />} />
          <Route path="/admin/programs" component={() => <AdminProtectedRoute component={AdminPrograms} />} />
          <Route path="/admin/users" component={() => <AdminProtectedRoute component={AdminUsers} />} />
          <Route path="/admin/team-permissions" component={() => <AdminProtectedRoute component={AdminTeamPermissions} />} />
          <Route path="/admin/projects" component={() => <Redirect to="/admin/deals" />} />
          <Route path="/admin/projects/:id">{(params) => <Redirect to={`/admin/deals/${params.id}`} />}</Route>
          <Route path="/admin/settings" component={() => <AdminProtectedRoute component={AdminSettings} />} />
          <Route path="/admin/integrations" component={() => <AdminProtectedRoute component={AdminIntegrations} />} />
          <Route path="/admin/api-keys" component={() => <Redirect to="/admin/integrations" />} />
          <Route path="/admin/onboarding" component={() => <AdminProtectedRoute component={AdminOnboarding} skipOnboardingRedirect />} />
          <Route path="/admin/digests" component={() => <AdminProtectedRoute component={AdminDigests} />} />
          <Route path="/admin/document-templates" component={() => <AdminProtectedRoute component={AdminDocumentTemplates} />} />
          <Route path="/admin/document-templates/:id" component={() => <AdminProtectedRoute component={AdminTemplateEditor} />} />

          <Route path="/admin/commercial-form-config" component={() => <AdminProtectedRoute component={CommercialFormConfigPage} />} />
          <Route path="/admin/commercial-pipeline" component={() => <AdminProtectedRoute component={CommercialPipelinePage} />} />
          <Route path="/admin/commercial-pipeline/:id" component={() => <AdminProtectedRoute component={CommercialPipelineDetailPage} />} />
          <Route path="/admin/commercial/funds" component={() => <AdminProtectedRoute component={FundManagementPage} />} />
          <Route path="/admin/commercial/document-rules" component={() => <AdminProtectedRoute component={DocumentRulesPage} />} />
          <Route path="/admin/commercial-submissions" component={() => <AdminProtectedRoute component={AdminCommercialSubmissions} />} />
          <Route path="/admin/commercial/submissions/:id" component={() => <AdminProtectedRoute component={AdminCommercialDealDetail} />} />
          <Route path="/admin/commercial/config" component={() => <AdminProtectedRoute component={AdminCommercialConfig} />} />
          <Route path="/admin/processor" component={() => <AdminProtectedRoute component={ProcessorDashboard} />} />
          <Route path="/admin/ai-agents" component={() => <AdminProtectedRoute component={AIAgentsPage} />} />
          <Route path="/admin/credit-policies" component={() => <AdminProtectedRoute component={AdminCreditPolicies} />} />
          <Route path="/admin/email" component={() => <AdminProtectedRoute component={EmailInboxPage} />} />
          <Route path="/admin/platform-integrations" component={() => <SuperAdminProtectedRoute component={IntegrationsPage} />} />
          <Route path="/admin/onboarding-config" component={() => <SuperAdminProtectedRoute component={OnboardingConfigPage} />} />


          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </ErrorBoundary>
  );
}

function LandingModeContent() {
  const [isLoginPage] = useRoute("/login");
  const [isRegisterPage] = useRoute("/register");
  const [isForgotPasswordPage] = useRoute("/forgot-password");
  const [isResetPasswordPage] = useRoute("/reset-password/:token");
  const [isAcceptInvitePage] = useRoute("/accept-invite/:token");
  const [isSelectRolePage] = useRoute("/select-role");
  const [isOnboardingPage] = useRoute("/onboarding");
  const [isSignPage] = useRoute("/sign/:token");
  const [isPortalPage] = useRoute("/portal/:token");
  const [isBrokerPortalPage] = useRoute("/broker-portal/:token");
  const [isJoinBorrowerPage] = useRoute("/join/borrower/:token");
  const [isJoinBrokerPage] = useRoute("/join/broker/:token");
  const [isJoinPersonalPage] = useRoute("/join/personal/:token");
  const [isApplyPage] = useRoute("/apply");
  const [isApplyProgramPage] = useRoute("/apply/:programId");
  const [isMagicLinkPage] = useRoute("/auth/magic/:token");

  const { isAuthenticated, isLoading } = useAuth();

  const isPublicAuthPage = isLoginPage || isRegisterPage || isForgotPasswordPage || isResetPasswordPage || isAcceptInvitePage;

  if (isMagicLinkPage) {
    return <Switch><Route path="/auth/magic/:token" component={AuthMagicPage} /></Switch>;
  }
  if (isResetPasswordPage) {
    return <Switch><Route path="/reset-password/:token" component={ResetPasswordPage} /></Switch>;
  }
  if (isSignPage) {
    return <Switch><Route path="/sign/:token" component={SignPage} /></Switch>;
  }
  if (isPortalPage) {
    return <LegacyPortalRedirect type="borrower" />;
  }
  if (isBrokerPortalPage) {
    return <LegacyPortalRedirect type="broker" />;
  }
  if (isJoinBorrowerPage) {
    return <Switch><Route path="/join/borrower/:token" component={JoinBorrowerPage} /></Switch>;
  }
  if (isJoinBrokerPage) {
    return <Switch><Route path="/join/broker/:token" component={JoinBrokerPage} /></Switch>;
  }
  if (isJoinPersonalPage) {
    return <Switch><Route path="/join/personal/:token" component={JoinPersonalPage} /></Switch>;
  }
  if (isPublicAuthPage) {
    return (
      <Switch>
        <Route path="/login" component={() => <AuthRoute component={LoginPage} />} />
        <Route path="/register" component={() => <AuthRoute component={RegisterPage} />} />
        <Route path="/forgot-password" component={() => <AuthRoute component={ForgotPasswordPage} />} />
        <Route path="/reset-password/:token" component={ResetPasswordPage} />
        <Route path="/accept-invite/:token" component={() => <AuthRoute component={AcceptInvitePage} />} />
      </Switch>
    );
  }
  if (isSelectRolePage) {
    return <Switch><Route path="/select-role" component={SelectRolePage} /></Switch>;
  }
  if (isApplyPage || isApplyProgramPage) {
    return <Switch><Route path="/apply/:programId?" component={PublicApplyPage} /></Switch>;
  }
  if (isOnboardingPage) {
    return <Switch><Route path="/onboarding" component={() => <ProtectedRoute component={OnboardingPage} />} /></Switch>;
  }

  if (isAuthenticated && !isLoading) {
    return <MainRoutes />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={ComingSoonPage} />
      <Route>{() => <Redirect to="/" />}</Route>
    </Switch>
  );
}

function AppContent() {
  if (SITE_MODE === 'landing') {
    return <LandingModeContent />;
  }

  return <FullAppContent />;
}

function FullAppContent() {
  const [isSignPage] = useRoute("/sign/:token");
  const [isPortalPage] = useRoute("/portal/:token");
  const [isBrokerPortalPage] = useRoute("/broker-portal/:token");
  const [isJoinBorrowerPage] = useRoute("/join/borrower/:token");
  const [isJoinBrokerPage] = useRoute("/join/broker/:token");
  const [isJoinPersonalPage] = useRoute("/join/personal/:token");
  const [isLoginPage] = useRoute("/login");
  const [isRegisterPage] = useRoute("/register");
  const [isForgotPasswordPage] = useRoute("/forgot-password");
  const [isResetPasswordPage] = useRoute("/reset-password/:token");
  const [isAcceptInvitePage] = useRoute("/accept-invite/:token");
  const [isMagicLinkPage] = useRoute("/auth/magic/:token");
  const [isOnboardingPage] = useRoute("/onboarding");
  const [isSelectRolePage] = useRoute("/select-role");
  const [isPublicPricingPage] = useRoute("/pricing");
  const [isPublicUseCasesPage] = useRoute("/use-cases");
  const [isPublicContactPage] = useRoute("/contact");
  const [isPublicApplyPage] = useRoute("/apply");
  const [isPublicApplyProgramPage] = useRoute("/apply/:programId");
  const [isHomePage] = useRoute("/");

  const { isAuthenticated, isLoading } = useAuth();

  const isPublicAuthPage = isLoginPage || isRegisterPage || isForgotPasswordPage || isResetPasswordPage || isAcceptInvitePage;
  const isPublicMarketingPage = !isLoading && !isAuthenticated && (isHomePage || isPublicPricingPage || isPublicUseCasesPage || isPublicContactPage);

  if (isMagicLinkPage) {
    return <Switch><Route path="/auth/magic/:token" component={AuthMagicPage} /></Switch>;
  }

  if (isResetPasswordPage) {
    return (
      <Switch>
        <Route path="/reset-password/:token" component={ResetPasswordPage} />
      </Switch>
    );
  }

  if (isSignPage) {
    return (
      <Switch>
        <Route path="/sign/:token" component={SignPage} />
      </Switch>
    );
  }

  if (isPortalPage) {
    return <LegacyPortalRedirect type="borrower" />;
  }

  if (isBrokerPortalPage) {
    return <LegacyPortalRedirect type="broker" />;
  }

  if (isJoinBorrowerPage) {
    return (
      <Switch>
        <Route path="/join/borrower/:token" component={JoinBorrowerPage} />
      </Switch>
    );
  }

  if (isJoinBrokerPage) {
    return (
      <Switch>
        <Route path="/join/broker/:token" component={JoinBrokerPage} />
      </Switch>
    );
  }

  if (isJoinPersonalPage) {
    return (
      <Switch>
        <Route path="/join/personal/:token" component={JoinPersonalPage} />
      </Switch>
    );
  }

  if (isPublicAuthPage) {
    return (
      <Switch>
        <Route path="/login" component={() => <AuthRoute component={LoginPage} />} />
        <Route path="/register" component={() => <AuthRoute component={RegisterPage} />} />
        <Route path="/forgot-password" component={() => <AuthRoute component={ForgotPasswordPage} />} />
        <Route path="/reset-password/:token" component={ResetPasswordPage} />
        <Route path="/accept-invite/:token" component={() => <AuthRoute component={AcceptInvitePage} />} />
      </Switch>
    );
  }

  if (isSelectRolePage) {
    return (
      <Switch>
        <Route path="/select-role" component={SelectRolePage} />
      </Switch>
    );
  }

  if (isPublicApplyPage || isPublicApplyProgramPage) {
    return (
      <Switch>
        <Route path="/apply/:programId?" component={PublicApplyPage} />
      </Switch>
    );
  }

  if (isOnboardingPage) {
    return (
      <Switch>
        <Route path="/onboarding" component={() => <ProtectedRoute component={OnboardingPage} />} />
      </Switch>
    );
  }

  if (isPublicMarketingPage) {
    return (
      <Switch>
        <Route path="/" component={PublicHomePage} />
        <Route path="/pricing" component={PublicPricingPage} />
        <Route path="/use-cases" component={PublicUseCasesPage} />
        <Route path="/contact" component={PublicContactPage} />
      </Switch>
    );
  }

  return <MainRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FeatureFlagProvider>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </FeatureFlagProvider>
    </QueryClientProvider>
  );
}

export default App;
