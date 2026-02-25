import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Calendar, MapPin, Users, MoreHorizontal, Archive, Trash2, Eye, FileEdit, ExternalLink, Lock, Unlock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { EventWithStats } from "@shared/schema";

export default function EventsPage() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventToDelete, setEventToDelete] = useState<EventWithStats | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: events, isLoading } = useQuery<EventWithStats[]>({
    queryKey: ["/api/events"],
  });

  const statusMutation = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: string }) => {
      return apiRequest("PATCH", `/api/events/${eventId}`, { status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const statusLabels: Record<string, string> = {
        draft: "Draft",
        published: "Published",
        archived: "Archived",
      };
      toast({ title: t("success"), description: `Event status changed to ${statusLabels[variables.status]}` });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update event status", variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("PATCH", `/api/events/${eventId}`, { status: "archived" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: t("success"), description: "Event archived successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to archive event", variant: "destructive" });
    },
  });

  const toggleRegistrationMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("POST", `/api/events/${eventId}/toggle-registration`);
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const isClosed = !!data.registrationClosedAt;
      toast({ title: t("success"), description: isClosed ? "Registration closed" : "Registration reopened" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to toggle registration", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("DELETE", `/api/events/${eventId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setShowDeleteConfirm(false);
      setEventToDelete(null);
      toast({ title: "Event Deleted", description: "The event and all associated data have been permanently deleted." });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to delete event", variant: "destructive" });
    },
  });

  const filteredEvents = events?.filter((event) => {
    const matchesSearch =
      event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.nameEs?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || event.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Sort: non-archived events first (closest start date to today at top), then archived at bottom
  const sortedEvents = useMemo(() => {
    if (!filteredEvents) return undefined;
    const now = Date.now();
    return [...filteredEvents].sort((a, b) => {
      const aArchived = a.status === "archived";
      const bArchived = b.status === "archived";
      // Archived events go to the bottom
      if (aArchived !== bArchived) return aArchived ? 1 : -1;
      // Among non-archived: sort by absolute distance from now (closest first)
      if (!aArchived) {
        const aTime = a.startDate ? Math.abs(new Date(a.startDate).getTime() - now) : Infinity;
        const bTime = b.startDate ? Math.abs(new Date(b.startDate).getTime() - now) : Infinity;
        return aTime - bTime;
      }
      // Among archived: most recent first
      const aTime = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bTime = b.startDate ? new Date(b.startDate).getTime() : 0;
      return bTime - aTime;
    });
  }, [filteredEvents]);

  const getEventName = (event: EventWithStats) => {
    if (language === "es" && event.nameEs) {
      return event.nameEs;
    }
    return event.name;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("events")}</h1>
          <p className="text-muted-foreground">Manage your events and registrations</p>
        </div>
        <Link href="/admin/events/new">
          <Button data-testid="button-create-event">
            <Plus className="h-4 w-4 mr-2" />
            {t("createEvent")}
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-events"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">{t("draft")}</SelectItem>
            <SelectItem value="published">{t("published")}</SelectItem>
            <SelectItem value="private">{t("private")}</SelectItem>
            <SelectItem value="archived">{t("archived")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24 ml-auto" />
            </div>
          ))}
        </div>
      ) : sortedEvents?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("noResults")}</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery
                ? "No events match your search criteria"
                : "Get started by creating your first event"}
            </p>
            {!searchQuery && (
              <Link href="/admin/events/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("createEvent")}
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {sortedEvents?.map((event) => (
            <div
              key={event.id}
              className="group relative flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover-elevate transition-colors"
              data-testid={`card-event-${event.id}`}
            >
              <Link href={`/admin/events/${event.id}`} className="absolute inset-0 z-0" />

              {/* Event name */}
              <div className="min-w-0 flex-1 relative z-10 pointer-events-none">
                <span className="font-medium truncate block">{getEventName(event)}</span>
              </div>

              {/* Date */}
              {event.startDate && (
                <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap pointer-events-none relative z-10">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(event.startDate), "MMM d, yyyy")}
                  {event.endDate && event.endDate !== event.startDate && (
                    <> – {format(new Date(event.endDate), "MMM d, yyyy")}</>
                  )}
                </span>
              )}

              {/* Location */}
              {event.location && (
                <span className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap pointer-events-none relative z-10">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="max-w-[160px] truncate">{event.location}</span>
                </span>
              )}

              {/* Attendees */}
              <Link href={`/admin/attendees?event=${event.id}`} className="relative z-10">
                <span
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate active-elevate-2 px-1.5 py-0.5 rounded-md cursor-pointer whitespace-nowrap"
                  data-testid={`link-attendees-${event.id}`}
                >
                  <Users className="h-3.5 w-3.5" />
                  {event.totalRegistrations ?? 0}
                  {event.capacity && ` / ${event.capacity}`}
                </span>
              </Link>

              {/* Registration link */}
              {event.slug && (
                <a
                  href={`/register/${event.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-10 flex items-center gap-1 text-sm text-muted-foreground hover-elevate active-elevate-2 px-1.5 py-0.5 rounded-md cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`link-registration-${event.id}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {/* Status badge */}
              <div className="relative z-10 pointer-events-none">
                <StatusBadge status={event.registrationClosedAt ? "registration_closed" : event.status} type="event" />
              </div>

              {/* Actions menu */}
              <div className="relative z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-event-menu-${event.id}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <Link href={`/admin/attendees?event=${event.id}`}>
                      <DropdownMenuItem data-testid={`action-attendees-${event.id}`}>
                        <Users className="h-4 w-4 mr-2" />
                        View Attendees
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    {event.status !== "published" && (
                      <DropdownMenuItem
                        onClick={() => statusMutation.mutate({ eventId: event.id, status: "published" })}
                        data-testid={`action-publish-${event.id}`}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Publish
                      </DropdownMenuItem>
                    )}
                    {event.status !== "draft" && (
                      <DropdownMenuItem
                        onClick={() => statusMutation.mutate({ eventId: event.id, status: "draft" })}
                        data-testid={`action-draft-${event.id}`}
                      >
                        <FileEdit className="h-4 w-4 mr-2" />
                        Set to Draft
                      </DropdownMenuItem>
                    )}
                    {event.status !== "archived" && (
                      <DropdownMenuItem
                        onClick={() => archiveMutation.mutate(event.id)}
                        data-testid={`action-archive-${event.id}`}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </DropdownMenuItem>
                    )}
                    {event.status === "published" && (
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); toggleRegistrationMutation.mutate(event.id); }}
                        data-testid={`action-toggle-registration-${event.id}`}
                      >
                        {event.registrationClosedAt ? (
                          <><Unlock className="h-4 w-4 mr-2" /> Open Registration</>
                        ) : (
                          <><Lock className="h-4 w-4 mr-2" /> Close Registration</>
                        )}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => { setEventToDelete(event); setShowDeleteConfirm(true); }}
                      data-testid={`action-delete-${event.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event Permanently?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This action cannot be undone. Deleting <strong>{eventToDelete?.name}</strong> will permanently remove:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>All attendee registrations ({eventToDelete?.totalRegistrations ?? 0} registrations)</li>
                <li>All guest information</li>
                <li>All flight records</li>
                <li>All reimbursement data</li>
                <li>All qualified registrant lists</li>
                <li>All CMS page content</li>
              </ul>
              <p className="font-medium mt-2">Consider archiving instead if you want to preserve the data.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => eventToDelete && deleteMutation.mutate(eventToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Yes, Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
