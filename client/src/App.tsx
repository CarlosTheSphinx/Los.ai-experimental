import { Switch, Route, useRoute, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Quotes from "@/pages/quotes";
import SignPage from "@/pages/sign";
import Agreements from "@/pages/agreements";
import AgreementDetail from "@/pages/agreement-detail";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

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

  return <Component />;
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

  return <Component />;
}

function MainRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={() => <ProtectedRoute component={Home} />} />
        <Route path="/quotes" component={() => <ProtectedRoute component={Quotes} />} />
        <Route path="/agreements" component={() => <ProtectedRoute component={Agreements} />} />
        <Route path="/agreements/:id" component={() => <ProtectedRoute component={AgreementDetail} />} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AppContent() {
  const [isSignPage] = useRoute("/sign/:token");
  const [isLoginPage] = useRoute("/login");
  const [isRegisterPage] = useRoute("/register");
  const [isForgotPasswordPage] = useRoute("/forgot-password");
  const [isResetPasswordPage] = useRoute("/reset-password/:token");

  const isPublicAuthPage = isLoginPage || isRegisterPage || isForgotPasswordPage || isResetPasswordPage;

  if (isSignPage) {
    return (
      <Switch>
        <Route path="/sign/:token" component={SignPage} />
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
