const fs = require('fs');
const content = `import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Calendar, MapPin, Mail, Printer } from "lucide-react";
import "react-phone-number-input/style.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslation, useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { QRCodeSVG } from "qrcode.react";
import { AppleWalletButton } from "@/components/AppleWalletButton";
import { RegistrationForm } from "@/components/RegistrationForm";

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === "string" && dateStr.match(/^\\d{4}-\\d{2}-\\d{2}$/)) {
    return parseISO(dateStr + "T12:00:00");
  }
  return new Date(dateStr);
};

export default function RegistrationPage() {
  const { language } = useTranslation();
  const { setLanguage } = useLanguage();
  const { toast } = useToast();
  const params = useParams();
  const [isSuccess, setIsSuccess] = useState(false);
  const [verificationStep, setVerificationStep] = useState("email");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationDistributorId, setVerificationDistributorId] = useState("");
  const [verificationSessionToken, setVerificationSessionToken] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedProfile, setVerifiedProfile] = useState(null);
  const [completedRegistrationId, setCompletedRegistrationId] = useState(null);
  const [completedCheckInToken, setCompletedCheckInToken] = useState(null);
  
  const urlParams = new URLSearchParams(window.location.search);
  const prePopulatedUnicityId = urlParams.get("uid") || urlParams.get("unicityId") || "";
  const prePopulatedEmail = urlParams.get("email") || "";

  useEffect(() => {
    const langParam = urlParams.get("lang") || urlParams.get("language");
    if ((langParam === "es" || langParam === "en") && langParam !== language) {
      setLanguage(langParam);
    }
  }, [language, setLanguage]);

  const { data: event, isLoading } = useQuery({
    queryKey: ["/api/events/public", params.eventId],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0]);
      if (!res.ok) throw new Error("Failed to fetch event");
      return res.json();
    }
  });

  const { data: pageData } = useQuery({
    queryKey: ["/api/events", params.eventId, "page"],
    enabled: !!event,
  });

  const sections = pageData?.sections || [];
  const thankYouSection = sections.find(s => s.type === "thank_you");
  const thankYouContent = thankYouSection?.content;
  const loginHeroSection = sections.find(s => s.type === "hero");
  const loginHeroContent = loginHeroSection?.content;

  const registrationMode = event?.registrationMode || "open_verified";
  const qualifiedVerifiedMode = registrationMode === "qualified_verified";
  const skipVerification = Boolean(prePopulatedUnicityId && prePopulatedEmail);

  const handleSendOtp = async () => {
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/auth/otp/send", {
        email: verificationEmail,
        distributorId: verificationDistributorId,
        eventId: params.eventId
      });
      const data = await res.json();
      if (data.sessionToken) {
        setVerificationSessionToken(data.sessionToken);
        setVerificationStep("otp");
      }
    } catch (error) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyOtp = async () => {
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/auth/otp/verify", {
        otp: otpCode,
        sessionToken: verificationSessionToken,
        eventId: params.eventId
      });
      const data = await res.json();
      if (data.profile) {
        setVerifiedProfile(data.profile);
        setVerificationStep("form");
      }
    } catch (error) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin h-12 w-12" /></div>;
  if (!event) return <div>Event not found</div>;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background">
        {event.headerImageUrl && (
          <div className="w-full h-48 md:h-64 overflow-hidden relative">
            <img src={event.headerImageUrl} className="w-full h-full object-cover" alt="Event Header" />
            <div className="absolute inset-0 bg-black/20" />
          </div>
        )}
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
          <h1 className="text-4xl font-bold mb-4">{language === "es" ? (thankYouContent?.headlineEs || "¡Registro Completado!") : (thankYouContent?.headline || "Registration Completed!")}</h1>
          {completedRegistrationId && (
            <div className="mt-8 bg-white p-4 inline-block rounded-xl border">
              <QRCodeSVG value={completedRegistrationId} size={160} />
            </div>
          )}
          <div className="mt-8 flex gap-4 justify-center">
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> {language === "es" ? "Imprimir" : "Print"}</Button>
            {completedCheckInToken && <AppleWalletButton checkInToken={completedCheckInToken} />}
          </div>
        </div>
      </div>
    );
  }

  const renderVerificationStep = () => {
    const verificationHeader = event?.headerImageUrl ? (
      <div className="w-full h-48 md:h-64 overflow-hidden relative mb-8">
        <img src={event.headerImageUrl} alt={event.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/20" />
      </div>
    ) : null;

    if (verificationStep === "email") {
      return (
        <div className="flex flex-col items-center w-full">
          {verificationHeader}
          <div className="w-full max-w-md px-4">
            <Card>
              <CardHeader className="text-center">
                <CardTitle>{language === "es" ? (loginHeroContent?.headlineEs || "Verifique su identidad") : (loginHeroContent?.headline || "Verify Your Identity")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {qualifiedVerifiedMode && (
                  <Input placeholder="Distributor ID" value={verificationDistributorId} onChange={e => setVerificationDistributorId(e.target.value)} />
                )}
                <Input type="email" placeholder="Email" value={verificationEmail} onChange={e => setVerificationEmail(e.target.value)} />
                <Button onClick={handleSendOtp} disabled={isVerifying || !verificationEmail} className="w-full">
                  {isVerifying && <Loader2 className="mr-2 animate-spin h-4 w-4" />}
                  {language === "es" ? "Enviar código" : "Send Code"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    if (verificationStep === "otp") {
      return (
        <div className="flex flex-col items-center w-full">
          {verificationHeader}
          <div className="w-full max-w-md px-4">
            <Card>
              <CardHeader className="text-center">
                <CardTitle>{language === "es" ? "Ingrese el codigo" : "Enter Verification Code"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} onComplete={handleVerifyOtp}>
                    <InputOTPGroup>
                      {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button onClick={handleVerifyOtp} disabled={isVerifying || otpCode.length !== 6} className="w-full">
                  {isVerifying && <Loader2 className="mr-2 animate-spin h-4 w-4" />}
                  {language === "es" ? "Verificar" : "Verify"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <LanguageToggle />
      </div>
      {verificationStep === "form" || skipVerification ? (
        <>
          <div className="relative w-full h-[350px]">
            {event.headerImageUrl && <img src={event.headerImageUrl} className="w-full h-full object-cover" alt="Banner" />}
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white p-4">
              <h1 className="text-4xl md:text-6xl font-bold mb-4 text-center">{language === "es" ? (event.nameEs || event.name) : event.name}</h1>
              <div className="flex items-center justify-center gap-4 flex-wrap text-white/80">
                {event?.startDate && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {format(parseLocalDate(event.startDate), "MMM d, yyyy")}
                  </span>
                )}
                {event?.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="max-w-4xl mx-auto px-4 py-12">
            <Card>
              <CardContent className="p-6">
                <RegistrationForm 
                  eventId={params.eventId} 
                  initialData={verifiedProfile || (skipVerification ? { unicityId: prePopulatedUnicityId, email: prePopulatedEmail } : {})}
                  isLocked={Boolean(verifiedProfile) || skipVerification}
                  onSuccess={(id, token) => { 
                    setCompletedRegistrationId(id); 
                    setCompletedCheckInToken(token); 
                    setIsSuccess(true); 
                    window.scrollTo(0, 0);
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : renderVerificationStep()}
    </div>
  );
}
`;
fs.writeFileSync('client/src/pages/RegistrationPage.tsx', content.trim());
