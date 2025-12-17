import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardCheck,
  FileBarChart,
  Settings,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const mainMenuItems = [
    {
      title: t("dashboard"),
      url: "/admin",
      icon: LayoutDashboard,
    },
    {
      title: t("events"),
      url: "/admin/events",
      icon: Calendar,
    },
    {
      title: t("attendees"),
      url: "/admin/attendees",
      icon: Users,
    },
    {
      title: t("checkIn"),
      url: "/admin/check-in",
      icon: ClipboardCheck,
    },
    {
      title: t("reports"),
      url: "/admin/reports",
      icon: FileBarChart,
    },
  ];

  const secondaryMenuItems = [
    {
      title: t("settings"),
      url: "/admin/settings",
      icon: Settings,
    },
  ];

  const isActive = (url: string) => {
    if (url === "/admin") {
      return location === "/admin";
    }
    return location.startsWith(url);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "event_manager":
        return "Event Manager";
      case "marketing":
        return "Marketing";
      default:
        return "Read Only";
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold text-lg">
            U
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">Unicity Events</span>
            <span className="text-xs text-sidebar-foreground/70">Admin Portal</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.url.replace(/\//g, "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.url.replace(/\//g, "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {user && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm">
                  {user.name?.substring(0, 2).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate">{user.name}</span>
                <Badge variant="secondary" className="w-fit text-xs">
                  {getRoleLabel(user.role)}
                </Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span>{t("signOut")}</span>
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
