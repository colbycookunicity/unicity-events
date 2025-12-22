import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Copy, ExternalLink, Check, FileEdit } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

// Format date to local datetime string for datetime-local input (avoids UTC conversion issues)
function formatDateForInput(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return "";
  
  // Format as local time YYYY-MM-DDTHH:mm
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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
  slug: z.string().regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens allowed").min(3).max(50).optional().or(z.literal("")),
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
      slug: "",
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
        startDate: formatDateForInput(event.startDate),
        endDate: formatDateForInput(event.endDate),
        status: event.status as EventFormData["status"],
        capacity: event.capacity || undefined,
        buyInPrice: event.buyInPrice || undefined,
        requiresQualification: event.requiresQualification || false,
        qualificationStartDate: formatDateForInput(event.qualificationStartDate),
        qualificationEndDate: formatDateForInput(event.qualificationEndDate),
        slug: event.slug || "",
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
    // Normalize slug: convert empty string to undefined so backend stores null
    const normalizedData = {
      ...data,
      slug: data.slug?.trim() || undefined,
    };
    
    if (isEditing) {
      updateMutation.mutate(normalizedData);
    } else {
      createMutation.mutate(normalizedData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEditing && isLoading) {
    return (
      <div className="space-y-6 px-4">
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
    <div className="space-y-6 px-4">
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

      {isEditing && event && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Registration Link</CardTitle>
              <CardDescription>Share this link with qualified distributors to register</CardDescription>
            </CardHeader>
            <CardContent>
              <RegistrationLinkCopy eventId={event.id} slug={event.slug || undefined} />
            </CardContent>
          </Card>
          
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Registration Flow</CardTitle>
              <CardDescription>Customize what users see during registration</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" asChild data-testid="button-edit-registration-flow">
                <Link href={`/admin/events/${event.id}/pages/registration`}>
                  <FileEdit className="h-4 w-4 mr-2" />
                  Edit Registration Flow
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

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
                        <RichTextEditor 
                          value={field.value || ""} 
                          onChange={field.onChange}
                          placeholder="Event description..."
                          data-testid="input-event-description"
                        />
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
                        <RichTextEditor 
                          value={field.value || ""} 
                          onChange={field.onChange}
                          placeholder="Descripcion del evento..."
                          data-testid="input-event-description-es"
                        />
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
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => {
                      const dateValue = field.value ? field.value.split('T')[0] : '';
                      const timeValue = field.value ? field.value.split('T')[1] || '09:00' : '09:00';
                      return (
                        <FormItem>
                          <FormLabel className="text-base font-semibold">{t("startDate")}</FormLabel>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <span className="text-xs text-muted-foreground">Date</span>
                              <FormControl>
                                <Input 
                                  type="date" 
                                  value={dateValue}
                                  onChange={(e) => field.onChange(`${e.target.value}T${timeValue}`)}
                                  className="text-left"
                                  data-testid="input-start-date" 
                                />
                              </FormControl>
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-xs text-muted-foreground">Time</span>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  value={timeValue}
                                  onChange={(e) => field.onChange(`${dateValue}T${e.target.value}`)}
                                  className="text-left"
                                  data-testid="input-start-time" 
                                />
                              </FormControl>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => {
                      const dateValue = field.value ? field.value.split('T')[0] : '';
                      const timeValue = field.value ? field.value.split('T')[1] || '17:00' : '17:00';
                      return (
                        <FormItem>
                          <FormLabel className="text-base font-semibold">{t("endDate")}</FormLabel>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <span className="text-xs text-muted-foreground">Date</span>
                              <FormControl>
                                <Input 
                                  type="date" 
                                  value={dateValue}
                                  onChange={(e) => field.onChange(`${e.target.value}T${timeValue}`)}
                                  className="text-left"
                                  data-testid="input-end-date" 
                                />
                              </FormControl>
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-xs text-muted-foreground">Time</span>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  value={timeValue}
                                  onChange={(e) => field.onChange(`${dateValue}T${e.target.value}`)}
                                  className="text-left"
                                  data-testid="input-end-time" 
                                />
                              </FormControl>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
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
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="qualificationStartDate"
                      render={({ field }) => {
                        const dateValue = field.value ? field.value.split('T')[0] : '';
                        const timeValue = field.value ? field.value.split('T')[1] || '00:00' : '00:00';
                        return (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Qualification Start</FormLabel>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <span className="text-xs text-muted-foreground">Date</span>
                                <FormControl>
                                  <Input 
                                    type="date" 
                                    value={dateValue}
                                    onChange={(e) => field.onChange(`${e.target.value}T${timeValue}`)}
                                    className="text-left"
                                    data-testid="input-qual-start-date" 
                                  />
                                </FormControl>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-xs text-muted-foreground">Time</span>
                                <FormControl>
                                  <Input 
                                    type="time" 
                                    value={timeValue}
                                    onChange={(e) => field.onChange(`${dateValue}T${e.target.value}`)}
                                    className="text-left"
                                    data-testid="input-qual-start-time" 
                                  />
                                </FormControl>
                              </div>
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="qualificationEndDate"
                      render={({ field }) => {
                        const dateValue = field.value ? field.value.split('T')[0] : '';
                        const timeValue = field.value ? field.value.split('T')[1] || '23:59' : '23:59';
                        return (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Qualification End</FormLabel>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <span className="text-xs text-muted-foreground">Date</span>
                                <FormControl>
                                  <Input 
                                    type="date" 
                                    value={dateValue}
                                    onChange={(e) => field.onChange(`${e.target.value}T${timeValue}`)}
                                    className="text-left"
                                    data-testid="input-qual-end-date" 
                                  />
                                </FormControl>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-xs text-muted-foreground">Time</span>
                                <FormControl>
                                  <Input 
                                    type="time" 
                                    value={timeValue}
                                    onChange={(e) => field.onChange(`${dateValue}T${e.target.value}`)}
                                    className="text-left"
                                    data-testid="input-qual-end-time" 
                                  />
                                </FormControl>
                              </div>
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle>Registration URL</CardTitle>
                <CardDescription>Custom URL slug for registration page</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom URL Slug</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Input 
                            {...field} 
                            placeholder="rise-2026" 
                            className="max-w-xs"
                            data-testid="input-event-slug" 
                          />
                          <p className="text-xs text-muted-foreground break-all">
                            {window.location.origin}/register/{field.value || "[slug]"}
                          </p>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Leave empty to use the event ID. Use lowercase letters, numbers, and hyphens only.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

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

function RegistrationLinkCopy({ eventId, slug }: { eventId: string; slug?: string }) {
  const [copied, setCopied] = useState(false);
  const registrationUrl = `${window.location.origin}/register/${slug || eventId}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={registrationUrl}
        className="font-mono text-sm bg-background"
        data-testid="input-registration-url"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={copyToClipboard}
        data-testid="button-copy-link"
      >
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        asChild
        data-testid="button-open-link"
      >
        <a href={registrationUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

