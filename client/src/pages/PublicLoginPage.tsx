import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Mail, ShieldCheck, Calendar, MapPin, ChevronRight, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import unicityIcon from "@/assets/unicity-logo.png";
import { format } from "date-fns";

type LoginStep = "email" | "otp" | "select-event";

type QualifyingEvent = {
  id: string;
  slug: string | null;
  name: string;
  nameEs: string | null;
  startDate: string;
  endDate: string;
  location: string | null;
  hasRegistration: boolean;
  registrationStatus: string | null;
  registrationId: string | null;
  isQualified: boolean;
};

export default function PublicLoginPage() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [qualifyingEvents, setQualifyingEvents] = useState<QualifyingEvent[]>([]);
  const [redirectToken, setRedirectToken] = useState("");

  const handleSendCode = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/generate", { email });
      const data = await res.json();
      if (data.success) {
        setStep("otp");
        toast({
          title: t("emailSent"),
          description: `Code sent to ${email}`,
        });
      }
    } catch (error: any) {
      toast({
        title: t("error"),
        description: error?.message || "Failed to send verification code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (otpCode.length !== 6) {
      toast({
        title: t("invalidCode"),
        description: "Please enter a 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/validate", {
        email,
        code: otpCode,
      });
      const data = await res.json();
      
      if (data.success && data.verified && data.redirectToken) {
        // Store the redirect token for passing to registration page
        const redirectToken = data.redirectToken;
        
        // Check if this is an admin email - redirect to admin login instead
        if (email.toLowerCase().endsWith("@unicity.com")) {
          setLocation("/admin/login");
          return;
        }
        
        // Now fetch qualifying events
        const eventsRes = await apiRequest("POST", "/api/register/qualifying-events", { email });
        const eventsData = await eventsRes.json();
        
        if (eventsData.events && eventsData.events.length > 0) {
          if (eventsData.events.length === 1) {
            // Single event - redirect directly with token
            const event = eventsData.events[0];
            const eventSlug = event.slug || event.id;
            setLocation(`/register/${eventSlug}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(redirectToken)}`);
          } else {
            // Multiple events - show selection (pass token via state)
            setQualifyingEvents(eventsData.events);
            setRedirectToken(redirectToken);
            setStep("select-event");
          }
        } else {
          toast({
            title: "No Qualifying Events",
            description: "You do not qualify for any active events at this time.",
            variant: "destructive",
          });
          setOtpCode("");
          setStep("email");
        }
      }
    } catch (error: any) {
      toast({
        title: t("invalidCode"),
        description: error?.message || "Please check your code and try again",
        variant: "destructive",
      });
      setOtpCode("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setOtpCode("");
    await handleSendCode();
  };

  const handleEventSelect = (event: QualifyingEvent) => {
    const eventSlug = event.slug || event.id;
    setLocation(`/register/${eventSlug}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(redirectToken)}`);
  };

  useEffect(() => {
    if (otpCode.length === 6) {
      handleVerifyCode();
    }
  }, [otpCode]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-end gap-2 p-4">
        <LanguageToggle />
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <img 
              src={unicityIcon} 
              alt="Unicity" 
              className="mx-auto h-14 w-14 rounded-md object-cover"
              data-testid="img-unicity-logo"
            />
            <div>
              <CardTitle className="text-2xl font-semibold" data-testid="text-login-title">
                {step === "select-event" ? (language === "es" ? "Seleccionar Evento" : "Select Event") : "Unicity Events"}
              </CardTitle>
              <CardDescription className="mt-2" data-testid="text-login-description">
                {step === "email" && (language === "es" ? "Ingresa tu correo para comenzar" : "Enter your email to get started")}
                {step === "otp" && (language === "es" ? "Ingresa el código de verificación" : "Enter verification code")}
                {step === "select-event" && (language === "es" ? "Elige el evento al que deseas registrarte" : "Choose which event to register for")}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {step === "email" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                      data-testid="input-email"
                    />
                  </div>
                </div>
                <Button 
                  onClick={handleSendCode} 
                  className="w-full" 
                  disabled={isLoading}
                  data-testid="button-send-code"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {language === "es" ? "Enviando..." : "Sending..."}
                    </>
                  ) : (
                    language === "es" ? "Enviar Código" : "Send Code"
                  )}
                </Button>
              </div>
            )}

            {step === "otp" && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{language === "es" ? `Código enviado a ${email}` : `Code sent to ${email}`}</span>
                </div>

                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otpCode}
                    onChange={setOtpCode}
                    disabled={isLoading}
                    data-testid="input-otp"
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

                {isLoading && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{language === "es" ? "Verificando..." : "Verifying..."}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button 
                    variant="ghost" 
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="text-sm"
                    data-testid="button-resend-code"
                  >
                    {language === "es" ? "Reenviar código" : "Resend code"}
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => { setStep("email"); setOtpCode(""); }}
                    disabled={isLoading}
                    className="text-sm"
                    data-testid="button-change-email"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {language === "es" ? "Cambiar correo" : "Change email"}
                  </Button>
                </div>
              </div>
            )}

            {step === "select-event" && (
              <div className="space-y-3">
                {qualifyingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-4 border rounded-md hover-elevate active-elevate-2 cursor-pointer transition-colors"
                    onClick={() => handleEventSelect(event)}
                    data-testid={`card-event-${event.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate" data-testid={`text-event-name-${event.id}`}>
                          {language === "es" && event.nameEs ? event.nameEs : event.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{format(new Date(event.startDate), "MMM d, yyyy")}</span>
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                        </div>
                        {event.hasRegistration && (
                          <div className="mt-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {event.registrationStatus === "checked_in" 
                                ? (language === "es" ? "Registrado" : "Checked In")
                                : event.registrationStatus === "registered"
                                ? (language === "es" ? "Registrado" : "Registered") 
                                : (language === "es" ? "En progreso" : "In Progress")}
                            </span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </div>
                ))}

                <Button 
                  variant="ghost" 
                  onClick={() => { setStep("email"); setOtpCode(""); setQualifyingEvents([]); }}
                  className="w-full mt-4"
                  data-testid="button-back-to-email"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {language === "es" ? "Usar otro correo" : "Use different email"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="p-4 text-center text-sm text-muted-foreground">
        Unicity International
      </footer>
    </div>
  );
}
