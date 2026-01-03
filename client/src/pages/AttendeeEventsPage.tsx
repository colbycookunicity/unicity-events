import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { MapPin, Calendar, ChevronRight, LogOut, Mail, Loader2, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import unicityIcon from "@/assets/unicity-logo.png";
import unicityLogoDark from "@/assets/unicity-logo-dark.png";
import unicityLogoWhite from "@/assets/unicity-logo-white.png";

interface AttendeeEvent {
  id: string;
  slug: string;
  name: string;
  nameEs: string | null;
  location: string | null;
  startDate: string;
  endDate: string | null;
  heroImageUrl: string | null;
  registrationStatus: "registered" | "not_registered";
  registrationId: string | null;
  lastUpdated: string | null;
  qualifiedSince: string | null;
}

type Step = "email" | "otp" | "events";

const ATTENDEE_TOKEN_KEY = "attendeeAuthToken";
const ATTENDEE_EMAIL_KEY = "attendeeEmail";

export default function AttendeeEventsPage() {
  const { language, setLanguage } = useLanguage();
  const t = (en: string, es: string) => (language === "es" ? es : en);
  const { theme } = useTheme();
  const { toast } = useToast();
  
  const unicityLogo = theme === 'dark' ? unicityLogoWhite : unicityLogoDark;
  const [, setLocation] = useLocation();
  
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [attendeeToken, setAttendeeToken] = useState<string | null>(null);
  const [attendeeEmail, setAttendeeEmail] = useState<string | null>(null);


  useEffect(() => {
    const savedToken = localStorage.getItem(ATTENDEE_TOKEN_KEY);
    const savedEmail = localStorage.getItem(ATTENDEE_EMAIL_KEY);
    if (savedToken) {
      setAttendeeToken(savedToken);
      setAttendeeEmail(savedEmail);
      setStep("events");
    }
  }, []);

  const generateOtpMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/attendee/otp/generate", { email });
      return response.json();
    },
    onSuccess: () => {
      setStep("otp");
      toast({
        title: t("Verification code sent", "Código de verificación enviado"),
        description: t("Please check your email", "Por favor revisa tu correo"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "Error"),
        description: error.message || t("Failed to send verification code", "Error al enviar código"),
        variant: "destructive",
      });
    },
  });

  const validateOtpMutation = useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const response = await apiRequest("POST", "/api/attendee/otp/validate", { email, code });
      return response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem(ATTENDEE_TOKEN_KEY, data.token);
      localStorage.setItem(ATTENDEE_EMAIL_KEY, data.email);
      setAttendeeToken(data.token);
      setAttendeeEmail(data.email);
      setStep("events");
      toast({
        title: t("Welcome!", "¡Bienvenido!"),
        description: t("You are now logged in", "Has iniciado sesión"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("Error", "Error"),
        description: error.message || t("Invalid verification code", "Código de verificación inválido"),
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (attendeeToken) {
        await fetch("/api/attendee/logout", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${attendeeToken}` 
          },
        });
      }
    },
    onSettled: () => {
      localStorage.removeItem(ATTENDEE_TOKEN_KEY);
      localStorage.removeItem(ATTENDEE_EMAIL_KEY);
      setAttendeeToken(null);
      setAttendeeEmail(null);
      setStep("email");
      setEmail("");
      setOtpCode("");
    },
  });

  const { data: eventsData, isLoading: eventsLoading, error: eventsError } = useQuery<{ email: string; events: AttendeeEvent[] }>({
    queryKey: ["/api/attendee/events"],
    enabled: !!attendeeToken,
    queryFn: async () => {
      const response = await fetch("/api/attendee/events", {
        headers: { Authorization: `Bearer ${attendeeToken}` },
      });
      if (!response.ok) {
        if (response.status === 401) {
          logoutMutation.mutate();
          throw new Error("Session expired");
        }
        throw new Error("Failed to fetch events");
      }
      return response.json();
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    generateOtpMutation.mutate(email.trim());
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    validateOtpMutation.mutate({ email: email.trim(), code: otpCode.trim() });
  };

  const getEventName = (event: AttendeeEvent) => {
    return language === "es" && event.nameEs ? event.nameEs : event.name;
  };

  const formatEventDates = (startDate: string, endDate: string | null) => {
    const start = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      if (start.toDateString() === end.toDateString()) {
        return format(start, "MMMM d, yyyy");
      }
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
    }
    return format(start, "MMMM d, yyyy");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
        <div className="container mx-auto flex items-center justify-between gap-6">
          {/* Left: Logo */}
          <div className="shrink-0">
            <img 
              src={unicityLogo} 
              alt="Unicity" 
              className="h-6 w-auto"
              data-testid="img-attendee-logo"
            />
          </div>
          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {step === "events" && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => logoutMutation.mutate()}
                className="text-muted-foreground"
                data-testid="button-attendee-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
            <ThemeToggle />
            <div className="flex items-center gap-1 text-sm font-medium">
              <button
                onClick={() => setLanguage("en")}
                className={language === "en" ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}
                data-testid="button-language-en"
              >
                EN
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={() => setLanguage("es")}
                className={language === "es" ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}
                data-testid="button-language-es"
              >
                ES
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        {step === "email" && (
          <div className="max-w-md mx-auto">
            <Card>
              <CardHeader className="text-center space-y-4">
                <img 
                  src={unicityIcon} 
                  alt="Unicity" 
                  className="mx-auto h-14 w-14 rounded-md object-cover"
                  data-testid="img-unicity-icon"
                />
                <div>
                  <CardTitle data-testid="text-attendee-title">
                    {t("Event Login", "Iniciar Sesión")}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {t(
                      "Enter your email to see events you're qualified for",
                      "Ingresa tu correo para ver los eventos para los que calificas"
                    )}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("Email", "Correo electrónico")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                        data-testid="input-attendee-email"
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={generateOtpMutation.isPending}
                    data-testid="button-attendee-continue"
                  >
                    {generateOtpMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("Continue", "Continuar")
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "otp" && (
          <div className="max-w-md mx-auto">
            <Card>
              <CardHeader className="text-center space-y-4">
                <img 
                  src={unicityIcon} 
                  alt="Unicity" 
                  className="mx-auto h-14 w-14 rounded-md object-cover"
                  data-testid="img-unicity-icon-otp"
                />
                <div>
                  <CardTitle>{t("Verify Your Email", "Verifica tu Correo")}</CardTitle>
                  <CardDescription className="mt-2">
                    {t("Enter the 6-digit code", "Ingresa el código de 6 dígitos")}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    <span>{t(`Code sent to ${email}`, `Código enviado a ${email}`)}</span>
                  </div>

                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={(value) => {
                        setOtpCode(value);
                        if (value.length === 6) {
                          validateOtpMutation.mutate({ email: email.trim(), code: value });
                        }
                      }}
                      disabled={validateOtpMutation.isPending}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      data-testid="input-attendee-otp"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {validateOtpMutation.isPending && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t("Verifying...", "Verificando...")}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <Button 
                      variant="ghost" 
                      onClick={() => generateOtpMutation.mutate(email.trim())}
                      disabled={validateOtpMutation.isPending || generateOtpMutation.isPending}
                      className="text-sm"
                      data-testid="button-attendee-resend"
                    >
                      {t("Resend code", "Reenviar código")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStep("email");
                        setOtpCode("");
                      }}
                      disabled={validateOtpMutation.isPending}
                      className="text-sm text-muted-foreground"
                      data-testid="button-attendee-back"
                    >
                      {t("Change email", "Cambiar correo")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "events" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-attendee-welcome">
                  {t("My Events", "Mis Eventos")}
                </h1>
                <p className="text-muted-foreground">
                  {attendeeEmail || eventsData?.email}
                </p>
              </div>
            </div>

            {eventsLoading && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="flex gap-4">
                        <Skeleton className="h-24 w-24 rounded-md flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-6 w-2/3" />
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-4 w-1/3" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {eventsError && (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  {t("Failed to load events", "Error al cargar eventos")}
                </CardContent>
              </Card>
            )}

            {eventsData && eventsData.events.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  {t(
                    "No events found. You are not currently qualified for any events.",
                    "No se encontraron eventos. No estás calificado para ningún evento actualmente."
                  )}
                </CardContent>
              </Card>
            )}

            {eventsData && eventsData.events.length > 0 && (
              <div className="space-y-4">
                {eventsData.events.map((event) => (
                  <Card key={event.id} className="overflow-visible" data-testid={`card-event-${event.id}`}>
                    <CardContent className="p-0">
                      <div className="flex flex-col sm:flex-row gap-4 p-4">
                        {event.heroImageUrl && (
                          <div className="w-full sm:w-32 h-24 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                            <img 
                              src={event.heroImageUrl} 
                              alt={getEventName(event)} 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-2">
                          <h3 className="font-semibold text-lg" data-testid={`text-event-name-${event.id}`}>
                            {getEventName(event)}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatEventDates(event.startDate, event.endDate)}
                            </span>
                            {event.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {event.location}
                              </span>
                            )}
                          </div>
                          {event.lastUpdated && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-last-updated-${event.id}`}>
                              {t("Last updated", "Última actualización")}: {format(new Date(event.lastUpdated), "MMM d, yyyy h:mm a")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 justify-center shrink-0">
                          <Badge 
                            variant={event.registrationStatus === "registered" ? "default" : "secondary"}
                            data-testid={`badge-status-${event.id}`}
                          >
                            {event.registrationStatus === "registered" ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {t("Registered", "Registrado")}
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3 mr-1" />
                                {t("Qualified", "Calificado")}
                              </>
                            )}
                          </Badge>
                          <Link href={`/register/${event.slug || event.id}`}>
                            <Button 
                              variant={event.registrationStatus === "registered" ? "outline" : "default"}
                              className="gap-1"
                              data-testid={`button-event-action-${event.id}`}
                            >
                              {event.registrationStatus === "registered" 
                                ? t("View / Edit", "Ver / Editar")
                                : t("Register", "Registrar")}
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className="mt-8 pb-8 text-center text-sm text-muted-foreground">
          <a href="https://unicity.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Unicity International</a>
          <span className="mx-2">|</span>
          <a href="mailto:colby.cook@unicity.com" className="hover:underline">colby.cook@unicity.com</a>
        </footer>
      </main>
    </div>
  );
}
