import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { lazy, Suspense } from "react";

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminPassword = lazy(() => import("./pages/AdminPassword"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const DASHBOARD_PATH = "/milo-ops-7f3c9a";

function DashboardEntry() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f4faf7] text-sm text-[#6d918a]">กำลังตรวจสอบสิทธิ์...</div>;
  return user ? <Dashboard /> : <AdminLogin />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={DashboardEntry} />
      <Route path="/admin/password" component={AdminPassword} />
      <Route path={DASHBOARD_PATH} component={DashboardEntry} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#f4faf7] text-sm text-[#6d918a]">กำลังโหลด...</div>}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
