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
import unicityLogo from "@/assets/unicity-logo.png";
import { useEffect } from "react";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import AdminDashboard from "@/pages/AdminDashboard";
import EventsPage from "@/pages/EventsPage";
import EventFormPage from "@/pages/EventFormPage";
import AttendeesPage from "@/pages/AttendeesPage";
import CheckInPage from "@/pages/CheckInPage";
import RegistrationPage from "@/pages/RegistrationPage";
import UserDashboard from "@/pages/UserDashboard";

function AdminLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
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
      <Switch>
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/events" component={EventsPage} />
        <Route path="/admin/events/new" component={EventFormPage} />
        <Route path="/admin/events/:id" component={EventFormPage} />
        <Route path="/admin/attendees" component={AttendeesPage} />
        <Route path="/admin/check-in" component={CheckInPage} />
        <Route path="/admin/reports" component={AdminDashboard} />
        <Route path="/admin/settings" component={AdminDashboard} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register/:eventId" component={RegistrationPage} />
      <Route path="/my-dashboard" component={UserDashboard} />
      <Route path="/" component={LoginPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading, setUser, setLoading } = useAuth();
  const [location, setLocation] = useLocation();

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
            src={unicityLogo} 
            alt="Unicity" 
            className="h-14 w-14 rounded-md object-cover animate-pulse"
          />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isAdminRoute = location.startsWith("/admin");
  const isPublicRoute = location.startsWith("/register/") || location === "/my-dashboard";
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('authToken');

  if (isAdminRoute && !isAuthenticated && !hasToken) {
    setLocation("/login");
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
