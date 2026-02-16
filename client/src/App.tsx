import { Switch, Route, useRoute, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Quotes from "@/pages/quotes";
import SignPage from "@/pages/sign";
import Agreements from "@/pages/agreements";
import AgreementDetail from "@/pages/agreement-detail";
import Deals from "@/pages/deals";
import DealDetail from "@/pages/deal-detail";
import NewDeal from "@/pages/new-deal";
import BorrowerPortal from "@/pages/borrower-portal";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminSettings from "@/pages/admin/settings";
import AdminDeals from "@/pages/admin/deals";
import AdminDealDetail from "@/pages/admin/deal-detail";
import AdminPartners from "@/pages/admin/partners";
import AdminPrograms from "@/pages/admin/programs";
import AdminCreditPolicies from "@/pages/admin/credit-policies";
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
import AdminAIReview from "@/pages/admin/ai-review";
import AdminCommercialConfig from "@/pages/admin/commercial-config";

import ProcessorDashboard from "@/pages/admin/processor-dashboard";
import AIAgentsPage from "@/pages/admin/ai-agents";

import BrokerContactsPage from "@/pages/broker-contacts";
import BrokerOutreachPage from "@/pages/broker-outreach";

import { AppLayout } from "@/components/AppLayout";
import PublicHomePage from "@/pages/public/home";
import PublicPricingPage from "@/pages/public/pricing";
import PublicUseCasesPage from "@/pages/public/use-cases";
import PublicContactPage from "@/pages/public/contact";
import { Loader2 } from "lucide-react";

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

  if (!user?.userType) {
    return <Redirect to="/select-role" />;
  }

  return (
    <RouteErrorBoundary routeName={Component.displayName || Component.name || 'Route'}>
      <Component />
    </RouteErrorBoundary>
  );
}

function AdminProtectedRoute({ component: Component }: { component: React.ComponentType }) {
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

  if (!user?.userType) {
    return <Redirect to="/select-role" />;
  }

  const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
  if (!isAdmin) {
    return <Redirect to="/" />;
  }

  return (
    <RouteErrorBoundary routeName={Component.displayName || Component.name || 'Admin Route'}>
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
          <Route path="/agreements" component={() => <ProtectedRoute component={Agreements} />} />
          <Route path="/agreements/:id" component={() => <ProtectedRoute component={AgreementDetail} />} />
          <Route path="/commissions" component={() => <ProtectedRoute component={CommissionsPage} />} />
          <Route path="/deals" component={() => <ProtectedRoute component={Deals} />} />
          <Route path="/deals/new" component={() => <ProtectedRoute component={NewDeal} />} />
          <Route path="/deals/:id" component={() => <ProtectedRoute component={DealDetail} />} />
          <Route path="/projects" component={() => <Redirect to="/deals" />} />
          <Route path="/projects/new" component={() => <Redirect to="/deals/new" />} />
          <Route path="/projects/:id">{(params) => <Redirect to={`/deals/${params.id}`} />}</Route>
          <Route path="/messages" component={() => <ProtectedRoute component={MessagesPage} />} />
          <Route path="/resources" component={() => <ProtectedRoute component={ResourcesPage} />} />
          <Route path="/borrower-quote" component={() => <ProtectedRoute component={BorrowerQuote} />} />
          <Route path="/borrower-quotes" component={() => <ProtectedRoute component={BorrowerQuotes} />} />
          <Route path="/commercial/dashboard" component={() => <ProtectedRoute component={CommercialDashboard} />} />
          <Route path="/commercial/pre-screen" component={() => <ProtectedRoute component={CommercialPreScreenPage} />} />
          <Route path="/commercial-submission/new" component={() => <ProtectedRoute component={CommercialSubmissionPage} />} />
          <Route path="/commercial-submission/:id/confirmation" component={() => <ProtectedRoute component={CommercialSubmissionConfirmation} />} />
          <Route path="/commercial-submission/:id" component={() => <ProtectedRoute component={CommercialSubmissionDetail} />} />

          {/* Broker CRM Routes */}
          <Route path="/broker/contacts" component={() => <ProtectedRoute component={BrokerContactsPage} />} />
          <Route path="/broker/outreach" component={() => <ProtectedRoute component={BrokerOutreachPage} />} />

          {/* Admin Routes */}
          <Route path="/admin" component={() => <AdminProtectedRoute component={AdminDashboard} />} />
          <Route path="/admin/dashboard" component={() => <AdminProtectedRoute component={AdminDashboard} />} />
          <Route path="/admin/deals" component={() => <AdminProtectedRoute component={AdminDeals} />} />
          <Route path="/admin/deals/:id" component={() => <AdminProtectedRoute component={AdminDealDetail} />} />
          <Route path="/admin/partners" component={() => <AdminProtectedRoute component={AdminPartners} />} />
          <Route path="/admin/credit-policies" component={() => <AdminProtectedRoute component={AdminCreditPolicies} />} />
          <Route path="/admin/programs" component={() => <AdminProtectedRoute component={AdminPrograms} />} />
          <Route path="/admin/users" component={() => <AdminProtectedRoute component={AdminUsers} />} />
          <Route path="/admin/projects" component={() => <Redirect to="/admin/deals" />} />
          <Route path="/admin/projects/:id">{(params) => <Redirect to={`/admin/deals/${params.id}`} />}</Route>
          <Route path="/admin/settings" component={() => <AdminProtectedRoute component={AdminSettings} />} />
          <Route path="/admin/onboarding" component={() => <AdminProtectedRoute component={AdminOnboarding} />} />
          <Route path="/admin/digests" component={() => <AdminProtectedRoute component={AdminDigests} />} />
          <Route path="/admin/document-templates" component={() => <AdminProtectedRoute component={AdminDocumentTemplates} />} />
          <Route path="/admin/document-templates/:id" component={() => <AdminProtectedRoute component={AdminTemplateEditor} />} />
          <Route path="/admin/ai-review" component={() => <AdminProtectedRoute component={AdminAIReview} />} />
          <Route path="/admin/commercial-submissions" component={() => <AdminProtectedRoute component={AdminCommercialSubmissions} />} />
          <Route path="/admin/commercial/submissions/:id" component={() => <AdminProtectedRoute component={AdminCommercialDealDetail} />} />
          <Route path="/admin/commercial/config" component={() => <AdminProtectedRoute component={AdminCommercialConfig} />} />
          <Route path="/admin/processor" component={() => <AdminProtectedRoute component={ProcessorDashboard} />} />
          <Route path="/admin/ai-agents" component={() => <AdminProtectedRoute component={AIAgentsPage} />} />

          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </ErrorBoundary>
  );
}

