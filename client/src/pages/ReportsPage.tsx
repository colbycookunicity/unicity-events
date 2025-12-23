import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { format } from "date-fns";
import { Download, TrendingUp, DollarSign, UserCheck, Calendar } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { Event } from "@shared/schema";

interface RegistrationTrend {
  date: string;
  count: number;
}

interface RevenueStats {
  totalRevenue: number;
  paidGuestCount: number;
  pendingCount: number;
  revenueByEvent: {
    eventId: string;
    eventName: string;
    revenue: number;
    guestCount: number;
  }[];
}

interface CheckInRate {
  eventId: string;
  eventName: string;
  eventDate: Date | null;
  totalRegistrations: number;
  checkedInCount: number;
  checkInRate: number;
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [trendDays, setTrendDays] = useState("30");
  const [exportEventId, setExportEventId] = useState<string>("all");

  const { data: trends, isLoading: trendsLoading } = useQuery<RegistrationTrend[]>({
    queryKey: ["/api/admin/reports/registration-trends", trendDays],
  });

  const { data: revenue, isLoading: revenueLoading } = useQuery<RevenueStats>({
    queryKey: ["/api/admin/reports/revenue"],
  });

  const { data: checkInRates, isLoading: checkInLoading } = useQuery<CheckInRate[]>({
    queryKey: ["/api/admin/reports/check-in-rates"],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleExport = (type: 'registrations' | 'guests' | 'events') => {
    const eventParam = exportEventId !== 'all' ? `?eventId=${exportEventId}` : '';
    window.open(`/api/admin/reports/export/${type}${eventParam}`, '_blank');
  };

  const chartData = trends?.map(t => ({
    date: format(new Date(t.date), "MMM d"),
    registrations: t.count,
  })) || [];

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Analytics and insights for your events</p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-revenue">
                  {formatCurrency(revenue?.totalRevenue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  From {revenue?.paidGuestCount || 0} paid guests
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-pending-count">
                  {revenue?.pendingCount || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Guests awaiting payment
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Check-in Rate</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {checkInLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-avg-checkin">
                  {checkInRates && checkInRates.length > 0
                    ? Math.round(checkInRates.reduce((sum, r) => sum + r.checkInRate, 0) / checkInRates.length)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Across {checkInRates?.length || 0} events
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Registrations</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-recent-registrations">
                  {trends?.reduce((sum, t) => sum + t.count, 0) || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  In the last {trendDays} days
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Registration Trends</CardTitle>
              <CardDescription>Daily registration activity over time</CardDescription>
            </div>
            <Select value={trendDays} onValueChange={setTrendDays}>
              <SelectTrigger className="w-32" data-testid="select-trend-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="registrations" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No registration data for this period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Check-in Rates by Event</CardTitle>
            <CardDescription>Attendance tracking per event</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkInLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : checkInRates && checkInRates.length > 0 ? (
              <div className="space-y-4">
                {checkInRates.slice(0, 5).map((rate) => (
                  <div key={rate.eventId} className="space-y-2" data-testid={`checkin-rate-${rate.eventId}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{rate.eventName}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {rate.checkInRate}%
                      </Badge>
                    </div>
                    <Progress value={rate.checkInRate} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {rate.checkedInCount} of {rate.totalRegistrations} checked in
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No events with registrations yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Event</CardTitle>
            <CardDescription>Guest payment revenue breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : revenue?.revenueByEvent && revenue.revenueByEvent.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenue.revenueByEvent.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    type="number" 
                    tickFormatter={(v) => formatCurrency(v)}
                    className="text-xs fill-muted-foreground"
                  />
                  <YAxis 
                    type="category" 
                    dataKey="eventName" 
                    width={100}
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No revenue data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
          <CardDescription>Download CSV exports of your event data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-2">
              <label className="text-sm font-medium">Filter by Event</label>
              <Select value={exportEventId} onValueChange={setExportEventId}>
                <SelectTrigger className="w-64" data-testid="select-export-event">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {events?.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => handleExport('registrations')}
              data-testid="button-export-registrations"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Registrations
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleExport('guests')}
              data-testid="button-export-guests"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Guests
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleExport('events')}
              data-testid="button-export-events"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Events
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
