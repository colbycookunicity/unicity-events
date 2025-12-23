import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Calendar, MapPin, Users, MoreHorizontal, Archive, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const getEventName = (event: EventWithStats) => {
    if (language === "es" && event.nameEs) {
      return event.nameEs;
    }
    return event.name;
  };

  const stripHtml = (html: string | null) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  };

  const getEventDescription = (event: EventWithStats) => {
    const desc = language === "es" && event.descriptionEs ? event.descriptionEs : event.description;
    return stripHtml(desc);
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredEvents?.length === 0 ? (
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents?.map((event) => (
            <Card key={event.id} className="hover-elevate h-full relative" data-testid={`card-event-${event.id}`}>
              <Link href={`/admin/events/${event.id}`} className="absolute inset-0 z-0" />
              <CardHeader className="pb-3 relative z-10 pointer-events-none">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-medium line-clamp-2">
                    {getEventName(event)}
                  </CardTitle>
                  <div className="flex items-center gap-2 pointer-events-auto">
                    <StatusBadge status={event.status} type="event" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-event-menu-${event.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {event.status !== "archived" && (
                          <DropdownMenuItem
                            onClick={() => archiveMutation.mutate(event.id)}
                            data-testid={`action-archive-${event.id}`}
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            Archive
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
                {event.startDate && (
                  <CardDescription className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(event.startDate), "MMM d, yyyy")}
                    {event.endDate && event.endDate !== event.startDate && (
                      <> - {format(new Date(event.endDate), "MMM d, yyyy")}</>
                    )}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3 relative z-10 pointer-events-none">
                {getEventDescription(event) && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {getEventDescription(event)}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {event.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {event.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {event.totalRegistrations ?? 0}
                    {event.capacity && ` / ${event.capacity}`}
                  </span>
                </div>
              </CardContent>
            </Card>
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
