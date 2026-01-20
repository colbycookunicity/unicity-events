import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle, Calendar, MapPin, ExternalLink, Mail, ShieldCheck, AlertCircle, LogOut, QrCode, Ticket } from "lucide-react";
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import unicityLogoDark from "@/assets/unicity-logo-dark.png";
import unicityLogoWhite from "@/assets/unicity-logo-white.png";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useTranslation, useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { getMapUrl } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import type { Event, EventPage, EventPageSection, IntroSectionContent, ThankYouSectionContent, HeroSectionContent, FormSectionContent } from "@shared/schema";
import EventListPage from "./EventListPage";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

// Custom form field type (matches FormBuilder output)
interface CustomFormField {
  id: string;
  type: "text" | "email" | "phone" | "select" | "checkbox" | "textarea" | "date" | "number" | "radio";
  label: string;
  labelEs?: string;
  placeholder?: string;
  placeholderEs?: string;
  required: boolean;
  options?: { value: string; label: string; labelEs?: string }[];
  conditionalOn?: { field: string; value: string };
}

import { IntroSection, ThankYouSection } from "@/components/landing-sections";
import { RegistrationQRCode, QRCodeDialog } from "@/components/RegistrationQRCode";

interface PageData {
  page: EventPage;
  sections: EventPageSection[];
}

// Helper to parse date strings as local time (prevents timezone shift)
const parseLocalDate = (dateStr: string | Date | null | undefined) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  // For ISO date strings like "2026-06-04", add time to prevent UTC interpretation
  if (typeof dateStr === "string" && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return parseISO(dateStr + "T12:00:00");
  }
  return new Date(dateStr);
};

type VerificationStep = "email" | "otp" | "form";

type VerifiedProfile = {
  unicityId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  customerId?: number;
};

type RegistrationMode = "qualified_verified" | "open_verified" | "open_anonymous";

type PublicEvent = Event & {
  formFields?: any;
  registrationLayout?: string;
  registrationMode?: RegistrationMode;
  requiresVerification?: boolean;
  requiresQualification?: boolean;
  defaultLanguage?: 'en' | 'es';
};

// Extended form field type that includes all template field properties
interface TemplateFormField {
  name: string;
  type: string;
  label: string;
  labelEs?: string;
  placeholder?: string;
  placeholderEs?: string;
  required?: boolean;
  locked?: boolean;
  editable?: boolean;
  options?: Array<{ value: string; label: string; labelEs?: string }>;
  waiverUrl?: string;
  secondaryWaiverUrl?: string;
  conditionalOn?: { field: string; value: string };
}

// Helper to check if a field exists in the template
const hasTemplateField = (formFields: any[] | undefined, fieldName: string): boolean => {
  if (!formFields || !Array.isArray(formFields)) return false;
  return formFields.some((f: TemplateFormField) => f.name === fieldName);
};

// Helper to get a template field by name
const getTemplateField = (formFields: any[] | undefined, fieldName: string): TemplateFormField | undefined => {
  if (!formFields || !Array.isArray(formFields)) return undefined;
  return formFields.find((f: TemplateFormField) => f.name === fieldName);
};

// Get fields that are NOT handled by hardcoded sections (for Additional Information)
const getCustomOnlyFields = (formFields: any[] | undefined): TemplateFormField[] => {
  if (!formFields || !Array.isArray(formFields)) return [];
  // These field names are handled by the hardcoded sections
  const hardcodedFieldNames = new Set([
    'unicityId', 'email', 'firstName', 'lastName', 'phone',
    'gender', 'dateOfBirth', 'passportNumber', 'passportCountry', 'passportExpiration',
    'emergencyContact', 'emergencyContactPhone', 'shirtSize', 'pantSize',
    'dietaryRestrictions', 'adaAccommodations', 'roomType', 'termsAccepted'
  ]);
  return formFields.filter((f: TemplateFormField) => !hardcodedFieldNames.has(f.name));
};

