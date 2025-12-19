import { useQuery } from "@tanstack/react-query";
import { Calendar, Users, CheckCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/StatsCard";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { useTranslation } from "@/lib/i18n";
import { format } from "date-fns";
import type { Event, Registration } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

interface DashboardStats {
  totalEvents: number;
  totalRegistrations: number;
  checkedInCount: number;
  upcomingEvents: number;
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: recentEvents, isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events", "recent"],
  });

  const { data: recentRegistrations, isLoading: registrationsLoading } = useQuery<Registration[]>({
    queryKey: ["/api/registrations", "recent"],
  });

  const eventColumns = [
    {
      key: "name",
      header: t("eventName"),
      render: (event: Event) => (
        <div className="font-medium">{event.name}</div>
      ),
    },
    {
      key: "startDate",
      header: t("startDate"),
      render: (event: Event) => (
        <span className="text-muted-foreground">
          {event.startDate ? format(new Date(event.startDate), "MMM d, yyyy") : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (event: Event) => <StatusBadge status={event.status} type="event" />,
    },
  ];

  const registrationColumns = [
    {
      key: "name",
      header: "Attendee",
      render: (reg: Registration) => (
        <div className="font-medium">{reg.firstName} {reg.lastName}</div>
      ),
    },
    {
      key: "email",
      header: t("email"),
      render: (reg: Registration) => (
        <span className="text-muted-foreground">{reg.email}</span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (reg: Registration) => <StatusBadge status={reg.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard")}</h1>
          <p className="text-muted-foreground">Welcome to Unicity Events Admin</p>
        </div>
        <Link href="/admin/events/new">
          <Button data-testid="button-create-event">{t("createEvent")}</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title={t("totalEvents")}
          value={stats?.totalEvents ?? 0}
          icon={Calendar}
          isLoading={statsLoading}
        />
        <StatsCard
          title={t("totalRegistrations")}
          value={stats?.totalRegistrations ?? 0}
          icon={Users}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Checked In"
          value={stats?.checkedInCount ?? 0}
          icon={CheckCircle}
          isLoading={statsLoading}
        />
        <StatsCard
          title={t("upcomingEvents")}
          value={stats?.upcomingEvents ?? 0}
          icon={TrendingUp}
          isLoading={statsLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg font-medium">{t("upcomingEvents")}</CardTitle>
              <CardDescription>Recent and upcoming events</CardDescription>
            </div>
            <Link href="/admin/events">
              <Button variant="ghost" size="sm" data-testid="link-view-all-events">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={eventColumns}
              data={recentEvents ?? []}
              isLoading={eventsLoading}
              getRowKey={(event) => event.id}
              emptyMessage="No events found"
              onRowClick={(event) => setLocation(`/admin/events/${event.id}`)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg font-medium">{t("recentActivity")}</CardTitle>
              <CardDescription>Latest registrations</CardDescription>
            </div>
            <Link href="/admin/attendees">
              <Button variant="ghost" size="sm" data-testid="link-view-all-attendees">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={registrationColumns}
              data={recentRegistrations ?? []}
              isLoading={registrationsLoading}
              getRowKey={(reg) => reg.id}
              emptyMessage="No recent registrations"
              onRowClick={() => setLocation("/admin/attendees")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
