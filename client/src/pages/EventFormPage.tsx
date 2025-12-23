import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Copy, ExternalLink, Check, FileEdit, Clock, Plus, Trash2, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Event, GuestAllowanceRule, User, EventManagerAssignment } from "@shared/schema";

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
  guestPolicy: z.enum(["not_allowed", "allowed_free", "allowed_paid", "allowed_mixed"]).default("not_allowed"),
  buyInPrice: z.coerce.number().min(0).optional(),
  requiresQualification: z.boolean().default(false),
  qualificationStartDate: z.string().optional(),
  qualificationEndDate: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens allowed").min(3).max(50).optional().or(z.literal("")),
  formTemplateId: z.string().optional(),
});

// Form template type
interface FormTemplate {
  id: string;
  key: string;
  name: string;
  nameEs?: string;
  description?: string;
  fields: unknown[];
}

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
      guestPolicy: "not_allowed",
      buyInPrice: undefined,
      requiresQualification: false,
      qualificationStartDate: "",
      qualificationEndDate: "",
      slug: "",
      formTemplateId: "",
    },
  });

  // Query form templates
  const { data: formTemplates = [] } = useQuery<FormTemplate[]>({
    queryKey: ["/api/form-templates"],
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
        guestPolicy: (event.guestPolicy as EventFormData["guestPolicy"]) || "not_allowed",
        buyInPrice: event.buyInPrice || undefined,
        requiresQualification: event.requiresQualification || false,
        qualificationStartDate: formatDateForInput(event.qualificationStartDate),
        qualificationEndDate: formatDateForInput(event.qualificationEndDate),
        slug: event.slug || "",
        formTemplateId: (event as any).formTemplateId || "",
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

  // Guest Allowance Rules state and queries
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<GuestAllowanceRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    nameEs: "",
    description: "",
    descriptionEs: "",
    freeGuestCount: 0,
    maxPaidGuests: 0,
    paidGuestPriceCents: "",
    isDefault: false,
  });

  const { data: guestRules = [], refetch: refetchRules } = useQuery<GuestAllowanceRule[]>({
    queryKey: [`/api/events/${params.id}/guest-rules`],
    enabled: !!isEditing && form.watch("guestPolicy") === "allowed_mixed",
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: typeof ruleForm) => {
      return apiRequest("POST", `/api/events/${params.id}/guest-rules`, {
        ...data,
        paidGuestPriceCents: data.paidGuestPriceCents ? parseInt(data.paidGuestPriceCents) : null,
      });
    },
    onSuccess: () => {
      refetchRules();
      setShowRuleDialog(false);
      resetRuleForm();
      toast({ title: "Success", description: "Guest allowance rule created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create rule", variant: "destructive" });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof ruleForm }) => {
      return apiRequest("PATCH", `/api/guest-rules/${id}`, {
        ...data,
        paidGuestPriceCents: data.paidGuestPriceCents ? parseInt(data.paidGuestPriceCents) : null,
      });
    },
    onSuccess: () => {
      refetchRules();
      setShowRuleDialog(false);
      setEditingRule(null);
      resetRuleForm();
      toast({ title: "Success", description: "Guest allowance rule updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update rule", variant: "destructive" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/guest-rules/${id}`);
    },
    onSuccess: () => {
      refetchRules();
      toast({ title: "Success", description: "Guest allowance rule deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete rule", variant: "destructive" });
    },
  });

  const resetRuleForm = () => {
    setRuleForm({
      name: "",
      nameEs: "",
      description: "",
      descriptionEs: "",
      freeGuestCount: 0,
      maxPaidGuests: 0,
      paidGuestPriceCents: "",
      isDefault: false,
    });
  };

  const handleEditRule = (rule: GuestAllowanceRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      nameEs: rule.nameEs || "",
      description: rule.description || "",
      descriptionEs: rule.descriptionEs || "",
      freeGuestCount: rule.freeGuestCount ?? 0,
      maxPaidGuests: rule.maxPaidGuests ?? 0,
      paidGuestPriceCents: rule.paidGuestPriceCents?.toString() || "",
      isDefault: rule.isDefault ?? false,
    });
    setShowRuleDialog(true);
  };

  const handleSaveRule = () => {
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: ruleForm });
    } else {
      createRuleMutation.mutate(ruleForm);
    }
  };

  const formatCurrency = (cents: number | null) => {
    if (cents === null) return "N/A";
    return `$${(cents / 100).toFixed(2)}`;
  };

  // Event Manager Assignments (admin only)
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  
  const { data: eventManagers = [], refetch: refetchManagers } = useQuery<(EventManagerAssignment & { user: User })[]>({
    queryKey: [`/api/events/${params.id}/managers`],
    enabled: !!isEditing && isAdmin,
  });

  // Get all users with event_manager role for assignment dropdown
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!isEditing && isAdmin,
  });

  const eventManagerUsers = allUsers.filter(u => u.role === "event_manager");
  const assignedUserIds = eventManagers.map(em => em.userId);
  const availableManagers = eventManagerUsers.filter(u => !assignedUserIds.includes(u.id));

  const [selectedManagerId, setSelectedManagerId] = useState<string>("");

  const assignManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/events/${params.id}/managers`, { userId });
    },
    onSuccess: () => {
      refetchManagers();
      setSelectedManagerId("");
      toast({ title: "Success", description: "Event manager assigned" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign event manager", variant: "destructive" });
    },
  });

  const removeManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/events/${params.id}/managers/${userId}`);
    },
    onSuccess: () => {
      refetchManagers();
      toast({ title: "Success", description: "Event manager removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove event manager", variant: "destructive" });
    },
  });

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
              <CardTitle className="flex items-center gap-2">
                Date & Time
                <Badge variant="outline" className="text-xs font-normal">
                  <Clock className="mr-1 h-3 w-3" />
                  Eastern Time (ET)
                </Badge>
              </CardTitle>
              <CardDescription>All times are in Eastern Time (EST/EDT). Times will be displayed to attendees in ET.</CardDescription>
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
                              <span className="text-xs text-muted-foreground">Time (ET)</span>
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
                              <span className="text-xs text-muted-foreground">Time (ET)</span>
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
              <CardTitle>Registration Form</CardTitle>
              <CardDescription>Choose which form template attendees will fill out</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="formTemplateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Form Template</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === "none" ? "" : value)} 
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-form-template" className="max-w-md">
                          <SelectValue placeholder="Select a form template" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No template (custom form)</SelectItem>
                        {formTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value && field.value !== "none" ? (
                        (() => {
                          const selected = formTemplates.find(t => t.id === field.value);
                          return selected?.description || "Selected template will be used for registration";
                        })()
                      ) : (
                        "Select a predefined template or use custom form fields"
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                  name="guestPolicy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guest Policy</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-guest-policy">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="not_allowed">Not Allowed</SelectItem>
                          <SelectItem value="allowed_free">Allowed (Free)</SelectItem>
                          <SelectItem value="allowed_paid">Allowed (Paid)</SelectItem>
                          <SelectItem value="allowed_mixed">Mixed Policy</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {field.value === "not_allowed" && "Registrants cannot bring guests"}
                        {field.value === "allowed_free" && "Guests can attend at no additional cost"}
                        {field.value === "allowed_paid" && "Guests must pay a buy-in fee"}
                        {field.value === "allowed_mixed" && "Different rules apply per distributor (configure below)"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {form.watch("guestPolicy") === "allowed_paid" && (
                <FormField
                  control={form.control}
                  name="buyInPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guest Buy-In Price (cents)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          placeholder="e.g., 50000 for $500.00" 
                          data-testid="input-buyin-price" 
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the price in cents (e.g., 50000 = $500.00)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {form.watch("guestPolicy") === "allowed_mixed" && isEditing && (
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">Guest Allowance Rules</CardTitle>
                      </div>
                      <Dialog open={showRuleDialog} onOpenChange={(open) => {
                        setShowRuleDialog(open);
                        if (!open) {
                          setEditingRule(null);
                          resetRuleForm();
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" data-testid="button-add-guest-rule">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Rule
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{editingRule ? "Edit" : "Create"} Guest Allowance Rule</DialogTitle>
                            <DialogDescription>
                              Define how many free and paid guests a distributor can bring.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Rule Name</label>
                              <Input
                                value={ruleForm.name}
                                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                                placeholder="e.g., Diamond Plus, Gold Member"
                                data-testid="input-rule-name"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Rule Name (Spanish)</label>
                              <Input
                                value={ruleForm.nameEs}
                                onChange={(e) => setRuleForm({ ...ruleForm, nameEs: e.target.value })}
                                placeholder="e.g., Diamante Plus, Miembro Oro"
                                data-testid="input-rule-name-es"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Description</label>
                              <Input
                                value={ruleForm.description}
                                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                                placeholder="e.g., Top performers get 2 free guests"
                                data-testid="input-rule-description"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Free Guests</label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={ruleForm.freeGuestCount}
                                  onChange={(e) => setRuleForm({ ...ruleForm, freeGuestCount: parseInt(e.target.value) || 0 })}
                                  data-testid="input-rule-free-guests"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Max Paid Guests</label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={ruleForm.maxPaidGuests}
                                  onChange={(e) => setRuleForm({ ...ruleForm, maxPaidGuests: parseInt(e.target.value) || 0 })}
                                  data-testid="input-rule-max-paid"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Paid Guest Price (cents)</label>
                              <Input
                                type="number"
                                min={0}
                                value={ruleForm.paidGuestPriceCents}
                                onChange={(e) => setRuleForm({ ...ruleForm, paidGuestPriceCents: e.target.value })}
                                placeholder="e.g., 50000 for $500.00"
                                data-testid="input-rule-price"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={ruleForm.isDefault}
                                onCheckedChange={(checked) => setRuleForm({ ...ruleForm, isDefault: checked })}
                                data-testid="switch-rule-default"
                              />
                              <label className="text-sm">Set as default rule for new qualifiers</label>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setShowRuleDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSaveRule}
                              disabled={!ruleForm.name || createRuleMutation.isPending || updateRuleMutation.isPending}
                              data-testid="button-save-rule"
                            >
                              {(createRuleMutation.isPending || updateRuleMutation.isPending) && (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              )}
                              {editingRule ? "Update" : "Create"} Rule
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <CardDescription>
                      Create rules to define different guest allowances for different distributor tiers.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {guestRules.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No guest allowance rules defined yet.</p>
                        <p className="text-sm">Create rules to assign different guest policies to distributors.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {guestRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between gap-4 p-3 rounded-md border bg-muted/30"
                            data-testid={`rule-item-${rule.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{rule.name}</span>
                                {rule.isDefault && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Star className="h-3 w-3 mr-1" />
                                    Default
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {rule.freeGuestCount ?? 0} free guest{(rule.freeGuestCount ?? 0) !== 1 ? "s" : ""}
                                {(rule.maxPaidGuests ?? 0) > 0 && (
                                  <span>
                                    {" + "}up to {rule.maxPaidGuests} paid at {formatCurrency(rule.paidGuestPriceCents)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditRule(rule)}
                                data-testid={`button-edit-rule-${rule.id}`}
                              >
                                <FileEdit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteRuleMutation.mutate(rule.id)}
                                disabled={deleteRuleMutation.isPending}
                                data-testid={`button-delete-rule-${rule.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {form.watch("guestPolicy") === "allowed_mixed" && !isEditing && (
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground text-center">
                    Save the event first to configure guest allowance rules.
                  </p>
                </div>
              )}

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

          {/* Event Manager Assignments - Admin Only */}
          {isEditing && isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Event Managers
                </CardTitle>
                <CardDescription>
                  Assign event managers who can view and edit this event. Event managers can only see events they created or were assigned to.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Creator info */}
                {event?.createdBy && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">Owner</Badge>
                    <span>Created by user</span>
                  </div>
                )}
                
                {/* Assigned managers list */}
                {eventManagers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Assigned Managers</p>
                    <div className="space-y-2">
                      {eventManagers.map((assignment) => (
                        <div 
                          key={assignment.id} 
                          className="flex items-center justify-between p-3 rounded-md border bg-muted/30"
                          data-testid={`manager-assignment-${assignment.userId}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {assignment.user.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">{assignment.user.name}</p>
                              <p className="text-xs text-muted-foreground">{assignment.user.email}</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeManagerMutation.mutate(assignment.userId)}
                            disabled={removeManagerMutation.isPending}
                            data-testid={`button-remove-manager-${assignment.userId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add manager form */}
                {availableManagers.length > 0 ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <FormLabel>Add Event Manager</FormLabel>
                      <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                        <SelectTrigger data-testid="select-add-manager">
                          <SelectValue placeholder="Select an event manager..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableManagers.map((manager) => (
                            <SelectItem key={manager.id} value={manager.id}>
                              {manager.name} ({manager.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      onClick={() => selectedManagerId && assignManagerMutation.mutate(selectedManagerId)}
                      disabled={!selectedManagerId || assignManagerMutation.isPending}
                      data-testid="button-assign-manager"
                    >
                      {assignManagerMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add
                    </Button>
                  </div>
                ) : eventManagerUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No event managers available. Create users with the "Event Manager" role to assign them to events.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    All event managers are already assigned to this event.
                  </p>
                )}
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