function AppContent() {
  const [isSignPage] = useRoute("/sign/:token");
  const [isPortalPage] = useRoute("/portal/:token");
  const [isLoginPage] = useRoute("/login");
  const [isRegisterPage] = useRoute("/register");
  const [isForgotPasswordPage] = useRoute("/forgot-password");
  const [isResetPasswordPage] = useRoute("/reset-password/:token");
  const [isOnboardingPage] = useRoute("/onboarding");
  const [isSelectRolePage] = useRoute("/select-role");
  const [isPublicPricingPage] = useRoute("/pricing");
  const [isPublicUseCasesPage] = useRoute("/use-cases");
  const [isPublicContactPage] = useRoute("/contact");
  const [isHomePage] = useRoute("/");

  const { isAuthenticated, isLoading } = useAuth();

  const isPublicAuthPage = isLoginPage || isRegisterPage || isForgotPasswordPage || isResetPasswordPage;
  // Only show public marketing pages for NON-authenticated users
  // The "/" route must fall through to MainRoutes for authenticated users (their dashboard)
  const isPublicMarketingPage = !isLoading && !isAuthenticated && (isHomePage || isPublicPricingPage || isPublicUseCasesPage || isPublicContactPage);

  if (isSignPage) {
    return (
      <Switch>
        <Route path="/sign/:token" component={SignPage} />
      </Switch>
    );
  }

  if (isPortalPage) {
    return (
      <Switch>
        <Route path="/portal/:token" component={BorrowerPortal} />
      </Switch>
    );
  }

  if (isPublicAuthPage) {
    return (
      <Switch>
        <Route path="/login" component={() => <AuthRoute component={LoginPage} />} />
        <Route path="/register" component={() => <AuthRoute component={RegisterPage} />} />
        <Route path="/forgot-password" component={() => <AuthRoute component={ForgotPasswordPage} />} />
        <Route path="/reset-password/:token" component={() => <AuthRoute component={ResetPasswordPage} />} />
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
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
