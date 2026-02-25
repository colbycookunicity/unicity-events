import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth, getAuthToken } from "@/lib/auth";
import unicityLogoDark from "@/assets/unicity-logo-dark.png";
import unicityLogoWhite from "@/assets/unicity-logo-white.png";
import unicityIcon from "@/assets/unicity-logo.png";
import { useTheme } from "@/components/ThemeProvider";
import { useEffect, lazy, Suspense } from "react";

// Eagerly loaded: public-facing pages (what 200+ users will hit)
import NotFound from "@/pages/not-found";
import RegistrationPage from "@/pages/RegistrationPage";
import AttendeeEventsPage from "@/pages/AttendeeEventsPage";
import EventLandingPage from "@/pages/EventLandingPage";
import EventListPage from "@/pages/EventListPage";
import GuestRegistrationPage from "@/pages/GuestRegistrationPage";
import GuestPaymentSuccessPage from "@/pages/GuestPaymentSuccessPage";
import UserDashboard from "@/pages/UserDashboard";
import PublicLoginPage from "@/pages/PublicLoginPage";
import ScanPage from "@/pages/ScanPage";
import ProfilePage from "@/pages/ProfilePage";

// Lazy loaded: admin-only pages (only a few admins will use these)
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const EventsPage = lazy(() => import("@/pages/EventsPage"));
const EventFormPage = lazy(() => import("@/pages/EventFormPage"));
const AttendeesPage = lazy(() => import("@/pages/AttendeesPage"));
const CheckInPage = lazy(() => import("@/pages/CheckInPage"));
const SwagPage = lazy(() => import("@/pages/SwagPage"));
const LandingEditorPage = lazy(() => import("@/pages/LandingEditorPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const PrintersPage = lazy(() => import("@/pages/PrintersPage"));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4">
        <img
          src={unicityIcon}
          alt="Unicity"
          className="h-14 w-14 rounded-md object-cover animate-pulse"
        />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function AdminLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const unicityLogo = theme === 'dark' ? unicityLogoWhite : unicityLogoDark;

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="flex items-center gap-2 flex-shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={unicityLogo}
                alt="Unicity"
                className="h-6 object-contain"
                data-testid="img-header-logo"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 pb-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AdminRouter() {
  return (
    <AdminLayout>
      <Suspense fallback={<LazyFallback />}>
        <Switch>
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/events" component={EventsPage} />
          <Route path="/admin/events/new" component={EventFormPage} />
          <Route path="/admin/events/:id/pages/:pageType" component={LandingEditorPage} />
          <Route path="/admin/events/:id/landing" component={LandingEditorPage} />
          <Route path="/admin/events/:id/edit" component={EventFormPage} />
          <Route path="/admin/events/:id" component={EventFormPage} />
          <Route path="/admin/attendees" component={AttendeesPage} />
          <Route path="/admin/profile" component={ProfilePage} />
          <Route path="/admin/check-in" component={CheckInPage} />
          <Route path="/admin/swag" component={SwagPage} />
          <Route path="/admin/reports" component={ReportsPage} />
          <Route path="/admin/printers" component={PrintersPage} />
          <Route path="/admin/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AdminLayout>
  );
}

function RedirectToMyEvents() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/my-events");
  }, [setLocation]);
  return null;
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/admin/login">{() => (
        <Suspense fallback={<LazyFallback />}>
          <LoginPage />
        </Suspense>
      )}</Route>
      <Route path="/scan" component={ScanPage} />
      <Route path="/register/:eventId" component={RegistrationPage} />
      <Route path="/register">{() => <EventListPage />}</Route>
      <Route path="/events/:eventSlug/guest-register" component={GuestRegistrationPage} />
      <Route path="/events/:eventSlug/guest-payment-success" component={GuestPaymentSuccessPage} />
      <Route path="/events/:slug" component={EventLandingPage} />
      <Route path="/my-events" component={AttendeeEventsPage} />
      <Route path="/my-dashboard" component={UserDashboard} />
      <Route path="/" component={RedirectToMyEvents} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading, setUser, setLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { theme } = useTheme();
  const unicityLogo = theme === 'dark' ? unicityLogoWhite : unicityLogoDark;

  useEffect(() => {
    const checkAuth = async (retries = 3) => {
      const token = getAuthToken();
      if (token) {
        try {
          const response = await fetch("/api/auth/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
          } else if (response.status === 401) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem("authToken");
            }
            setLoading(false);
          } else {
            setLoading(false);
          }
        } catch {
          if (retries > 0) {
            setTimeout(() => checkAuth(retries - 1), 1000);
          } else {
            setLoading(false);
          }
        }
      } else {
        setLoading(false);
      }
    };
    checkAuth();
  }, [setUser, setLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img
            src={unicityIcon}
            alt="Unicity"
            className="h-14 w-14 rounded-md object-cover animate-pulse"
          />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isAdminLoginRoute = location === "/admin/login";
  const isAdminRoute = location.startsWith("/admin") && !isAdminLoginRoute;
  const isPublicRoute = location.startsWith("/register/") || location === "/my-dashboard";
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('authToken');

  // Admin login page is public - don't redirect
  if (isAdminLoginRoute) {
    return <PublicRouter />;
  }

  if (isAdminRoute && !isAuthenticated && !hasToken) {
    setLocation("/admin/login");
    return null;
  }

  if (isAdminRoute) {
    return <AdminRouter />;
  }

  return <PublicRouter />;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="unicity-events-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
