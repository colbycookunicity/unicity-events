import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { User, Calendar, AlertCircle, Plane, Receipt, Users, CheckCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import type { RegistrationWithDetails, Event } from "@shared/schema";

interface PendingTask {
  id: string;
  type: "flight" | "receipt" | "guest_payment";
  title: string;
  description: string;
  eventName: string;
}

export default function UserDashboard() {
  const { t, language } = useTranslation();
  const { user } = useAuth();

  const { data: registrations, isLoading } = useQuery<RegistrationWithDetails[]>({
    queryKey: ["/api/my-registrations"],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const pendingTasks: PendingTask[] = [];

  registrations?.forEach((reg) => {
    const event = events?.find((e) => e.id === reg.eventId);
    const eventName = event?.name || "Event";

    if (!reg.flights?.length) {
      pendingTasks.push({
        id: `flight-${reg.id}`,
        type: "flight",
        title: t("flightInfoMissing"),
        description: language === "es" ? "Por favor proporcione su informacion de vuelo" : "Please provide your flight information",
        eventName,
      });
    }

    reg.reimbursements?.forEach((reimb) => {
      if (reimb.status === "pending" && !reimb.receiptPath) {
        pendingTasks.push({
          id: `receipt-${reimb.id}`,
          type: "receipt",
          title: t("receiptMissing"),
          description: language === "es" ? "Suba su recibo para el reembolso" : "Upload your receipt for reimbursement",
          eventName,
        });
      }
    });

    reg.guests?.forEach((guest) => {
      if (guest.paymentStatus === "pending") {
        pendingTasks.push({
          id: `guest-${guest.id}`,
          type: "guest_payment",
          title: t("guestPaymentPending"),
          description: `${guest.firstName} ${guest.lastName}`,
          eventName,
        });
      }
    });
  });

  const getTaskIcon = (type: PendingTask["type"]) => {
    switch (type) {
      case "flight":
        return <Plane className="h-5 w-5" />;
      case "receipt":
        return <Receipt className="h-5 w-5" />;
      case "guest_payment":
        return <Users className="h-5 w-5" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-lg bg-primary text-primary-foreground">
            {user?.name?.substring(0, 2).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("myProfile")}</h1>
          <p className="text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {pendingTasks.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-900">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-lg">{t("pendingTasks")}</CardTitle>
            </div>
            <CardDescription>
              {language === "es"
                ? "Complete estas tareas para finalizar su registro"
                : "Complete these tasks to finalize your registration"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-4 p-3 rounded-md bg-muted/50"
                  data-testid={`pending-task-${task.id}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    {getTaskIcon(task.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {task.eventName} - {task.description}
                    </p>
                  </div>
                  <Button size="sm" data-testid={`button-complete-${task.id}`}>
                    Complete
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("myEvents")}</CardTitle>
          <CardDescription>
            {language === "es" ? "Sus registros de eventos" : "Your event registrations"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : registrations?.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {language === "es"
                  ? "No tiene registros de eventos"
                  : "You have no event registrations"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {registrations?.map((reg) => {
                const event = events?.find((e) => e.id === reg.eventId);
                return (
                  <div
                    key={reg.id}
                    className="flex items-center gap-4 p-4 rounded-md border"
                    data-testid={`registration-card-${reg.id}`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Calendar className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{event?.name || "Event"}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        {event?.startDate && (
                          <span>{format(new Date(event.startDate), "MMM d, yyyy")}</span>
                        )}
                        {event?.location && <span>{event.location}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={reg.status} />
                      {reg.status === "checked_in" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
