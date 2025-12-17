import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle, Calendar, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Event } from "@shared/schema";

const shirtSizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

const registrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  unicityId: z.string().optional(),
  shirtSize: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms and conditions" }),
  }),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function RegistrationPage() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const params = useParams<{ eventId: string }>();
  const [isSuccess, setIsSuccess] = useState(false);

  const { data: event, isLoading } = useQuery<Event>({
    queryKey: ["/api/events", params.eventId, "public"],
  });

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      unicityId: "",
      shirtSize: "",
      dietaryRestrictions: "",
      termsAccepted: false as unknown as true,
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      return apiRequest("POST", `/api/events/${params.eventId}/register`, {
        ...data,
        language,
      });
    },
    onSuccess: () => {
      setIsSuccess(true);
      toast({ title: t("success"), description: t("registrationSuccess") });
    },
    onError: (error: any) => {
      toast({
        title: t("error"),
        description: error.message || "Registration failed. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RegistrationFormData) => {
    registerMutation.mutate(data);
  };

  const getEventName = () => {
    if (language === "es" && event?.nameEs) {
      return event.nameEs;
    }
    return event?.name;
  };

  const getEventDescription = () => {
    if (language === "es" && event?.descriptionEs) {
      return event.descriptionEs;
    }
    return event?.description;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center justify-end gap-2 p-4">
          <LanguageToggle />
          <ThemeToggle />
        </header>
        <div className="max-w-2xl mx-auto p-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Event Not Found</h2>
            <p className="text-muted-foreground">This event does not exist or registration is not available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center justify-end gap-2 p-4">
          <LanguageToggle />
          <ThemeToggle />
        </header>
        <div className="flex items-center justify-center min-h-[80vh] p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">{t("registrationSuccess")}</h2>
              <p className="text-muted-foreground mb-4">
                {language === "es"
                  ? "Su registro ha sido completado. Recibira un correo de confirmacion pronto."
                  : "Your registration has been completed. You will receive a confirmation email shortly."}
              </p>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium">{getEventName()}</p>
                {event.startDate && (
                  <p>{format(new Date(event.startDate), "MMMM d, yyyy")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-end gap-2 p-4">
        <LanguageToggle />
        <ThemeToggle />
      </header>

      <div className="max-w-2xl mx-auto p-4 pb-12">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-2xl mb-4">
            U
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">{getEventName()}</h1>
          <div className="flex items-center justify-center gap-4 text-muted-foreground flex-wrap">
            {event.startDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {format(new Date(event.startDate), "MMM d, yyyy")}
                {event.endDate && event.endDate !== event.startDate && (
                  <> - {format(new Date(event.endDate), "MMM d, yyyy")}</>
                )}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        {getEventDescription() && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <p className="text-muted-foreground">{getEventDescription()}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("register")}</CardTitle>
            <CardDescription>
              {language === "es"
                ? "Complete el formulario a continuacion para registrarse en el evento"
                : "Fill out the form below to register for the event"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("firstName")} *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-first-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("lastName")} *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-last-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email")} *</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-reg-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("phone")}</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unicityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unicity ID</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional" data-testid="input-unicity-id" />
                      </FormControl>
                      <FormDescription>
                        {language === "es"
                          ? "Ingrese su ID de distribuidor de Unicity si tiene uno"
                          : "Enter your Unicity distributor ID if you have one"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shirtSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("shirtSize")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shirt-size">
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {shirtSizes.map((size) => (
                            <SelectItem key={size} value={size}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dietaryRestrictions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("dietaryRestrictions")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder={language === "es" ? "Ej: Vegetariano, sin gluten, alergias" : "E.g., Vegetarian, gluten-free, allergies"}
                          data-testid="input-dietary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="termsAccepted"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-terms"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>{t("acceptTerms")} *</FormLabel>
                        <FormDescription>
                          {language === "es"
                            ? "Al registrarse, acepta los terminos y condiciones del evento"
                            : "By registering, you agree to the event terms and conditions"}
                        </FormDescription>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={registerMutation.isPending}
                  data-testid="button-submit-registration"
                >
                  {registerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("submitRegistration")
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <footer className="p-4 text-center text-sm text-muted-foreground">
        Unicity International
      </footer>
    </div>
  );
}
