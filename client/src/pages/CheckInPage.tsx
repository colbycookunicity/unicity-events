import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, CheckCircle, User, Shirt, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Registration, Event } from "@shared/schema";

export default function CheckInPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string>("");

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: registrations, isLoading } = useQuery<Registration[]>({
    queryKey: ["/api/registrations", selectedEvent],
    enabled: !!selectedEvent,
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/registrations/${id}/check-in`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registrations"] });
      toast({ title: t("success"), description: "Attendee checked in successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to check in", variant: "destructive" });
    },
  });

  const markSwagMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/registrations/${id}`, { swagStatus: "picked_up" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/registrations"] });
      toast({ title: t("success"), description: "Swag marked as picked up" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update swag status", variant: "destructive" });
    },
  });

  const filteredRegistrations = registrations?.filter((reg) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      reg.firstName.toLowerCase().includes(searchLower) ||
      reg.lastName.toLowerCase().includes(searchLower) ||
      reg.email.toLowerCase().includes(searchLower) ||
      reg.unicityId?.toLowerCase().includes(searchLower)
    );
  });

  const checkedInCount = registrations?.filter((r) => r.status === "checked_in").length ?? 0;
  const totalCount = registrations?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("checkIn")}</h1>
        <p className="text-muted-foreground">Check in attendees and manage swag distribution</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Select value={selectedEvent} onValueChange={setSelectedEvent}>
          <SelectTrigger className="w-[300px]" data-testid="select-checkin-event">
            <SelectValue placeholder="Select an event" />
          </SelectTrigger>
          <SelectContent>
            {events?.filter(e => e.status === "published").map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedEvent && (
          <Badge variant="secondary" className="text-sm">
            {checkedInCount} / {totalCount} checked in
          </Badge>
        )}
      </div>

      {selectedEvent && (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-lg"
              autoFocus
              data-testid="input-checkin-search"
            />
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-3">
                    <div className="h-6 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-10 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredRegistrations?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{t("noResults")}</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? "No attendees match your search" : "No registrations for this event"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRegistrations?.map((reg) => (
                <Card
                  key={reg.id}
                  className={reg.status === "checked_in" ? "border-green-200 dark:border-green-900" : ""}
                  data-testid={`card-checkin-${reg.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-xl font-semibold">
                          {reg.firstName} {reg.lastName}
                        </CardTitle>
                        <CardDescription>{reg.email}</CardDescription>
                      </div>
                      <StatusBadge status={reg.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {reg.unicityId && (
                        <span className="flex items-center gap-1.5">
                          <User className="h-4 w-4" />
                          {reg.unicityId}
                        </span>
                      )}
                      {reg.shirtSize && (
                        <span className="flex items-center gap-1.5">
                          <Shirt className="h-4 w-4" />
                          {reg.shirtSize}
                        </span>
                      )}
                      {reg.swagStatus && (
                        <span className="flex items-center gap-1.5">
                          <Package className="h-4 w-4" />
                          <StatusBadge status={reg.swagStatus} type="swag" />
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {reg.status !== "checked_in" ? (
                        <Button
                          onClick={() => checkInMutation.mutate(reg.id)}
                          disabled={checkInMutation.isPending}
                          className="flex-1"
                          data-testid={`button-checkin-${reg.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Check In
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Checked In {reg.checkedInAt && `at ${format(new Date(reg.checkedInAt), "h:mm a")}`}
                        </Badge>
                      )}

                      {reg.swagStatus !== "picked_up" && (
                        <Button
                          variant="outline"
                          onClick={() => markSwagMutation.mutate(reg.id)}
                          disabled={markSwagMutation.isPending}
                          data-testid={`button-swag-${reg.id}`}
                        >
                          <Package className="h-4 w-4 mr-2" />
                          {t("markSwagPickedUp")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!selectedEvent && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Select an Event</h3>
            <p className="text-muted-foreground">Choose an event to start checking in attendees</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
