import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

const eventFormSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  nameEs: z.string().optional(),
  description: z.string().optional(),
  descriptionEs: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  status: z.enum(["draft", "published", "private", "archived"]),
  capacity: z.coerce.number().min(0).optional(),
  buyInPrice: z.coerce.number().min(0).optional(),
  requiresQualification: z.boolean().default(false),
  qualificationStartDate: z.string().optional(),
  qualificationEndDate: z.string().optional(),
});

type EventFormData = z.infer<typeof eventFormSchema>;

export default function EventFormPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const isEditing = params.id && params.id !== "new";

  const { data: event, isLoading } = useQuery<Event>({
    queryKey: ["/api/events", params.id],
    enabled: !!isEditing,
  });

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: "",
      nameEs: "",
      description: "",
      descriptionEs: "",
      location: "",
      startDate: "",
      endDate: "",
      status: "draft",
      capacity: undefined,
      buyInPrice: undefined,
      requiresQualification: false,
      qualificationStartDate: "",
      qualificationEndDate: "",
    },
  });

  useEffect(() => {
    if (event) {
      form.reset({
        name: event.name,
        nameEs: event.nameEs || "",
        description: event.description || "",
        descriptionEs: event.descriptionEs || "",
        location: event.location || "",
        startDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 16) : "",
        endDate: event.endDate ? new Date(event.endDate).toISOString().slice(0, 16) : "",
        status: event.status as EventFormData["status"],
        capacity: event.capacity || undefined,
        buyInPrice: event.buyInPrice || undefined,
        requiresQualification: event.requiresQualification || false,
        qualificationStartDate: event.qualificationStartDate
          ? new Date(event.qualificationStartDate).toISOString().slice(0, 16)
          : "",
        qualificationEndDate: event.qualificationEndDate
          ? new Date(event.qualificationEndDate).toISOString().slice(0, 16)
          : "",
      });
    }
  }, [event, form]);

  const createMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      return apiRequest("POST", "/api/events", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: t("success"), description: "Event created successfully" });
      setLocation("/admin/events");
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to create event", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      return apiRequest("PATCH", `/api/events/${params.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: t("success"), description: "Event updated successfully" });
      setLocation("/admin/events");
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update event", variant: "destructive" });
    },
  });

  const onSubmit = (data: EventFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditing && isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/events")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEditing ? t("editEvent") : t("createEvent")}
          </h1>
          <p className="text-muted-foreground">
            {isEditing ? "Update event details" : "Create a new event"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Event name, description, and location</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("eventName")} (English)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Punta Cana Incentive Trip" data-testid="input-event-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nameEs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("eventName")} (Spanish)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Viaje de Incentivo a Punta Cana" data-testid="input-event-name-es" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("eventDescription")} (English)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} placeholder="Event description..." data-testid="input-event-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="descriptionEs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("eventDescription")} (Spanish)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} placeholder="Descripcion del evento..." data-testid="input-event-description-es" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("eventLocation")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Punta Cana, Dominican Republic" data-testid="input-event-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Date & Time</CardTitle>
              <CardDescription>When does the event take place</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("startDate")}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-start-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("endDate")}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-end-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Event status, capacity, and pricing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("status")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">{t("draft")}</SelectItem>
                          <SelectItem value="published">{t("published")}</SelectItem>
                          <SelectItem value="private">{t("private")}</SelectItem>
                          <SelectItem value="archived">{t("archived")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("capacity")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} placeholder="100" data-testid="input-capacity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyInPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("buyInPrice")} (cents)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} placeholder="50000" data-testid="input-buyin-price" />
                      </FormControl>
                      <FormDescription>Guest buy-in price in cents</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="requiresQualification"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Requires Qualification</FormLabel>
                      <FormDescription>
                        Attendees must qualify before they can register
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-requires-qualification" />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("requiresQualification") && (
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="qualificationStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualification Start</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} data-testid="input-qual-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="qualificationEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualification End</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} data-testid="input-qual-end" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/admin/events")} data-testid="button-cancel">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-event">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
