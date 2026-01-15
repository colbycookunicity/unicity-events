import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Mail, Phone, User, Calendar, CreditCard, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import type { Registration, Event, Guest } from "@shared/schema";

type RegistrationWithEvent = Registration & {
  event: Event | null;
  guests: Guest[];
  swagStatus: string;
};

type ProfileData = {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    unicityId: string | null;
    phone: string | null;
  } | null;
  registrations: RegistrationWithEvent[];
};

export default function ProfilePage() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const email = searchParams.get('email');
  const unicityId = searchParams.get('unicityId');

  const queryParams = new URLSearchParams();
  if (email) queryParams.set('email', email);
  if (unicityId) queryParams.set('unicityId', unicityId);

  const { data, isLoading, error } = useQuery<ProfileData>({
    queryKey: ['/api/person-profile', queryParams.toString()],
    queryFn: async () => {
      const response = await fetch(`/api/person-profile?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch profile');
      return response.json();
    },
    enabled: !!(email || unicityId),
  });

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const formatPaymentStatus = (status: string | null) => {
    if (!status) return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  const formatCurrency = (cents: number | null) => {
    if (!cents) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (!email && !unicityId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/attendees">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Person Profile</h1>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No email or Unicity ID provided</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/attendees">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="flex items-start gap-6">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data?.profile) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/attendees">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Person Profile</h1>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No registrations found for this person</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile, registrations } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/attendees">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold" data-testid="text-profile-title">
          {profile.firstName}'s Profile
        </h1>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <Avatar className="h-20 w-20 text-2xl">
              <AvatarFallback className="bg-muted">
                {getInitials(profile.firstName, profile.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-3 flex-1">
              <div>
                <h2 className="text-xl font-semibold" data-testid="text-profile-name">
                  {profile.firstName} {profile.lastName}
                </h2>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  <a 
                    href={`mailto:${profile.email}`} 
                    className="hover:underline text-primary"
                    data-testid="link-email"
                  >
                    {profile.email}
                  </a>
                </div>
                {profile.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4" />
                    <span data-testid="text-phone">{profile.phone}</span>
                  </div>
                )}
                {profile.unicityId && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    <span data-testid="text-unicity-id">ID: {profile.unicityId}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild data-testid="button-email-contact">
                <a href={`mailto:${profile.email}`}>
                  <Mail className="h-4 w-4 mr-2" />
                  Email Contact
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4" data-testid="text-registrations-heading">
          {profile.firstName}'s Registrations
        </h2>
        
        {registrations.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No registrations found</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Registration Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Event Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Payment Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Paid
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Guests
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {registrations.map((reg) => (
                    <tr 
                      key={reg.id} 
                      className="hover:bg-muted/50 transition-colors"
                      data-testid={`row-registration-${reg.id}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(new Date(reg.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        {reg.event ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{reg.event.name}</span>
                            {reg.event.location && (
                              <span className="text-muted-foreground text-xs flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {reg.event.location}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unknown Event</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={reg.status} />
                      </td>
                      <td className="px-4 py-3">
                        {reg.paymentStatus ? (
                          <Badge 
                            variant="outline" 
                            className={
                              reg.paymentStatus === 'paid' 
                                ? 'bg-green-500/10 text-green-600 border-green-500/30'
                                : reg.paymentStatus === 'refunded'
                                ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
                                : 'bg-muted'
                            }
                          >
                            {formatPaymentStatus(reg.paymentStatus)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatCurrency(reg.amountPaidCents)}
                      </td>
                      <td className="px-4 py-3">
                        {reg.guests && reg.guests.length > 0 ? (
                          <Badge variant="secondary">{reg.guests.length}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/attendees?event=${reg.eventId}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-view-${reg.id}`}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {registrations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Total Registrations</div>
                <div className="text-2xl font-semibold" data-testid="text-total-registrations">
                  {registrations.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Active Registrations</div>
                <div className="text-2xl font-semibold" data-testid="text-active-registrations">
                  {registrations.filter(r => r.status === 'registered' || r.status === 'checked_in').length}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Paid</div>
                <div className="text-2xl font-semibold" data-testid="text-total-paid">
                  {formatCurrency(registrations.reduce((sum, r) => sum + (r.amountPaidCents || 0), 0))}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Guests</div>
                <div className="text-2xl font-semibold" data-testid="text-total-guests">
                  {registrations.reduce((sum, r) => sum + (r.guests?.length || 0), 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