const genderedShirtSizes = [
  "Womens - XS",
  "Womens - Small",
  "Womens - Medium",
  "Womens - Large",
  "Womens - XL",
  "Womens - 2XL",
  "Womens - 3XL",
  "Womens - 4XL",
  "Mens - XS",
  "Mens - Small",
  "Mens - Medium",
  "Mens - Large",
  "Mens - XL",
  "Mens - 2XL",
  "Mens - 3XL",
  "Mens - 4XL",
];

const genderedPantSizes = [
  "Womens - XS",
  "Womens - Small",
  "Womens - Medium",
  "Womens - Large",
  "Womens - XL",
  "Womens - 2XL",
  "Womens - 3XL",
  "Womens - 4XL",
  "Mens - XS",
  "Mens - Small",
  "Mens - Medium",
  "Mens - Large",
  "Mens - XL",
  "Mens - 2XL",
  "Mens - 3XL",
  "Mens - 4XL",
];

const dietaryOptions = [
  { value: "none", label: "None", labelEs: "Ninguna" },
  { value: "vegan", label: "Vegan", labelEs: "Vegano" },
  { value: "vegetarian", label: "Vegetarian", labelEs: "Vegetariano" },
  { value: "shellfish-allergy", label: "Allergy to Shellfish", labelEs: "Alergia a mariscos" },
  { value: "seafood-allergy", label: "Allergic to Seafood", labelEs: "Alergia a pescados" },
  { value: "no-pork", label: "No pork", labelEs: "Sin cerdo" },
  { value: "no-chicken", label: "No chicken", labelEs: "Sin pollo" },
  { value: "dairy-free", label: "Dairy Free", labelEs: "Sin lacteos" },
  { value: "gluten-free", label: "Gluten Free", labelEs: "Sin gluten" },
  { value: "no-red-meat", label: "No Red Meat", labelEs: "Sin carne roja" },
  { value: "halal", label: "Halal", labelEs: "Halal" },
  { value: "kosher", label: "Kosher", labelEs: "Kosher" },
  { value: "keto", label: "Keto", labelEs: "Keto" },
  { value: "nut-allergy", label: "Allergic to Nuts", labelEs: "Alergia a nueces" },
];

const roomTypes = [
  { value: "one-king", label: "One King Bed", labelEs: "Una cama King" },
  { value: "two-queens", label: "Two Queen Beds", labelEs: "Dos camas Queen" },
];

// Base schema with always-required fields (core identity)
const baseRegistrationSchema = z.object({
  unicityId: z.string().min(1, "Distributor ID is required"),
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  gender: z.enum(["female", "male"]).optional(),
  dateOfBirth: z.string().optional(),
  passportNumber: z.string().optional(),
  passportCountry: z.string().optional(),
  passportExpiration: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  shirtSize: z.string().optional(),
  pantSize: z.string().optional(),
  dietaryRestrictions: z.array(z.string()).default([]),
  adaAccommodations: z.boolean().default(false),
  roomType: z.string().optional(),
  termsAccepted: z.boolean().default(false),
});

// Function to create schema based on template fields
const createRegistrationSchema = (formFields: any[] | undefined) => {
  const hasField = (name: string) => hasTemplateField(formFields, name);
  
  let schema = baseRegistrationSchema;
  
  // Add required validation only for fields that exist in the template
  if (hasField('gender')) {
    schema = schema.extend({
      gender: z.enum(["female", "male"], { required_error: "Gender is required" }),
    });
  }
  
  if (hasField('dateOfBirth')) {
    schema = schema.extend({
      dateOfBirth: z.string().min(1, "Date of birth is required"),
    });
  }
  
  if (hasField('passportNumber')) {
    schema = schema.extend({
      passportNumber: z.string().min(1, "Passport number is required"),
      passportCountry: z.string().min(1, "Passport country is required"),
      passportExpiration: z.string().min(1, "Passport expiration is required").refine((val) => {
        const date = new Date(val);
        return date > new Date();
      }, "Passport must not be expired"),
    });
  }
  
  if (hasField('emergencyContact')) {
    schema = schema.extend({
      emergencyContact: z.string().min(1, "Emergency contact name is required"),
      emergencyContactPhone: z.string().min(1, "Emergency contact phone is required").refine((val) => {
        if (!val) return false;
        return /^\+[1-9]\d{6,14}$/.test(val.replace(/\s/g, ''));
      }, "Please enter a valid phone number"),
    });
  }
  
  if (hasField('shirtSize')) {
    schema = schema.extend({
      shirtSize: z.string().min(1, "T-shirt size is required"),
    });
  }
  
  if (hasField('pantSize')) {
    schema = schema.extend({
      pantSize: z.string().min(1, "Pant size is required"),
    });
  }
  
  if (hasField('roomType')) {
    schema = schema.extend({
      roomType: z.string().min(1, "Room type is required"),
    });
  }
  
  // termsAccepted - check if template has a terms field
  if (hasField('termsAccepted')) {
    schema = schema.extend({
      termsAccepted: z.literal(true, {
        errorMap: () => ({ message: "You must accept the event waiver" }),
      }),
    });
  }
  
  return schema;
};

