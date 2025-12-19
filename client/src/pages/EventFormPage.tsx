import { useEffect, useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Copy, ExternalLink, Check, Upload, Image } from "lucide-react";
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
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import type { Event, RegistrationSettings } from "@shared/schema";

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
  registrationSettings: z.object({
    heroImagePath: z.string().optional(),
    heading: z.string().optional(),
    headingEs: z.string().optional(),
    subheading: z.string().optional(),
    subheadingEs: z.string().optional(),
    ctaLabel: z.string().optional(),
    ctaLabelEs: z.string().optional(),
    layout: z.enum(["standard", "split", "hero-background"]).optional(),
    accentColor: z.string().optional(),
  }).optional(),
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
      registrationSettings: {
        heroImagePath: "",
        heading: "",
        headingEs: "",
        subheading: "",
        subheadingEs: "",
        ctaLabel: "",
        ctaLabelEs: "",
        layout: "standard",
        accentColor: "",
      },
    },
  });

  useEffect(() => {
    if (event) {
      const settings = event.registrationSettings as RegistrationSettings | undefined;
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
        slug: event.slug || "",
        registrationSettings: {
          heroImagePath: settings?.heroImagePath || "",
          heading: settings?.heading || "",
          headingEs: settings?.headingEs || "",
          subheading: settings?.subheading || "",
          subheadingEs: settings?.subheadingEs || "",
          ctaLabel: settings?.ctaLabel || "",
          ctaLabelEs: settings?.ctaLabelEs || "",
          layout: settings?.layout || "standard",
          accentColor: settings?.accentColor || "",
        },
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
      registrationSettings: data.registrationSettings && Object.values(data.registrationSettings).some(v => v) 
        ? data.registrationSettings 
        : undefined,
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

      {isEditing && event && (
        <Card className="bg-muted/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Registration Link</CardTitle>
            <CardDescription>Share this link with qualified distributors to register</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationLinkCopy eventId={event.id} slug={event.slug || undefined} />
          </CardContent>
        </Card>
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

          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle>Registration Page Customization</CardTitle>
                <CardDescription>Customize how the public registration page looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom URL Slug</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{window.location.origin}/register/</span>
                          <Input 
                            {...field} 
                            placeholder="rise-2026" 
                            className="max-w-xs"
                            data-testid="input-event-slug" 
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Leave empty to use the event ID. Use lowercase letters, numbers, and hyphens only.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Layout</h4>
                  <FormField
                    control={form.control}
                    name="registrationSettings.layout"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page Layout</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "standard"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-layout">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="standard">Standard - Form centered on page</SelectItem>
                            <SelectItem value="split">Split - Image on left, form on right</SelectItem>
                            <SelectItem value="hero-background">Hero Background - Full-width hero image</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Hero Image</h4>
                  <HeroImageUpload 
                    eventId={params.id!}
                    currentPath={form.watch("registrationSettings.heroImagePath")}
                    onUpload={(path) => form.setValue("registrationSettings.heroImagePath", path)}
                    layout={form.watch("registrationSettings.layout") || "standard"}
                  />
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Custom Headings (Optional)</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="registrationSettings.heading"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Heading (English)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Join Us in Paradise" data-testid="input-heading" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="registrationSettings.headingEs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Heading (Spanish)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Unete a Nosotros en el Paraiso" data-testid="input-heading-es" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="registrationSettings.subheading"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subheading (English)</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={2} placeholder="Register now for an unforgettable experience" data-testid="input-subheading" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="registrationSettings.subheadingEs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subheading (Spanish)</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={2} placeholder="Registrese ahora para una experiencia inolvidable" data-testid="input-subheading-es" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Call-to-Action Button (Optional)</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="registrationSettings.ctaLabel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Button Text (English)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Register Now" data-testid="input-cta" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="registrationSettings.ctaLabelEs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Button Text (Spanish)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Registrarse Ahora" data-testid="input-cta-es" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
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

function getImageRecommendation(layout: string) {
  switch (layout) {
    case "split":
      return "Recommended: 1200x1800px or taller (portrait orientation). JPG, PNG, or WebP. Max 5MB.";
    case "hero-background":
      return "Recommended: 1920x800px or larger (wide landscape). JPG, PNG, or WebP. Max 5MB.";
    default:
      return "Recommended: 1920x600px or larger (landscape). JPG, PNG, or WebP. Max 5MB.";
  }
}

function HeroImageUpload({ 
  eventId, 
  currentPath, 
  onUpload,
  layout = "standard"
}: { 
  eventId: string; 
  currentPath?: string; 
  onUpload: (path: string) => void;
  layout?: string;
}) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentPath) {
      fetchSignedUrl(currentPath);
    }
  }, [currentPath]);

  const fetchSignedUrl = async (path: string) => {
    try {
      const authHeaders = getAuthHeaders();
      const res = await fetch(`/api/objects/public/${path}?redirect=false`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewUrl(data.url);
      }
    } catch (err) {
      console.error("Failed to fetch preview:", err);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const authHeaders = getAuthHeaders();
      const objectPath = `events/${eventId}/hero-${Date.now()}.${file.name.split('.').pop()}`;
      
      const presignRes = await fetch('/api/objects/presign', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          objectPath,
          contentType: file.type,
          permission: 'public-read',
        }),
      });

      if (!presignRes.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl } = await presignRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload image');
      }

      onUpload(objectPath);
      setPreviewUrl(URL.createObjectURL(file));
      toast({ title: "Success", description: "Hero image uploaded successfully" });
    } catch (err) {
      console.error("Upload failed:", err);
      toast({ title: "Error", description: "Failed to upload image", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-hero-image"
      />
      
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Hero preview"
            className="w-full max-h-48 object-cover rounded-md"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="absolute bottom-2 right-2"
            data-testid="button-change-hero"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change Image"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full h-32 border-dashed"
          data-testid="button-upload-hero"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {isUploading ? "Uploading..." : "Upload Hero Image"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {getImageRecommendation(layout)}
      </p>
    </div>
  );
}
