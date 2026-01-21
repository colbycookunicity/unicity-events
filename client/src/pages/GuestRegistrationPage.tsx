import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle, Calendar, MapPin, User, ArrowLeft, CreditCard, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import unicityLogoDark from "@/assets/unicity-logo-dark.png";
import unicityLogoWhite from "@/assets/unicity-logo-white.png";
import { useTranslation, useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EventInfo {
  id: string;
  name: string;
  nameEs: string;
  startDate: string;
  endDate: string;
  location: string;
  guestPolicy: string;
  buyInPrice: number | null;
  defaultLanguage: string;
}

interface QualifierInfo {
  registrationId: string;
  firstName: string;
  lastName: string;
  unicityId: string;
}

const lookupSchema = z.object({
  unicityId: z.string().min(1, "Unicity ID is required"),
});

const guestFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  shirtSize: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
});

type LookupFormData = z.infer<typeof lookupSchema>;
type GuestFormData = z.infer<typeof guestFormSchema>;

type Step = "lookup" | "guest_form" | "payment" | "success";

export default function GuestRegistrationPage() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const { theme } = useTheme();
  const params = useParams<{ eventSlug: string }>();
  const [, setLocation] = useLocation();
  
  const [step, setStep] = useState<Step>("lookup");
  const [qualifier, setQualifier] = useState<QualifierInfo | null>(null);
  const [paymentCanceled, setPaymentCanceled] = useState(false);

  const unicityLogo = theme === 'dark' ? unicityLogoWhite : unicityLogoDark;

  // Check for canceled payment in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('canceled') === 'true') {
      setPaymentCanceled(true);
    }
  }, []);

  // Fetch event info
  const { data: event, isLoading: eventLoading, error: eventError } = useQuery<EventInfo>({
    queryKey: [`/api/public/events/${params.eventSlug}/guest-registration-info`],
    enabled: !!params.eventSlug,
  });

  // Set language based on event default
  useEffect(() => {
    if (event?.defaultLanguage && language !== event.defaultLanguage) {
      setLanguage(event.defaultLanguage as "en" | "es");
    }
  }, [event?.defaultLanguage]);

  // Lookup form
  const lookupForm = useForm<LookupFormData>({
    resolver: zodResolver(lookupSchema),
    defaultValues: { unicityId: "" },
  });

  // Guest form
  const guestForm = useForm<GuestFormData>({
    resolver: zodResolver(guestFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      shirtSize: "",
      dietaryRestrictions: "",
    },
  });

  // Lookup mutation
  const lookupMutation = useMutation({
    mutationFn: async (data: LookupFormData) => {
      const response = await apiRequest("POST", `/api/public/events/${params.eventSlug}/lookup-qualifier`, data);
      return response.json();
    },
    onSuccess: (data: QualifierInfo) => {
      setQualifier(data);
      setStep("guest_form");
    },
    onError: (error: Error) => {
      toast({
        title: t("error"),
        description: error.message || "No registered attendee found with this Unicity ID",
        variant: "destructive",
      });
    },
  });

  // Register guest mutation
  const registerMutation = useMutation({
    mutationFn: async (data: GuestFormData) => {
      const response = await apiRequest("POST", `/api/public/events/${params.eventSlug}/register-guest`, {
        ...data,
        registrationId: qualifier?.registrationId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.requiresPayment && data.checkoutUrl) {
        // Redirect to payment checkout
        window.location.href = data.checkoutUrl;
      } else {
        // No payment required, show success
        setStep("success");
      }
    },
    onError: (error: Error) => {
      toast({
        title: t("error"),
        description: error.message || "Failed to register guest",
        variant: "destructive",
      });
    },
  });

  const onLookupSubmit = (data: LookupFormData) => {
    lookupMutation.mutate(data);
  };

  const onGuestSubmit = (data: GuestFormData) => {
    registerMutation.mutate(data);
  };

  const handleBack = () => {
    if (step === "guest_form") {
      setStep("lookup");
      setQualifier(null);
    }
  };

  // Loading state
  if (eventLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (eventError || !event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">{t("error")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {eventError instanceof Error ? eventError.message : "Event not found or does not allow guests"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const eventName = language === "es" && event.nameEs ? event.nameEs : event.name;
  const formatEventDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={unicityLogo} alt="Unicity" className="h-6" data-testid="img-header-logo" />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Event Info */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl" data-testid="text-event-name">{eventName}</CardTitle>
            <CardDescription className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {formatEventDate(event.startDate)} - {formatEventDate(event.endDate)}
              </span>
              {event.location && (
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {event.location}
                </span>
              )}
              {event.buyInPrice && event.buyInPrice > 0 && (
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {t("guestBuyInPrice")}: ${event.buyInPrice}
                </span>
              )}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Payment Canceled Alert */}
        {paymentCanceled && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t("paymentCanceled") || "Payment was canceled. Please try again."}
            </AlertDescription>
          </Alert>
        )}

        {/* Step: Lookup Qualifier */}
        {step === "lookup" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("guestRegistration") || "Guest Registration"}</CardTitle>
              <CardDescription>
                {t("enterQualifierUnicityId") || "Enter the Unicity ID of the registered attendee who is bringing you as a guest."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...lookupForm}>
                <form onSubmit={lookupForm.handleSubmit(onLookupSubmit)} className="space-y-4">
                  <FormField
                    control={lookupForm.control}
                    name="unicityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("unicityId") || "Unicity ID"}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t("enterUnicityId") || "Enter Unicity ID"}
                            data-testid="input-unicity-id"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={lookupMutation.isPending}
                    data-testid="button-lookup-qualifier"
                  >
                    {lookupMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("searching") || "Searching..."}
                      </>
                    ) : (
                      t("continue") || "Continue"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Step: Guest Form */}
        {step === "guest_form" && qualifier && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle>{t("guestDetails") || "Guest Details"}</CardTitle>
              </div>
              <CardDescription className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t("guestOf") || "Guest of"}: {qualifier.firstName} {qualifier.lastName} ({qualifier.unicityId})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...guestForm}>
                <form onSubmit={guestForm.handleSubmit(onGuestSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={guestForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("firstName")}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-guest-first-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={guestForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("lastName")}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-guest-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={guestForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("email")}</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" data-testid="input-guest-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={guestForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("phone")} ({t("optional")})</FormLabel>
                        <FormControl>
                          <Input {...field} type="tel" data-testid="input-guest-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {event.buyInPrice && event.buyInPrice > 0 && (
                    <div className="bg-muted/50 rounded-md p-4 text-sm">
                      <p className="font-medium mb-1">{t("paymentRequired") || "Payment Required"}</p>
                      <p className="text-muted-foreground">
                        {t("guestBuyInMessage") || "A guest buy-in payment of"} ${event.buyInPrice} {t("willBeRequired") || "will be required to complete registration."}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={registerMutation.isPending}
                    data-testid="button-register-guest"
                  >
                    {registerMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("processing") || "Processing..."}
                      </>
                    ) : event.buyInPrice && event.buyInPrice > 0 ? (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        {t("proceedToPayment") || "Proceed to Payment"}
                      </>
                    ) : (
                      t("completeRegistration") || "Complete Registration"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">{t("registrationComplete") || "Registration Complete!"}</h2>
              <p className="text-muted-foreground mb-6">
                {t("guestRegistrationSuccess") || "You have been successfully registered as a guest for this event."}
              </p>
              <Button
                variant="outline"
                onClick={() => setLocation("/")}
                data-testid="button-go-home"
              >
                {t("goHome") || "Go to Home"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