type RegistrationFormData = z.infer<typeof baseRegistrationSchema>;

export default function RegistrationPage() {
  const { t, language } = useTranslation();
  const { setLanguage } = useLanguage();
  const { toast } = useToast();
  const { theme } = useTheme();
  const params = useParams<{ eventId: string }>();

  // Language parameter detection
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get("lang") || urlParams.get("language");
    if (langParam === "es" || langParam === "en") {
      if (langParam !== language) {
        setLanguage(langParam);
      }
    }
  }, []);

  const [isSuccess, setIsSuccess] = useState(false);
  
  // Verification flow state
  const [verificationStep, setVerificationStep] = useState<VerificationStep>("email");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationDistributorId, setVerificationDistributorId] = useState(""); // For qualified_verified mode
  const [verificationSessionToken, setVerificationSessionToken] = useState<string | null>(null); // SECURITY: For sessionToken-based OTP validation
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedProfile, setVerifiedProfile] = useState<VerifiedProfile | null>(null);
  const [verifiedByHydra, setVerifiedByHydra] = useState(false);
  const [isQualified, setIsQualified] = useState(true);
  const [qualificationMessage, setQualificationMessage] = useState("");
  const [qualificationChecked, setQualificationChecked] = useState(false); // Track if qualification was checked
  
  // Open verified mode: form visible immediately, OTP required before submission
  const [pendingSubmissionData, setPendingSubmissionData] = useState<RegistrationFormData | null>(null);
  const [showOtpDialog, setShowOtpDialog] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  // Parse URL query params for pre-population (skip verification if pre-populated)
  const urlParams = new URLSearchParams(window.location.search);
  const prePopulatedUnicityId = urlParams.get("uid") || urlParams.get("unicityId") || "";
  const prePopulatedEmail = urlParams.get("email") || "";
  const prePopulatedFirstName = urlParams.get("firstName") || "";
  const prePopulatedLastName = urlParams.get("lastName") || "";
  const prePopulatedPhone = urlParams.get("phone") || "";
  const prePopulatedToken = urlParams.get("token") || "";
  
  // Track if we're consuming a token
  const [isConsumingToken, setIsConsumingToken] = useState(false);
  const [tokenConsumed, setTokenConsumed] = useState(false);
  // Track if OTP was just verified (prevents session check from clearing state during state transition)
  const [otpJustVerified, setOtpJustVerified] = useState(false);
  
  // Track existing registration for returning users
  const [existingRegistrationId, setExistingRegistrationId] = useState<string | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  // Track completed registration ID for thank-you page QR code
  const [completedRegistrationId, setCompletedRegistrationId] = useState<string | null>(null);
  // Track check-in token for Apple Wallet button
  const [completedCheckInToken, setCompletedCheckInToken] = useState<string | null>(null);
  // Track which email+event combination we loaded data for (security: prevents cross-user/cross-event data leakage)
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);
  // Ref to prevent duplicate fetch calls during React concurrent mode/strict mode re-renders
  const fetchingExistingRef = useRef<string | null>(null);
  
  // Skip verification if URL params provide identity (pre-qualified link)
  const skipVerification = Boolean(prePopulatedUnicityId && prePopulatedEmail);
  
  // Identity fields are locked after verification (but only if we have actual values)
  const isIdentityLocked = Boolean(verifiedProfile) || skipVerification;

  // Map view URL helper
  const getMapUrl = (location: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  };

  // Verification step UI
  const renderVerificationStep = () => {
    // For qualified_verified mode, if user failed qualification, show the not qualified message
    if (qualifiedVerifiedMode && qualificationChecked && !isQualified) {
      return renderNotQualifiedMessage();
    }

    // Add event header to verification pages
    const verificationHeader = event?.headerImageUrl ? (
      <div className="w-full h-48 md:h-64 overflow-hidden relative mb-8">
        <img 
          src={event.headerImageUrl} 
          alt={event.name} 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>
    ) : null;

    if (verificationStep === "email") {
      return (
        <div className="flex flex-col items-center w-full">
          {verificationHeader}
          <div className="w-full max-w-md px-4">
            <Card id="verification-section">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Mail className="w-6 h-6 text-muted-foreground" />
                </div>
                <CardTitle className="text-foreground">
                  {language === "es" 
                    ? (loginHeroContent?.headlineEs || "Verifique su identidad")
                    : (loginHeroContent?.headline || "Verify Your Identity")}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {qualifiedVerifiedMode 
                    ? (language === "es" 
                        ? "Ingrese su ID de distribuidor o correo electrónico para verificar su elegibilidad"
                        : "Enter your distributor ID or email to verify your eligibility")
                    : (language === "es" 
                        ? (loginHeroContent?.subheadlineEs || "Ingrese su correo electronico para recibir un codigo de verificacion")
                        : (loginHeroContent?.subheadline || "Enter your email to receive a verification code"))}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {qualifiedVerifiedMode && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        {language === "es" ? "ID de Distribuidor" : "Distributor ID"}
                      </label>
                      <Input
                        type="text"
                        placeholder={language === "es" ? "Su ID de distribuidor" : "Your distributor ID"}
                        value={verificationDistributorId}
                        onChange={(e) => setVerificationDistributorId(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                        data-testid="input-verification-distributor-id"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <div className="flex-1 h-px bg-border" />
                      <span>{language === "es" ? "o" : "or"}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {language === "es" ? "Correo Electrónico" : "Email"}{!qualifiedVerifiedMode && " *"}
                  </label>
                  <Input
                    type="email"
                    placeholder={language === "es" ? "correo@ejemplo.com" : "email@example.com"}
                    value={verificationEmail}
                    onChange={(e) => setVerificationEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                    data-testid="input-verification-email"
                  />
                </div>
                {qualifiedVerifiedMode && (
                  <p className="text-xs text-muted-foreground text-center">
                    {language === "es" 
                      ? "Ingrese su ID de distribuidor O correo electrónico (solo uno es necesario)"
                      : "Enter your Distributor ID OR Email (only one is needed)"}
                  </p>
                )}
                <Button 
                  onClick={handleSendOtp} 
                  disabled={isVerifying || (qualifiedVerifiedMode ? (!verificationEmail && !verificationDistributorId) : !verificationEmail)}
                  className="w-full"
                  data-testid="button-send-code"
                >
                  {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {qualifiedVerifiedMode 
                    ? (language === "es" ? "Verificar elegibilidad" : "Verify Eligibility")
                    : (language === "es" ? "Enviar codigo" : "Send Code")}
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
                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-muted-foreground" />
                </div>
                <CardTitle className="text-foreground">
                  {language === "es" ? "Ingrese el codigo" : "Enter Verification Code"}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {language === "es" 
                    ? `Enviamos un codigo de 6 digitos a ${verificationEmail}`
                    : `We sent a 6-digit code to ${verificationEmail}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otpCode}
                    onChange={(value) => setOtpCode(value)}
                    onComplete={handleVerifyOtp}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    data-testid="input-otp-code"
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
                <Button 
                  onClick={handleVerifyOtp} 
                  disabled={isVerifying || otpCode.length !== 6}
                  className="w-full"
                  data-testid="button-verify-code"
                >
                  {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {language === "es" ? "Verificar" : "Verify"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setOtpCode("");
                    handleSendOtp();
                  }}
                  disabled={isVerifying}
                  className="w-full"
                  data-testid="button-resend-code"
                >
                  {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {language === "es" ? "Reenviar código" : "Resend Code"}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    setVerificationStep("email");
                    setOtpCode("");
                    setVerificationSessionToken(null);
                  }}
                  className="w-full"
                  data-testid="button-back-to-email"
                >
                  {language === "es" ? "Usar otro correo" : "Use a different email"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderNotQualifiedMessage = () => {
    const contactEmail = "americasevent@unicity.com";
    return (
      <Card className="border-destructive">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <CardTitle className="text-destructive">
            {language === "es" ? "No califica" : "Not Qualified"}
          </CardTitle>
          <CardDescription>
            {qualificationMessage || (language === "es" 
              ? "Lo sentimos, no califica para este evento en este momento."
              : "Sorry, you do not qualify for this event at this time.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground text-sm">
            {language === "es" 
              ? "Por favor verifique que su ID de Distribuidor y correo electrónico (usado para iniciar sesión en Unicity) sean correctos."
              : "Please double-check that your Distributor ID and Email (used to login to Unicity) are correct."}
          </p>
          <p className="text-muted-foreground text-sm">
            {language === "es" 
              ? <>Si tiene problemas, <a href={`mailto:${contactEmail}`} className="text-primary underline hover:no-underline">contáctenos</a>.</>
              : <>If you are having issues, <a href={`mailto:${contactEmail}`} className="text-primary underline hover:no-underline">contact us</a>.</>}
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              setQualificationChecked(false);
              setIsQualified(true);
              setQualificationMessage("");
              setVerificationDistributorId("");
              setVerificationEmail("");
            }}
            className="mt-2"
            data-testid="button-try-again"
          >
            {language === "es" ? "Intentar de nuevo" : "Try Again"}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderEventInfo = (forHero = false) => {
    return (
      <div className={`flex items-center justify-center gap-4 flex-wrap ${forHero ? "text-white/80" : "text-muted-foreground"}`}>
        {event.startDate && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {format(parseLocalDate(event.startDate)!, "MMM d, yyyy")}
            {event.endDate && event.endDate !== event.startDate && (
              <> - {format(parseLocalDate(event.endDate)!, "MMM d, yyyy")}</>
            )}
          </span>
        )}
        {event.location && (
          <a 
            href={getMapUrl(event.location)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 hover:underline transition-colors ${forHero ? "hover:text-white" : "hover:text-primary"}`}
            onClick={(e) => e.stopPropagation()}
            data-testid="link-event-location"
          >
            <MapPin className="h-4 w-4" />
            {event.location}
          </a>
        )}
      </div>
    );
  };

  const renderFormCard = () => {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 pb-12">
        <div className="space-y-8">
          <Card>
            <CardContent className="p-6">
              <RegistrationForm 
                eventId={params.eventId} 
                initialData={verifiedProfile ? {
                  firstName: verifiedProfile.firstName,
                  lastName: verifiedProfile.lastName,
                  email: verifiedProfile.email,
                  unicityId: verifiedProfile.unicityId,
                  phone: verifiedProfile.phone
                } : (skipVerification ? {
                  firstName: prePopulatedFirstName,
                  lastName: prePopulatedLastName,
                  email: prePopulatedEmail,
                  unicityId: prePopulatedUnicityId,
                  phone: prePopulatedPhone
                } : undefined)}
                isLocked={isIdentityLocked}
                onSuccess={(registrationId, checkInToken) => {
                  setCompletedRegistrationId(registrationId);
                  setCompletedCheckInToken(checkInToken);
                  setIsSuccess(true);
                }}
                existingRegistrationId={existingRegistrationId}
                qualifiedProfile={verifiedProfile || undefined}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderMainContent = () => {
    if (qualifiedVerifiedMode && !skipVerification) {
      if (qualificationChecked && !isQualified) {
        return renderNotQualifiedMessage();
      }
      if (verificationStep !== "form") {
        return renderVerificationStep();
      }
      if (!verifiedProfile) {
        return renderVerificationStep();
      }
    }
    if (requiresVerification && verificationStep !== "form") {
      return renderVerificationStep();
    }
    if (verifiedProfile && !isQualified) {
      return renderNotQualifiedMessage();
    }
    return renderFormCard();
  };

  if (isLoading || isConsumingToken) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">
          {isConsumingToken 
            ? (language === "es" ? "Verificando su enlace de registro..." : "Verifying your registration link...")
            : (language === "es" ? "Cargando evento..." : "Loading event...")}
        </p>
      </div>
    );
  }

  if (!event) return <NotFound />;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <div className="fixed top-4 right-4 z-50">
          <LanguageToggle />
        </div>
        
        {event.headerImageUrl && (
          <div className="w-full h-48 md:h-64 overflow-hidden relative">
            <img 
              src={event.headerImageUrl} 
              alt={event.name} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20" />
          </div>
        )}
        
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <div className="mb-8 flex justify-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight mb-4 text-foreground">
            {language === "es" 
              ? (thankYouContent?.headlineEs || "¡Registro Completado!")
              : (thankYouContent?.headline || "Registration Completed!")}
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            {language === "es" 
              ? (thankYouContent?.subheadlineEs || `Gracias por registrarse para ${event.nameEs || event.name}. Hemos enviado un correo de confirmación.`)
              : (thankYouContent?.subheadline || `Thank you for registering for ${event.name}. We have sent a confirmation email.`)}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            {completedRegistrationId && (
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {language === "es" ? "Su Pase de Entrada" : "Your Entry Pass"}
                </div>
                <div className="bg-white p-2 inline-block rounded-lg border">
                  <QRCodeSVG 
                    value={completedRegistrationId}
                    size={160}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                  {completedRegistrationId}
                </div>
              </div>
            )}
            
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => window.print()}
                variant="outline"
                className="w-full sm:w-auto"
                data-testid="button-print-confirmation"
              >
                <Printer className="w-4 h-4 mr-2" />
                {language === "es" ? "Imprimir Confirmación" : "Print Confirmation"}
              </Button>
              
              {completedCheckInToken && (
                <AppleWalletButton 
                  checkInToken={completedCheckInToken}
                  className="w-full sm:w-auto"
                />
              )}
            </div>
          </div>

          <Card className="max-w-2xl mx-auto text-left">
            <CardHeader>
              <CardTitle>{language === "es" ? "Detalles del Evento" : "Event Details"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {language === "es" ? "Fecha" : "Date"}
                  </div>
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <Calendar className="w-4 h-4 text-primary" />
                    {event.startDate && format(parseLocalDate(event.startDate)!, "MMMM d, yyyy")}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {language === "es" ? "Ubicación" : "Location"}
                  </div>
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <MapPin className="w-4 h-4 text-primary" />
                    {event.location}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const renderHeroContent = () => {
    return (
      <div className="relative w-full overflow-hidden">
        {event.headerImageUrl ? (
          <div className="w-full h-[350px] md:h-[450px] relative">
            <img 
              src={event.headerImageUrl} 
              alt={event.name} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-6 text-center">
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-4 drop-shadow-md">
                {language === "es" ? (event.nameEs || event.name) : event.name}
              </h1>
              {renderEventInfo(true)}
            </div>
          </div>
        ) : (
          <div className="w-full py-16 md:py-24 bg-muted/30 border-b">
            <div className="max-w-4xl mx-auto px-4 text-center">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">
                {language === "es" ? (event.nameEs || event.name) : event.name}
              </h1>
              {renderEventInfo(false)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-4 right-4 z-50">
        <LanguageToggle />
      </div>
      
      {verificationStep === "form" || skipVerification ? (
        <>
          {renderHeroContent()}
          <div className="mt-12">
            {renderMainContent()}
          </div>
        </>
      ) : (
        <div className="min-h-screen flex items-center justify-center py-12">
          {renderMainContent()}
        </div>
      )}
    </div>
  );

}
