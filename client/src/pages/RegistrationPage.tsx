import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle, Calendar, MapPin, ExternalLink, Mail, ShieldCheck, AlertCircle, LogOut } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";
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
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Verification flow state
  const [verificationStep, setVerificationStep] = useState<VerificationStep>("email");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedProfile, setVerifiedProfile] = useState<VerifiedProfile | null>(null);
  const [verifiedByHydra, setVerifiedByHydra] = useState(false);
  const [isQualified, setIsQualified] = useState(true);
  const [qualificationMessage, setQualificationMessage] = useState("");
  
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
  
  // Track existing registration for returning users
  const [existingRegistrationId, setExistingRegistrationId] = useState<string | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  // Track which email+event combination we loaded data for (security: prevents cross-user/cross-event data leakage)
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);
  // Ref to prevent duplicate fetch calls during React concurrent mode/strict mode re-renders
  const fetchingExistingRef = useRef<string | null>(null);
  
  // Skip verification if URL params provide identity (pre-qualified link)
  const skipVerification = Boolean(prePopulatedUnicityId && prePopulatedEmail);
  
  // Identity fields are locked after verification (but only if we have actual values)
  const isIdentityLocked = Boolean(verifiedProfile) || skipVerification;
  // Distributor ID is only locked if we actually have a value from Hydra or URL
  const isUnicityIdLocked = Boolean(verifiedProfile?.unicityId) || Boolean(prePopulatedUnicityId);

  const { data: event, isLoading } = useQuery<PublicEvent>({
    queryKey: ["/api/events", params.eventId, "public"],
  });

  // Fetch CMS page sections for this event (intro, thank_you, etc.)
  const { data: pageData, isLoading: isPageDataLoading, isError: isPageDataError, error: pageDataError } = useQuery<PageData & { event?: Event } | null>({
    queryKey: ["/api/public/event-pages", params.eventId],
    enabled: !!params.eventId,
    retry: 2, // Retry twice on failure before giving up
  });

  // Fetch LOGIN page CMS data for verification screens
  const { data: loginPageData } = useQuery<PageData | null>({
    queryKey: ["/api/public/event-pages", params.eventId, "login"],
    queryFn: async () => {
      const res = await fetch(`/api/public/event-pages/${params.eventId}?pageType=login`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.eventId,
    retry: 1,
  });

  // Extract login hero content from CMS
  const loginHeroSection = loginPageData?.sections?.find(s => s.type === "hero" && s.isEnabled);
  const loginHeroContent = loginHeroSection?.content as HeroSectionContent | undefined;

  // Log CMS fetch errors for debugging (silent to users, falls back to default content)
  if (isPageDataError && pageDataError) {
    const errorMessage = pageDataError instanceof Error ? pageDataError.message : String(pageDataError);
    console.error("Failed to fetch CMS page sections:", errorMessage);
  }

  // Find intro and thank_you sections from CMS (only when page data is loaded and no error)
  const cmsDataReady = !isPageDataLoading && !isPageDataError && pageData;
  const introSection = cmsDataReady ? pageData?.sections?.find(s => s.type === "intro" && s.isEnabled) : null;
  const thankYouSection = cmsDataReady ? pageData?.sections?.find(s => s.type === "thank_you" && s.isEnabled) : null;

  // Fetch REGISTRATION page CMS data for form content
  const { data: registrationPageData } = useQuery<PageData | null>({
    queryKey: ["/api/public/event-pages", params.eventId, "registration"],
    queryFn: async () => {
      const res = await fetch(`/api/public/event-pages/${params.eventId}?pageType=registration`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.eventId,
    retry: 1,
  });

  // Extract registration page CMS sections
  const registrationHeroSection = registrationPageData?.sections?.find(s => s.type === "hero" && s.isEnabled);
  const registrationHeroContent = registrationHeroSection?.content as HeroSectionContent | undefined;
  const formSection = registrationPageData?.sections?.find(s => s.type === "form" && s.isEnabled);
  const formSectionContent = formSection?.content as FormSectionContent | undefined;
  
  // Store event info for thank you page (preserves data after mutation/refetch)
  const [savedEventInfo, setSavedEventInfo] = useState<{ name: string; nameEs?: string; startDate?: string } | null>(null);

  // Custom form fields data (for events with custom form fields)
  const [customFormData, setCustomFormData] = useState<Record<string, any>>({});

  // Multi-attendee support for open_anonymous mode
  const [ticketCount, setTicketCount] = useState(1);
  const [additionalAttendees, setAdditionalAttendees] = useState<Array<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }>>([]);

  // Derive verification requirement from registrationMode (or legacy fields for backward compat)
  // - qualified_verified: requiresQualification=true, requiresVerification=true
  // - open_verified: requiresQualification=false, requiresVerification=true
  // - open_anonymous: requiresQualification=false, requiresVerification=false (not enabled)
  const getRequiresVerification = (): boolean => {
    const mode = event?.registrationMode;
    if (mode) {
      return mode !== "open_anonymous";
    }
    // Fallback to legacy fields for backward compatibility
    if (event?.requiresVerification !== undefined) {
      return event.requiresVerification;
    }
    // Default to true if not set
    return true;
  };
  const requiresVerification = getRequiresVerification() && !skipVerification;
  
  // Check if this is open_verified mode (form visible immediately, OTP gates submission)
  const isOpenVerifiedMode = (): boolean => {
    const mode = event?.registrationMode;
    if (mode === "open_verified") return true;
    // Legacy fallback: open_verified = requiresVerification && !requiresQualification
    if (!mode && event?.requiresVerification && !event?.requiresQualification) return true;
    return false;
  };
  const openVerifiedMode = isOpenVerifiedMode();

  // Check if this is open_anonymous mode (no verification, no email uniqueness, no edits after submission)
  const isOpenAnonymousMode = (): boolean => {
    const mode = event?.registrationMode;
    if (mode === "open_anonymous") return true;
    // Legacy fallback: open_anonymous = !requiresVerification && !requiresQualification
    if (!mode && event?.requiresVerification === false && event?.requiresQualification === false) return true;
    return false;
  };
  const openAnonymousMode = isOpenAnonymousMode();

  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchHeroImage = async () => {
      const imagePath = registrationHeroContent?.backgroundImage;
      
      if (imagePath) {
        // If it's already a full URL, use it directly
        if (imagePath.startsWith('http')) {
          setHeroImageUrl(imagePath);
          return;
        }
        // If it's already an API path, use it directly (append redirect param for signed URL)
        if (imagePath.startsWith('/api/objects')) {
          try {
            const res = await fetch(`${imagePath}?redirect=false`);
            if (res.ok) {
              const data = await res.json();
              setHeroImageUrl(data.url);
            }
          } catch (err) {
            console.error("Failed to fetch hero image:", err);
          }
          return;
        }
        // Otherwise construct the full path for object storage
        try {
          const res = await fetch(`/api/objects/public/${imagePath}?redirect=false`);
          if (res.ok) {
            const data = await res.json();
            setHeroImageUrl(data.url);
          }
        } catch (err) {
          console.error("Failed to fetch hero image:", err);
        }
      }
    };
    if (event) {
      fetchHeroImage();
    }
  }, [event, registrationHeroContent]);

  // Consume redirect token if present (from homepage OTP verification)
  useEffect(() => {
    const consumeToken = async () => {
      if (prePopulatedToken && prePopulatedEmail && !tokenConsumed && !isConsumingToken) {
        setIsConsumingToken(true);
        try {
          const res = await apiRequest("POST", "/api/register/otp/session/consume", {
            token: prePopulatedToken,
            email: prePopulatedEmail,
            eventId: params.eventId,
          });
          const data = await res.json();
          
          if (data.success && data.verified) {
            setVerifiedProfile(data.profile);
            setVerifiedByHydra(data.verifiedByHydra || false);
            setTokenConsumed(true);
            setVerificationStep("form");
            
            // Pre-populate form with verified data
            if (data.profile.unicityId) form.setValue("unicityId", data.profile.unicityId);
            if (data.profile.email) form.setValue("email", data.profile.email);
            if (data.profile.firstName) form.setValue("firstName", data.profile.firstName);
            if (data.profile.lastName) form.setValue("lastName", data.profile.lastName);
            if (data.profile.phone) form.setValue("phone", data.profile.phone);
          }
        } catch (error: any) {
          console.error("Failed to consume token:", error);
          // Token invalid/expired - show normal verification flow
          setVerificationEmail(prePopulatedEmail);
        } finally {
          setIsConsumingToken(false);
        }
      }
    };
    
    consumeToken();
  }, [prePopulatedToken, prePopulatedEmail, params.eventId, tokenConsumed, isConsumingToken]);

  // Skip to form if pre-populated, verification not required, open_verified, or open_anonymous mode
  // For open_verified: form is visible immediately, OTP verification gates submission
  // For open_anonymous: form is visible immediately, NO verification at all
  useEffect(() => {
    if (skipVerification || (event && !requiresVerification) || openVerifiedMode || openAnonymousMode) {
      setVerificationStep("form");
    }
  }, [skipVerification, event, requiresVerification, openVerifiedMode, openAnonymousMode]);

  // Check for existing verified session on page load (for refresh persistence)
  // Also checks attendee token from /my-events authentication
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  useEffect(() => {
    const checkExistingSession = async () => {
      // Skip if already verified, consuming token, or no event
      if (verificationStep !== "email" || isConsumingToken || tokenConsumed || skipVerification || !params.eventId) {
        return;
      }
      
      // First check for attendee token from /my-events page (localStorage)
      const attendeeToken = localStorage.getItem("attendeeAuthToken");
      const attendeeEmail = localStorage.getItem("attendeeEmail");
      
      if (attendeeToken && attendeeEmail) {
        setIsCheckingSession(true);
        try {
          // Validate the attendee session is still valid
          const res = await fetch("/api/attendee/events", {
            headers: { Authorization: `Bearer ${attendeeToken}` },
          });
          
          if (res.ok) {
            // Attendee session is valid - fetch qualifier data to get name
            let firstName = "";
            let lastName = "";
            let unicityId = "";
            
            try {
              const qualifierRes = await fetch(`/api/public/qualifier-info/${params.eventId}?email=${encodeURIComponent(attendeeEmail)}`);
              if (qualifierRes.ok) {
                const qualifierData = await qualifierRes.json();
                firstName = qualifierData.firstName || "";
                lastName = qualifierData.lastName || "";
                unicityId = qualifierData.unicityId || "";
              }
            } catch (e) {
              console.error("Failed to fetch qualifier info:", e);
            }
            
            // Skip verification and populate form with qualifier data
            setVerificationEmail(attendeeEmail);
            setVerifiedProfile({
              unicityId,
              email: attendeeEmail,
              firstName,
              lastName,
              phone: "",
            });
            // Set the form values
            form.setValue("email", attendeeEmail);
            if (firstName) form.setValue("firstName", firstName);
            if (lastName) form.setValue("lastName", lastName);
            if (unicityId) form.setValue("unicityId", unicityId);
            setVerificationStep("form");
            setIsCheckingSession(false);
            return;
          }
        } catch (error) {
          console.error("Failed to validate attendee session:", error);
        }
        setIsCheckingSession(false);
      }
      
      // Check sessionStorage for a previously verified email (fallback)
      const storedEmail = sessionStorage.getItem(`reg_verified_email_${params.eventId}`);
      if (!storedEmail) {
        return;
      }

      setIsCheckingSession(true);
      try {
        // Validate the session is still valid with the server
        const res = await fetch(`/api/register/session-status?email=${encodeURIComponent(storedEmail)}&eventId=${encodeURIComponent(params.eventId)}`);
        const data = await res.json();
        
        if (data.verified && data.email) {
          // Session is still valid - restore verified state
          setVerificationEmail(data.email);
          setVerifiedProfile({
            unicityId: "",
            email: data.email,
            firstName: "",
            lastName: "",
            phone: "",
          });
          setVerificationStep("form");
        } else {
          // Session expired - clear stored email
          sessionStorage.removeItem(`reg_verified_email_${params.eventId}`);
        }
      } catch (error) {
        console.error("Failed to check session status:", error);
        sessionStorage.removeItem(`reg_verified_email_${params.eventId}`);
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, [params.eventId, verificationStep, isConsumingToken, tokenConsumed, skipVerification]);

  // Reset existing registration state when verification email or event changes (security: prevents cross-user/cross-event data leakage)
  useEffect(() => {
    const currentEmail = verifiedProfile?.email || verificationEmail || prePopulatedEmail;
    const currentKey = currentEmail && params.eventId ? `${currentEmail.toLowerCase()}:${params.eventId}` : null;
    
    if (loadedForKey && currentKey && loadedForKey !== currentKey) {
      setExistingRegistrationId(null);
      setCustomFormData({});
      setLoadedForKey(null);
    }
  }, [verifiedProfile?.email, verificationEmail, prePopulatedEmail, params.eventId, loadedForKey]);

  const handleSendOtp = async () => {
    if (!verificationEmail || !verificationEmail.includes("@")) {
      toast({
        title: language === "es" ? "Correo inv\u00e1lido" : "Invalid Email",
        description: language === "es" ? "Por favor ingrese un correo electr\u00f3nico v\u00e1lido" : "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/generate", { 
        email: verificationEmail,
        eventId: params.eventId,
      });
      const data = await res.json();
      
      setVerificationStep("otp");
      toast({
        title: language === "es" ? "C\u00f3digo enviado" : "Code Sent",
        description: language === "es" ? `C\u00f3digo enviado a ${verificationEmail}` : `Verification code sent to ${verificationEmail}`,
      });
      
      // Show dev code in development
      if (data.devCode) {
        console.log("DEV MODE: Use code", data.devCode);
      }
    } catch (error: any) {
      // Parse error message - may contain JSON like "403: {"error":"..."}"
      let errorMessage = language === "es" 
        ? "No se pudo enviar el código de verificación"
        : "Unable to send verification code";
      if (error.message) {
        let msg = error.message.replace(/^\d{3}:\s*/, "");
        const jsonMatch = msg.match(/\{.*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || errorMessage;
          } catch {
            // Keep default message
          }
        } else if (!msg.includes("fetch") && !msg.includes("{")) {
          errorMessage = msg;
        }
      }
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      toast({
        title: language === "es" ? "C\u00f3digo inv\u00e1lido" : "Invalid Code",
        description: language === "es" ? "Por favor ingrese el c\u00f3digo de 6 d\u00edgitos" : "Please enter the 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/validate", {
        email: verificationEmail,
        code: otpCode,
        eventId: params.eventId,
      });
      const data = await res.json();
      
      if (data.verified) {
        setVerifiedProfile(data.profile);
        setVerifiedByHydra(data.verifiedByHydra || false);
        setIsQualified(data.isQualified);
        setQualificationMessage(data.qualificationMessage || "");
        
        // Pre-populate form with verified data
        form.setValue("unicityId", data.profile.unicityId);
        form.setValue("email", data.profile.email);
        form.setValue("firstName", data.profile.firstName);
        form.setValue("lastName", data.profile.lastName);
        if (data.profile.phone) {
          form.setValue("phone", data.profile.phone);
        }
        
        setVerificationStep("form");
        
        // Store verified email in sessionStorage for page refresh persistence
        if (params.eventId) {
          sessionStorage.setItem(`reg_verified_email_${params.eventId}`, data.profile.email);
        }
        
        toast({
          title: language === "es" ? "Verificado" : "Verified",
          description: language === "es" ? "Su identidad ha sido verificada" : "Your identity has been verified",
        });
      }
    } catch (error: any) {
      toast({
        title: language === "es" ? "C\u00f3digo inv\u00e1lido" : "Invalid Code",
        description: error.message || "Please check your code and try again",
        variant: "destructive",
      });
      setOtpCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  // Create dynamic schema based on event's form fields
  const registrationSchema = useMemo(() => {
    return createRegistrationSchema(event?.formFields as any[] | undefined);
  }, [event?.formFields]);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: {
      unicityId: prePopulatedUnicityId,
      email: prePopulatedEmail,
      firstName: prePopulatedFirstName,
      lastName: prePopulatedLastName,
      phone: prePopulatedPhone,
      gender: undefined,
      dateOfBirth: "",
      passportNumber: "",
      passportCountry: "",
      passportExpiration: "",
      emergencyContact: "",
      emergencyContactPhone: "",
      shirtSize: "",
      pantSize: "",
      dietaryRestrictions: [],
      adaAccommodations: false,
      roomType: "",
      termsAccepted: false,
    },
  });

  // Helper to populate form with registration data
  const populateFormWithRegistration = (reg: any) => {
    setExistingRegistrationId(reg.id);
    
    if (reg.unicityId) form.setValue("unicityId", reg.unicityId);
    if (reg.email) form.setValue("email", reg.email);
    if (reg.firstName) form.setValue("firstName", reg.firstName);
    if (reg.lastName) form.setValue("lastName", reg.lastName);
    if (reg.phone) form.setValue("phone", reg.phone);
    if (reg.gender) form.setValue("gender", reg.gender);
    if (reg.dateOfBirth) {
      const date = new Date(reg.dateOfBirth);
      form.setValue("dateOfBirth", date.toISOString().split('T')[0]);
    }
    if (reg.passportNumber) form.setValue("passportNumber", reg.passportNumber);
    if (reg.passportCountry) form.setValue("passportCountry", reg.passportCountry);
    if (reg.passportExpiration) {
      const date = new Date(reg.passportExpiration);
      form.setValue("passportExpiration", date.toISOString().split('T')[0]);
    }
    if (reg.emergencyContact) form.setValue("emergencyContact", reg.emergencyContact);
    if (reg.emergencyContactPhone) form.setValue("emergencyContactPhone", reg.emergencyContactPhone);
    if (reg.shirtSize) form.setValue("shirtSize", reg.shirtSize);
    if (reg.pantSize) form.setValue("pantSize", reg.pantSize);
    if (reg.dietaryRestrictions && Array.isArray(reg.dietaryRestrictions)) {
      form.setValue("dietaryRestrictions", reg.dietaryRestrictions);
    }
    if (reg.adaAccommodations !== undefined) form.setValue("adaAccommodations", reg.adaAccommodations);
    if (reg.roomType) form.setValue("roomType", reg.roomType);
    if (reg.termsAccepted) form.setValue("termsAccepted", reg.termsAccepted);
    
    if (reg.formData && typeof reg.formData === 'object') {
      setCustomFormData(reg.formData as Record<string, any>);
    }
    
    toast({
      title: language === "es" ? "Datos cargados" : "Data Loaded",
      description: language === "es" 
        ? "Su registro anterior ha sido cargado. Puede actualizarlo si lo desea." 
        : "Your previous registration has been loaded. You can update it if needed.",
    });
  };

  // Helper to reset to email verification when session expires
  const resetToEmailVerification = (showExpiredMessage = true) => {
    setVerificationStep("email");
    setVerifiedProfile(null);
    setVerificationEmail("");
    setOtpCode("");
    setExistingRegistrationId(null);
    setCustomFormData({});
    setLoadedForKey(null);
    fetchingExistingRef.current = null;
    
    if (showExpiredMessage) {
      toast({
        title: language === "es" ? "Sesión expirada" : "Session Expired",
        description: language === "es" 
          ? "Por favor verifique su email nuevamente." 
          : "Please verify your email again.",
        variant: "destructive",
      });
    }
  };

  // Fetch existing registration when verification completes or when returning with attendee token
  useEffect(() => {
    const fetchExistingRegistration = async () => {
      if (!params.eventId || !event) return;
      
      // Create a key combining event + source to track what we've loaded
      const attendeeToken = localStorage.getItem("attendeeAuthToken");
      const attendeeEmail = localStorage.getItem("attendeeEmail");
      const email = verifiedProfile?.email || verificationEmail || prePopulatedEmail || attendeeEmail;
      
      if (!email) return;
      
      const currentKey = `${email.toLowerCase()}:${params.eventId}`;
      
      // Don't re-fetch if already fetching or already loaded for this key
      if (fetchingExistingRef.current === currentKey || loadedForKey === currentKey) return;
      
      // Strategy 1: Use attendee token (for returning users)
      if (attendeeToken && attendeeEmail) {
        fetchingExistingRef.current = currentKey;
        setIsLoadingExisting(true);
        
        try {
          const res = await fetch(`/api/attendee/registration/${params.eventId}`, {
            headers: { Authorization: `Bearer ${attendeeToken}` },
          });
          
          if (res.ok) {
            const data = await res.json();
            setLoadedForKey(currentKey);
            
            // If we're on email step but have valid token, skip to form
            if (verificationStep === "email") {
              setVerificationEmail(attendeeEmail);
              setVerificationStep("form");
            }
            
            if (data.success && data.exists && data.registration) {
              populateFormWithRegistration(data.registration);
            }
            setIsLoadingExisting(false);
            return;
          } else if (res.status === 401 || res.status === 403) {
            // Token expired - clear it and redirect to email verification
            localStorage.removeItem("attendeeAuthToken");
            localStorage.removeItem("attendeeEmail");
            fetchingExistingRef.current = null;
            setIsLoadingExisting(false);
            resetToEmailVerification(true);
            return;
          }
        } catch (error) {
          console.error("Failed to fetch with attendee token:", error);
        }
        
        setIsLoadingExisting(false);
        fetchingExistingRef.current = null;
      }
      
      // Strategy 2: Use OTP session (for users who just verified)
      if (verificationStep === "form") {
        fetchingExistingRef.current = currentKey;
        setIsLoadingExisting(true);
        
        try {
          const res = await fetch("/api/register/existing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, eventId: params.eventId }),
          });
          
          if (res.ok) {
            const data = await res.json();
            setLoadedForKey(currentKey);
            
            if (data.success && data.exists && data.registration) {
              populateFormWithRegistration(data.registration);
            }
          } else if (res.status === 403) {
            // OTP session expired - redirect to email verification
            fetchingExistingRef.current = null;
            setLoadedForKey(currentKey); // Prevent retry
            resetToEmailVerification(true);
            setIsLoadingExisting(false);
            return;
          } else {
            // Other error - mark as loaded to prevent retry
            setLoadedForKey(currentKey);
          }
        } catch (error) {
          console.error("Failed to fetch existing registration:", error);
          setLoadedForKey(currentKey);
        }
        
        setIsLoadingExisting(false);
      }
    };
    
    fetchExistingRegistration();
  }, [verificationStep, verifiedProfile, verificationEmail, prePopulatedEmail, params.eventId, event, loadedForKey]);

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      // Build primary attendee payload
      const primaryAttendee = {
        ...data,
        language,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : null,
        passportExpiration: data.passportExpiration ? new Date(data.passportExpiration).toISOString() : null,
        formData: Object.keys(customFormData).length > 0 ? customFormData : undefined,
        verifiedByHydra,
      };
      
      // For multi-attendee open_anonymous mode, build attendees array
      const isMultiAttendee = openAnonymousMode && ticketCount > 1 && additionalAttendees.length > 0;
      
      let payload: any;
      if (isMultiAttendee) {
        // Build attendees array with primary + additional attendees
        const attendees = [
          primaryAttendee,
          ...additionalAttendees.map(att => ({
            email: att.email,
            firstName: att.firstName,
            lastName: att.lastName,
            phone: att.phone || null,
            language,
            termsAccepted: true, // Inherit from primary
          }))
        ];
        payload = {
          email: data.email, // Primary contact email (required by API)
          attendees,
        };
      } else {
        payload = {
          ...primaryAttendee,
          existingRegistrationId,
        };
      }
      
      // For PUT updates, include attendee token in Authorization header
      if (existingRegistrationId) {
        const attendeeToken = localStorage.getItem("attendeeAuthToken");
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        if (attendeeToken) {
          headers["Authorization"] = `Bearer ${attendeeToken}`;
        }
        const res = await fetch(`/api/events/${params.eventId}/register/${existingRegistrationId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            throw new Error(json.error || json.message || `${res.status}: ${text}`);
          } catch {
            throw new Error(`${res.status}: ${text}`);
          }
        }
        return res;
      }
      // POST endpoint now uses UPSERT pattern - never returns duplicate error
      return apiRequest("POST", `/api/events/${params.eventId}/register`, payload);
    },
    onSuccess: async (response) => {
      setIsSuccess(true);
      // Check if the response indicates an update vs create
      let wasUpdated = existingRegistrationId ? true : false;
      let registrationCount = 1;
      try {
        const result = await response.json();
        if (result.wasUpdated) wasUpdated = true;
        if (result.ticketCount) registrationCount = result.ticketCount;
      } catch {
        // Ignore JSON parse errors
      }
      let successMessage: string;
      if (wasUpdated) {
        successMessage = language === "es" ? "Registro actualizado exitosamente" : "Registration updated successfully";
      } else if (registrationCount > 1) {
        successMessage = language === "es" 
          ? `${registrationCount} registros creados exitosamente` 
          : `${registrationCount} registrations created successfully`;
      } else {
        successMessage = t("registrationSuccess");
      }
      toast({ title: t("success"), description: successMessage });
    },
    onError: (error: any, variables: RegistrationFormData) => {
      // Check if this is a VERIFICATION_REQUIRED error (open_verified mode safety net)
      // Handle both structured error object and error message string
      const errorMsg = error.message || "";
      const errorCode = error.code || "";
      const isVerificationRequired = 
        errorCode === "VERIFICATION_REQUIRED" ||
        errorMsg.includes("VERIFICATION_REQUIRED") || 
        errorMsg.includes("Email verification required");
      
      if (isVerificationRequired) {
        // Store the form data and trigger OTP flow - suppress default toast
        setPendingSubmissionData(variables);
        setVerificationEmail(variables.email);
        setShowOtpDialog(true);
        handleOpenVerifiedSendOtp(variables.email);
        return; // Don't show error toast, we're handling it with OTP flow
      }
      
      // Make error message more user-friendly
      let userMessage = error.message || "";
      // Remove HTTP status codes from message
      userMessage = userMessage.replace(/^\d{3}:\s*/, "");
      // Parse JSON error if present
      try {
        const jsonMatch = userMessage.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          userMessage = parsed.error || userMessage;
        }
      } catch {}
      // Fallback message
      if (!userMessage || userMessage.includes("{") || userMessage.includes("fetch")) {
        userMessage = language === "es" 
          ? "No se pudo completar el registro. Por favor intente de nuevo."
          : "Unable to complete registration. Please try again.";
      }
      toast({
        title: t("error"),
        description: userMessage,
        variant: "destructive",
      });
    },
  });

  // Send OTP for open_verified mode (form submission gated by verification)
  const handleOpenVerifiedSendOtp = async (email: string) => {
    if (!email || !email.includes("@")) {
      toast({
        title: language === "es" ? "Correo inválido" : "Invalid Email",
        description: language === "es" ? "Por favor ingrese un correo electrónico válido" : "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/generate", { 
        email,
        eventId: params.eventId,
      });
      const data = await res.json();
      
      toast({
        title: language === "es" ? "Código enviado" : "Code Sent",
        description: language === "es" ? `Código enviado a ${email}` : `Verification code sent to ${email}`,
      });
      
      if (data.devCode) {
        console.log("DEV MODE: Use code", data.devCode);
      }
    } catch (error: any) {
      let errorMessage = language === "es" 
        ? "No se pudo enviar el código de verificación"
        : "Unable to send verification code";
      if (error.message) {
        let msg = error.message.replace(/^\d{3}:\s*/, "");
        const jsonMatch = msg.match(/\{.*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || errorMessage;
          } catch {
            // Keep default message
          }
        } else if (!msg.includes("fetch") && !msg.includes("{")) {
          errorMessage = msg;
        }
      }
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Verify OTP for open_verified mode and complete registration
  const handleOpenVerifiedVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      toast({
        title: language === "es" ? "Código inválido" : "Invalid Code",
        description: language === "es" ? "Por favor ingrese el código de 6 dígitos" : "Please enter the 6-digit code",
        variant: "destructive",
      });
      return;
    }

    if (!pendingSubmissionData) {
      toast({
        title: t("error"),
        description: "No pending registration data. Please try again.",
        variant: "destructive",
      });
      setShowOtpDialog(false);
      return;
    }

    setIsVerifying(true);
    try {
      const email = pendingSubmissionData.email;
      const res = await apiRequest("POST", "/api/register/otp/validate", {
        email,
        code: otpCode,
        eventId: params.eventId,
      });
      const data = await res.json();
      
      if (data.verified) {
        setIsEmailVerified(true);
        setVerifiedByHydra(data.verifiedByHydra || false);
        setShowOtpDialog(false);
        setOtpCode("");
        
        // Store verified email in sessionStorage for page refresh persistence
        if (params.eventId) {
          sessionStorage.setItem(`reg_verified_email_${params.eventId}`, email);
        }
        
        toast({
          title: language === "es" ? "Verificado" : "Verified",
          description: language === "es" ? "Su correo ha sido verificado" : "Your email has been verified",
        });
        
        // Now complete the registration
        if (event) {
          setSavedEventInfo({
            name: event.name,
            nameEs: event.nameEs,
            startDate: event.startDate,
          });
        }
        registerMutation.mutate(pendingSubmissionData);
      }
    } catch (error: any) {
      toast({
        title: language === "es" ? "Código inválido" : "Invalid Code",
        description: error.message || "Please check your code and try again",
        variant: "destructive",
      });
      setOtpCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const onSubmit = (data: RegistrationFormData) => {
    // Validate required custom fields before submission (only fields shown in Additional Information)
    const customFields = getCustomOnlyFields(event?.formFields as any[]);
    if (customFields.length > 0) {
      const missingFields: string[] = [];
      
      for (const field of customFields) {
        const fieldKey = field.name || (field as any).id;
        const conditionalOn = (field as any).conditionalOn;
        
        // Check if this field is conditionally required
        let isRequired = field.required;
        if (conditionalOn) {
          const parentValue = customFormData[conditionalOn.field];
          // Field is only shown (and required) when parent matches the condition
          if (parentValue === conditionalOn.value) {
            isRequired = true; // Conditional fields are required when visible
          } else {
            continue; // Skip validation if field is hidden
          }
        }
        
        if (isRequired) {
          const value = customFormData[fieldKey];
          const isEmpty = value === undefined || value === null || value === "" || 
            (field.type === "checkbox" && value !== true);
          
          if (isEmpty) {
            const fieldLabel = language === "es" && field.labelEs ? field.labelEs : field.label;
            missingFields.push(fieldLabel);
          }
        }
      }
      
      if (missingFields.length > 0) {
        toast({
          title: language === "es" ? "Campos requeridos" : "Required Fields",
          description: language === "es" 
            ? `Por favor complete: ${missingFields.join(", ")}`
            : `Please complete: ${missingFields.join(", ")}`,
          variant: "destructive",
        });
        return;
      }
    }
    
    // Validate additional attendees for multi-attendee anonymous mode
    if (openAnonymousMode && ticketCount > 1 && additionalAttendees.length > 0) {
      const invalidAttendees: string[] = [];
      additionalAttendees.forEach((att, idx) => {
        if (!att.firstName?.trim() || !att.lastName?.trim() || !att.email?.trim()) {
          invalidAttendees.push(`${language === "es" ? "Asistente" : "Attendee"} ${idx + 2}`);
        }
      });
      if (invalidAttendees.length > 0) {
        toast({
          title: language === "es" ? "Informacion incompleta" : "Incomplete Information",
          description: language === "es"
            ? `Por favor complete todos los campos requeridos para: ${invalidAttendees.join(", ")}`
            : `Please complete all required fields for: ${invalidAttendees.join(", ")}`,
          variant: "destructive",
        });
        return;
      }
    }
    
    // For open_verified mode: check if email is verified before submitting
    // If not verified, trigger OTP flow instead of calling mutation
    // Note: open_anonymous mode skips ALL verification - goes straight to submission
    if (openVerifiedMode && !openAnonymousMode && !isEmailVerified && !skipVerification && !verifiedProfile) {
      // Store the form data and trigger OTP verification
      setPendingSubmissionData(data);
      setVerificationEmail(data.email);
      setShowOtpDialog(true);
      handleOpenVerifiedSendOtp(data.email);
      // Explicitly prevent mutation from firing
      return;
    }
    
    // Helper to actually submit registration - only called when verified
    const submitRegistration = (formData: RegistrationFormData) => {
      // Save event info before mutation (preserves data for thank you page)
      if (event) {
        setSavedEventInfo({
          name: event.name,
          nameEs: event.nameEs,
          startDate: event.startDate,
        });
      }
      registerMutation.mutate(formData);
    };
    
    submitRegistration(data);
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

  const getCustomHeading = () => {
    if (registrationHeroContent) {
      if (language === "es" && registrationHeroContent.headlineEs) {
        return registrationHeroContent.headlineEs;
      }
      return registrationHeroContent.headline || null;
    }
    return null;
  };

  const getCustomSubheading = () => {
    if (registrationHeroContent) {
      if (language === "es" && registrationHeroContent.subheadlineEs) {
        return registrationHeroContent.subheadlineEs;
      }
      return registrationHeroContent.subheadline || null;
    }
    return null;
  };

  const getCtaLabel = () => {
    // Show "Update Registration" when editing an existing registration
    if (existingRegistrationId) {
      return language === "es" ? "Actualizar Registro" : "Update Registration";
    }
    if (formSectionContent) {
      if (language === "es" && formSectionContent.submitButtonLabelEs) {
        return formSectionContent.submitButtonLabelEs;
      }
      return formSectionContent.submitButtonLabel || t("register");
    }
    return t("register");
  };

  const layout = event?.registrationLayout || "standard";

  const getDietaryLabel = (option: typeof dietaryOptions[0]) => {
    return language === "es" ? option.labelEs : option.label;
  };

  const getRoomLabel = (option: typeof roomTypes[0]) => {
    return language === "es" ? option.labelEs : option.label;
  };

  const toggleDietaryRestriction = (value: string) => {
    const current = form.getValues("dietaryRestrictions") || [];
    if (value === "none") {
      form.setValue("dietaryRestrictions", current.includes("none") ? [] : ["none"]);
    } else {
      const withoutNone = current.filter(v => v !== "none");
      if (current.includes(value)) {
        form.setValue("dietaryRestrictions", withoutNone.filter(v => v !== value));
      } else {
        form.setValue("dietaryRestrictions", [...withoutNone, value]);
      }
    }
  };

  // Logout handler - clears attendee auth and resets to verification step
  const handleLogout = () => {
    localStorage.removeItem("attendeeAuthToken");
    setVerifiedProfile(null);
    setVerificationStep("email");
    setVerificationEmail("");
    setOtpCode("");
  };

  // Define renderHeader early so it can be used in success sections
  const renderHeader = () => (
    <header className="bg-card border-b border sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <img 
          src={theme === "dark" ? unicityLogoWhite : unicityLogoDark} 
          alt="Unicity" 
          className="h-6 w-auto"
          data-testid="img-header-logo"
        />
        <div className="flex items-center gap-2">
          {verifiedProfile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-muted-foreground"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
          <ThemeToggle />
          <div className="flex items-center gap-1 text-sm font-medium">
            <button
              onClick={() => setLanguage("en")}
              className={language === "en" ? "text-foreground font-semibold" : "text-muted-foreground/60 hover:text-muted-foreground"}
              data-testid="button-language-en"
            >
              EN
            </button>
            <span className="text-muted-foreground/40">/</span>
            <button
              onClick={() => setLanguage("es")}
              className={language === "es" ? "text-foreground font-semibold" : "text-muted-foreground/60 hover:text-muted-foreground"}
              data-testid="button-language-es"
            >
              ES
            </button>
          </div>
        </div>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center justify-end gap-2 p-4">
          <ThemeToggle />
          <LanguageToggle />
        </header>
        <div className="max-w-2xl mx-auto p-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(10)].map((_, i) => (
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
    return <EventListPage showNotFoundMessage={true} notFoundSlug={params.eventId} />;
  }

  if (isSuccess) {
    // Use saved event info for thank you page (or fallback to event)
    const eventName = language === "es" && savedEventInfo?.nameEs 
      ? savedEventInfo.nameEs 
      : (savedEventInfo?.name || event?.name || "Event");
    const eventDate = savedEventInfo?.startDate || event?.startDate;
    const formattedDate = eventDate ? parseLocalDate(eventDate) : null;
    
    // Use CMS thank_you section if available
    if (thankYouSection) {
      const content = thankYouSection.content as ThankYouSectionContent;
      return (
        <div className="min-h-screen bg-background">
          {renderHeader()}
          <ThankYouSection content={content} />
          <div className="max-w-md mx-auto p-6 text-center">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">{eventName}</p>
              {formattedDate && (
                <p>{format(formattedDate, "MMMM d, yyyy")}</p>
              )}
            </div>
          </div>
        </div>
      );
    }
    
    // Default thank you page
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center justify-end gap-2 p-4">
          <ThemeToggle />
          <LanguageToggle />
        </header>
        <div className="flex items-center justify-center min-h-[80vh] p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-foreground">{t("registrationSuccess")}</h2>
              <p className="text-muted-foreground mb-4">
                {language === "es"
                  ? "Su registro ha sido completado. Recibira un correo de confirmacion pronto."
                  : "Your registration has been completed. You will receive a confirmation email shortly."}
              </p>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium">{eventName}</p>
                {formattedDate && (
                  <p>{format(formattedDate, "MMMM d, yyyy")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const renderEventInfo = (forHero = false) => (
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
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          {event.location}
        </span>
      )}
    </div>
  );

  // Verification step UI
  const renderVerificationStep = () => {
    if (verificationStep === "email") {
      return (
        <Card>
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
              {language === "es" 
                ? (loginHeroContent?.subheadlineEs || "Ingrese su correo electronico para recibir un codigo de verificacion")
                : (loginHeroContent?.subheadline || "Enter your email to receive a verification code")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder={language === "es" ? "correo@ejemplo.com" : "email@example.com"}
                value={verificationEmail}
                onChange={(e) => setVerificationEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                data-testid="input-verification-email"
              />
            </div>
            <Button 
              onClick={handleSendOtp} 
              disabled={isVerifying || !verificationEmail}
              className="w-full"
              data-testid="button-send-code"
            >
              {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === "es" ? "Enviar codigo" : "Send Code"}
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (verificationStep === "otp") {
      return (
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
              }}
              className="w-full"
              data-testid="button-back-to-email"
            >
              {language === "es" ? "Usar otro correo" : "Use a different email"}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  // Not qualified message
  const renderNotQualifiedMessage = () => (
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
      <CardContent className="text-center text-muted-foreground text-sm">
        {language === "es" 
          ? <>Si cree que esto es un error, <a href="mailto:americasevent@unicity.com" className="text-primary underline hover:no-underline">contacte al soporte</a>.</>
          : <>If you believe this is an error, please <a href="mailto:americasevent@unicity.com" className="text-primary underline hover:no-underline">contact support</a>.</>}
      </CardContent>
    </Card>
  );

  // Main content renderer - decides what to show based on verification state
  const renderMainContent = () => {
    // If verification required and not yet completed, show verification step
    if (requiresVerification && verificationStep !== "form") {
      return renderVerificationStep();
    }
    
    // If verified but not qualified, show not qualified message
    if (verifiedProfile && !isQualified) {
      return renderNotQualifiedMessage();
    }
    
    // Otherwise show the registration form
    return renderFormCard();
  };

  const renderFormCard = () => (
    <Card>
      <CardHeader>
        <CardTitle>{getCtaLabel()}</CardTitle>
        <CardDescription>
          {language === "es"
            ? "Complete el formulario a continuacion para registrarse en el evento"
            : "Fill out the form below to register for the event"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Anonymous mode warning - no edits after submission */}
        {openAnonymousMode && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm mb-4" data-testid="text-anonymous-warning">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              {language === "es" 
                ? "Importante: La informacion no puede ser editada despues de enviar. Por favor revise cuidadosamente antes de enviar."
                : "Important: Information cannot be edited after submission. Please review carefully before submitting."}
            </span>
          </div>
        )}
        
        {/* Multi-attendee ticket count selector for open_anonymous mode */}
        {openAnonymousMode && (
          <div className="mb-6 p-4 border rounded-md bg-muted/30">
            <label className="block text-sm font-medium mb-2">
              {language === "es" ? "Numero de registros" : "Number of Registrations"}
            </label>
            <div className="flex items-center gap-4">
              <Select 
                value={String(ticketCount)} 
                onValueChange={(val) => {
                  const newCount = parseInt(val, 10);
                  setTicketCount(newCount);
                  // Adjust additional attendees array
                  if (newCount > 1) {
                    const newAttendees = Array.from({ length: newCount - 1 }, (_, i) => 
                      additionalAttendees[i] || { firstName: "", lastName: "", email: "", phone: "" }
                    );
                    setAdditionalAttendees(newAttendees);
                  } else {
                    setAdditionalAttendees([]);
                  }
                }}
              >
                <SelectTrigger className="w-24" data-testid="select-ticket-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                {language === "es" 
                  ? "Seleccione cuantas personas desea registrar"
                  : "Select how many people you want to register"}
              </span>
            </div>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium border-b pb-2">
                {language === "es" ? "Informacion Personal" : "Personal Information"}
              </h3>
              
              {/* Verified identity indicator */}
              {verifiedProfile && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-700 dark:text-green-400 text-sm mb-4">
                  <ShieldCheck className="w-4 h-4" />
                  {language === "es" ? "Identidad verificada" : "Identity verified"}
                </div>
              )}

              <FormField
                control={form.control}
                name="unicityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "es" ? "ID de Distribuidor" : "Distributor ID"} *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder={language === "es" ? "Su ID de distribuidor" : "Your distributor ID"} 
                        data-testid="input-unicity-id"
                        disabled={isUnicityIdLocked}
                        className={isUnicityIdLocked ? "bg-muted" : ""}
                      />
                    </FormControl>
                    <FormDescription>
                      {isUnicityIdLocked 
                        ? (language === "es" 
                            ? "Este campo ha sido verificado y no puede ser editado" 
                            : "This field has been verified and cannot be edited")
                        : (language === "es"
                            ? "Ingrese su ID de distribuidor de Unicity"
                            : "Enter your Unicity distributor ID")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("email")} *</FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        {...field} 
                        data-testid="input-reg-email"
                        disabled={isIdentityLocked}
                        className={isIdentityLocked ? "bg-muted" : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("firstName")} *
                        {hasTemplateField(event?.formFields as any[], 'passportNumber') && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({language === "es" ? "como en pasaporte" : "as shown on passport"})
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          data-testid="input-first-name"
                        />
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
                      <FormLabel>
                        {t("lastName")} *
                        {hasTemplateField(event?.formFields as any[], 'passportNumber') && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({language === "es" ? "como en pasaporte" : "as shown on passport"})
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          data-testid="input-last-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Phone - only if in template */}
              {hasTemplateField(event?.formFields as any[], 'phone') && (
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "es" ? "Numero de Celular" : "Mobile Number"}</FormLabel>
                      <FormControl>
                        <PhoneInput
                          international
                          defaultCountry="US"
                          value={field.value}
                          onChange={field.onChange}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                          data-testid="input-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Gender & DOB - only if in template */}
              {(hasTemplateField(event?.formFields as any[], 'gender') || hasTemplateField(event?.formFields as any[], 'dateOfBirth')) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {hasTemplateField(event?.formFields as any[], 'gender') && (
                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{language === "es" ? "Genero" : "Gender"} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-gender">
                                <SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="female">{language === "es" ? "Femenino" : "Female"}</SelectItem>
                              <SelectItem value="male">{language === "es" ? "Masculino" : "Male"}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {hasTemplateField(event?.formFields as any[], 'dateOfBirth') && (
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{language === "es" ? "Fecha de Nacimiento" : "Date of Birth"} *</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field} 
                              max={new Date().toISOString().split('T')[0]}
                              data-testid="input-dob" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Passport Information Section - only if passport fields in template */}
            {hasTemplateField(event?.formFields as any[], 'passportNumber') && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">
                  {language === "es" ? "Informacion del Pasaporte" : "Passport Information"}
                </h3>

                <FormField
                  control={form.control}
                  name="passportNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "es" ? "Numero de Pasaporte" : "Passport Number"} *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-passport-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="passportCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{language === "es" ? "Pais del Pasaporte" : "Passport Country"} *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={language === "es" ? "Ej: Estados Unidos" : "E.g., United States"} data-testid="input-passport-country" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="passportExpiration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{language === "es" ? "Fecha de Vencimiento" : "Passport Expiration"} *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            min={new Date().toISOString().split('T')[0]}
                            data-testid="input-passport-expiration" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Emergency Contact Section - only if emergency contact fields in template */}
            {hasTemplateField(event?.formFields as any[], 'emergencyContact') && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">
                  {language === "es" ? "Contacto de Emergencia" : "Emergency Contact"}
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="emergencyContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{language === "es" ? "Nombre del Contacto" : "Contact Name"} *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-emergency-contact" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyContactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{language === "es" ? "Telefono del Contacto" : "Contact Phone"} *</FormLabel>
                        <FormControl>
                          <PhoneInput
                            international
                            defaultCountry="US"
                            value={field.value}
                            onChange={field.onChange}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                            data-testid="input-emergency-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Apparel Section - only if apparel fields in template */}
            {(hasTemplateField(event?.formFields as any[], 'shirtSize') || hasTemplateField(event?.formFields as any[], 'pantSize')) && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">
                  {language === "es" ? "Tallas de Ropa" : "Apparel Sizes"}
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  {hasTemplateField(event?.formFields as any[], 'shirtSize') && (
                    <FormField
                      control={form.control}
                      name="shirtSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{language === "es" ? "Talla de Camiseta" : "T-Shirt Size"} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-shirt-size">
                                <SelectValue placeholder={language === "es" ? "Seleccionar talla" : "Select size"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {genderedShirtSizes.map((size) => (
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
                  )}
                  {hasTemplateField(event?.formFields as any[], 'pantSize') && (
                    <FormField
                      control={form.control}
                      name="pantSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{language === "es" ? "Talla de Pantalon" : "Pant Size"} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-pant-size">
                                <SelectValue placeholder={language === "es" ? "Seleccionar talla" : "Select size"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {genderedPantSizes.map((size) => (
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
                  )}
                </div>
              </div>
            )}

            {/* Preferences Section - only show if any preference fields in template */}
            {(hasTemplateField(event?.formFields as any[], 'dietaryRestrictions') || 
              hasTemplateField(event?.formFields as any[], 'adaAccommodations') || 
              hasTemplateField(event?.formFields as any[], 'roomType')) && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">
                  {language === "es" ? "Preferencias" : "Preferences"}
                </h3>

                {hasTemplateField(event?.formFields as any[], 'dietaryRestrictions') && (
                  <FormField
                    control={form.control}
                    name="dietaryRestrictions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{language === "es" ? "Restricciones Dieteticas" : "Dietary Restrictions"}</FormLabel>
                        <FormDescription>
                          {language === "es" 
                            ? "Seleccione todas las que apliquen" 
                            : "Select all that apply"}
                        </FormDescription>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                          {dietaryOptions.map((option) => {
                            const isSelected = (field.value || []).includes(option.value);
                            return (
                              <label
                                key={option.value}
                                className={`flex items-center space-x-2 rounded-md border p-2 cursor-pointer transition-colors ${
                                  isSelected ? "bg-primary/10 border-primary" : ""
                                }`}
                                data-testid={`dietary-option-${option.value}`}
                              >
                                <Checkbox 
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    toggleDietaryRestriction(option.value);
                                  }}
                                />
                                <span className="text-sm">{getDietaryLabel(option)}</span>
                              </label>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {hasTemplateField(event?.formFields as any[], 'adaAccommodations') && (
                  <FormField
                    control={form.control}
                    name="adaAccommodations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{language === "es" ? "Necesita Acomodaciones ADA?" : "ADA Accommodations?"} *</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "yes")} value={field.value ? "yes" : "no"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-ada">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="no">{language === "es" ? "No" : "No"}</SelectItem>
                            <SelectItem value="yes">{language === "es" ? "Si" : "Yes"}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {hasTemplateField(event?.formFields as any[], 'roomType') && (
                  <FormField
                    control={form.control}
                    name="roomType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{language === "es" ? "Tipo de Habitacion" : "Room Type"} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-room-type">
                              <SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {roomTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {getRoomLabel(type)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}

            {/* Custom Form Fields Section - only show fields not handled by hardcoded sections */}
            {(() => {
              const customFields = getCustomOnlyFields(event?.formFields as any[]);
              if (customFields.length === 0) return null;
              
              return (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">
                    {language === "es" ? "Informacion Adicional" : "Additional Information"}
                  </h3>
                  {customFields.map((field) => {
                    // Use name as the key for template fields, fall back to id for custom form builder
                    const fieldKey = field.name || (field as any).id;
                    const fieldLabel = language === "es" && field.labelEs ? field.labelEs : field.label;
                    const fieldPlaceholder = language === "es" && field.placeholderEs ? field.placeholderEs : field.placeholder;
                    
                    // Check conditional visibility
                    const conditionalOn = (field as any).conditionalOn;
                    if (conditionalOn) {
                      const parentValue = customFormData[conditionalOn.field];
                      if (parentValue !== conditionalOn.value) {
                        return null; // Hide field if condition not met
                      }
                    }
                    
                    // If field has conditionalOn, make it required when visible
                    const isRequired = conditionalOn ? true : field.required;
                  
                    return (
                      <div key={fieldKey} className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {fieldLabel}{isRequired && " *"}
                        </label>
                        
                        {field.type === "text" && (
                          <Input
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}
                        
                        {field.type === "email" && (
                          <Input
                            type="email"
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}
                        
                        {field.type === "phone" && (
                          <PhoneInput
                            international
                            defaultCountry="US"
                            value={customFormData[fieldKey] || ""}
                            onChange={(value) => setCustomFormData(prev => ({ ...prev, [fieldKey]: value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm"
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}
                        
                        {field.type === "number" && (
                          <Input
                            type="number"
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}
                        
                        {field.type === "date" && (
                          <Input
                            type="date"
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}
                        
                        {field.type === "textarea" && (
                          <Textarea
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}
                        
                        {field.type === "select" && field.options && (
                          <Select
                            value={customFormData[fieldKey] || ""}
                            onValueChange={(value) => setCustomFormData(prev => ({ ...prev, [fieldKey]: value }))}
                          >
                            <SelectTrigger data-testid={`select-custom-${fieldKey}`}>
                              <SelectValue placeholder={fieldPlaceholder || (language === "es" ? "Seleccionar" : "Select")} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {language === "es" && option.labelEs ? option.labelEs : option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {field.type === "checkbox" && (
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`custom-${fieldKey}`}
                              checked={customFormData[fieldKey] || false}
                              onCheckedChange={(checked) => setCustomFormData(prev => ({ ...prev, [fieldKey]: checked }))}
                              data-testid={`checkbox-custom-${fieldKey}`}
                            />
                            <label 
                              htmlFor={`custom-${fieldKey}`}
                              className="text-sm text-muted-foreground cursor-pointer"
                            >
                              {fieldPlaceholder || fieldLabel}
                            </label>
                          </div>
                        )}
                        
                        {field.type === "radio" && field.options && (
                          <RadioGroup
                            value={customFormData[fieldKey] || ""}
                            onValueChange={(value) => {
                              setCustomFormData(prev => {
                                const newData: Record<string, any> = { ...prev, [fieldKey]: value };
                                // Clear conditional fields when parent value changes
                                customFields.forEach((f) => {
                                  const conditionalField = f as any;
                                  if (conditionalField.conditionalOn?.field === fieldKey && value !== conditionalField.conditionalOn?.value) {
                                    const conditionalFieldKey = String(conditionalField.name || conditionalField.id);
                                    delete newData[conditionalFieldKey];
                                  }
                                });
                                return newData;
                              });
                            }}
                            className="space-y-2"
                            data-testid={`radio-custom-${fieldKey}`}
                          >
                            {field.options.map((option) => (
                              <div key={option.value} className="flex items-center space-x-2">
                                <RadioGroupItem 
                                  value={option.value} 
                                  id={`${fieldKey}-${option.value}`}
                                  data-testid={`radio-option-${fieldKey}-${option.value}`}
                                />
                                <Label 
                                  htmlFor={`${fieldKey}-${option.value}`}
                                  className="cursor-pointer font-normal"
                                >
                                  {language === "es" && option.labelEs ? option.labelEs : option.label}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Terms Section - only if termsAccepted in template */}
            {hasTemplateField(event?.formFields as any[], 'termsAccepted') && (
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
                      <FormLabel className="cursor-pointer">
                        {language === "es" ? (
                          <>
                            Al marcar esta casilla, acepto todos los terminos descritos en el{" "}
                            <a 
                              href="https://drive.google.com/file/d/1yYXgsMzkE0kjVd-7-Bo5LWLH7wNpEyp1/view?usp=sharing"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              documento de exencion del evento
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            . *
                          </>
                        ) : (
                          <>
                            By checking this box, I acknowledge and accept all terms outlined in the{" "}
                            <a 
                              href="https://drive.google.com/file/d/1yYXgsMzkE0kjVd-7-Bo5LWLH7wNpEyp1/view?usp=sharing"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              event waiver
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            . *
                          </>
                        )}
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Additional Attendees Section - only for multi-attendee anonymous mode */}
            {openAnonymousMode && ticketCount > 1 && additionalAttendees.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium border-b pb-2">
                  {language === "es" ? "Asistentes Adicionales" : "Additional Attendees"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {language === "es" 
                    ? `Por favor ingrese la informacion para los ${additionalAttendees.length} asistente(s) adicional(es).`
                    : `Please enter information for the ${additionalAttendees.length} additional attendee(s).`}
                </p>
                {additionalAttendees.map((attendee, index) => (
                  <div key={index} className="p-4 border rounded-md bg-muted/20 space-y-3">
                    <div className="font-medium text-sm">
                      {language === "es" ? `Asistente ${index + 2}` : `Attendee ${index + 2}`}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {language === "es" ? "Nombre" : "First Name"} *
                        </label>
                        <Input
                          value={attendee.firstName}
                          onChange={(e) => {
                            const newAttendees = [...additionalAttendees];
                            newAttendees[index] = { ...newAttendees[index], firstName: e.target.value };
                            setAdditionalAttendees(newAttendees);
                          }}
                          placeholder={language === "es" ? "Nombre" : "First name"}
                          data-testid={`input-attendee-${index + 2}-firstName`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {language === "es" ? "Apellido" : "Last Name"} *
                        </label>
                        <Input
                          value={attendee.lastName}
                          onChange={(e) => {
                            const newAttendees = [...additionalAttendees];
                            newAttendees[index] = { ...newAttendees[index], lastName: e.target.value };
                            setAdditionalAttendees(newAttendees);
                          }}
                          placeholder={language === "es" ? "Apellido" : "Last name"}
                          data-testid={`input-attendee-${index + 2}-lastName`}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {language === "es" ? "Correo electronico" : "Email"} *
                        </label>
                        <Input
                          type="email"
                          value={attendee.email}
                          onChange={(e) => {
                            const newAttendees = [...additionalAttendees];
                            newAttendees[index] = { ...newAttendees[index], email: e.target.value };
                            setAdditionalAttendees(newAttendees);
                          }}
                          placeholder={language === "es" ? "correo@ejemplo.com" : "email@example.com"}
                          data-testid={`input-attendee-${index + 2}-email`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {language === "es" ? "Telefono" : "Phone"} 
                        </label>
                        <Input
                          type="tel"
                          value={attendee.phone || ""}
                          onChange={(e) => {
                            const newAttendees = [...additionalAttendees];
                            newAttendees[index] = { ...newAttendees[index], phone: e.target.value };
                            setAdditionalAttendees(newAttendees);
                          }}
                          placeholder={language === "es" ? "Telefono (opcional)" : "Phone (optional)"}
                          data-testid={`input-attendee-${index + 2}-phone`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={registerMutation.isPending}
              data-testid="button-submit-registration"
            >
              {registerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                getCtaLabel()
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  // OTP Verification Dialog for open_verified mode
  const renderOtpDialog = () => (
    <Dialog open={showOtpDialog} onOpenChange={(open) => {
      if (!open) {
        setShowOtpDialog(false);
        setOtpCode("");
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {language === "es" ? "Verificar Correo" : "Verify Email"}
          </DialogTitle>
          <DialogDescription>
            {language === "es" 
              ? `Ingrese el código de 6 dígitos enviado a ${verificationEmail}`
              : `Enter the 6-digit code sent to ${verificationEmail}`}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-4 py-4">
          <InputOTP
            value={otpCode}
            onChange={setOtpCode}
            maxLength={6}
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
          
          <Button
            variant="link"
            onClick={() => handleOpenVerifiedSendOtp(verificationEmail)}
            disabled={isVerifying}
            className="text-sm"
            data-testid="button-resend-otp"
          >
            {language === "es" ? "Reenviar código" : "Resend code"}
          </Button>
        </div>
        
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              setShowOtpDialog(false);
              setOtpCode("");
            }}
            data-testid="button-cancel-otp"
          >
            {language === "es" ? "Cancelar" : "Cancel"}
          </Button>
          <Button
            onClick={handleOpenVerifiedVerifyOtp}
            disabled={isVerifying || otpCode.length !== 6}
            data-testid="button-verify-otp"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {language === "es" ? "Verificando..." : "Verifying..."}
              </>
            ) : (
              language === "es" ? "Verificar y Registrar" : "Verify & Register"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Standard layout - default, form centered on page
  if (layout === "standard") {
    return (
      <>
      {renderOtpDialog()}
      <div className="min-h-screen bg-background relative">
        {renderHeader()}
        
        {/* Use CMS intro section if available, otherwise use default hero */}
        {introSection ? (
          <IntroSection content={introSection.content as IntroSectionContent} />
        ) : (
          <div className="max-w-2xl mx-auto p-4 pt-16 text-center">
            {heroImageUrl && (
              <img 
                src={heroImageUrl} 
                alt="" 
                className="w-full h-48 object-cover rounded-lg mb-6"
              />
            )}
            <h1 className="text-3xl font-semibold tracking-tight mb-2 text-foreground">
              {getCustomHeading() || getEventName()}
            </h1>
            {getCustomSubheading() && (
              <p className="text-muted-foreground mb-4">{getCustomSubheading()}</p>
            )}
            {renderEventInfo()}
          </div>
        )}
        
        <div className="max-w-2xl mx-auto p-4 pb-12">
          {!introSection && getEventDescription() && !getCustomSubheading() && (
            <Card className="mb-6 bg-card border">
              <CardContent className="p-6">
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: getEventDescription() || "" }}
                />
              </CardContent>
            </Card>
          )}

          {renderMainContent()}

          <footer className="mt-8 text-center text-sm text-muted-foreground">
            <a href="https://unicity.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Unicity International</a>
            <span className="mx-2">|</span>
            <a href="mailto:americasevent@unicity.com" className="hover:underline">americasevent@unicity.com</a>
          </footer>
        </div>
      </div>
      </>
    );
  }

  // Split layout - image on left, form on right (matches Punta Cana design)
  // Uses natural page scrolling - no nested scroll containers
  if (layout === "split") {
    return (
      <>
      {renderOtpDialog()}
      <div className="min-h-screen bg-background">
        {/* Mobile: stacked layout, Desktop: side-by-side */}
        <div className="flex flex-col lg:flex-row lg:min-h-screen">
          {/* Left side - Hero image (full width on mobile, 40% on desktop) */}
          <div className="w-full lg:w-[40%] lg:min-h-screen bg-[#0f2a42]">
            {heroImageUrl ? (
              <div className="h-72 lg:h-full w-full p-4 lg:p-6 flex flex-col lg:sticky lg:top-0">
                {/* Image container with padding and shadow */}
                <div 
                  className="flex-1 rounded-lg bg-cover bg-center relative overflow-hidden shadow-xl min-h-[16rem] lg:min-h-0"
                  style={{ backgroundImage: `url(${heroImageUrl})` }}
                >
                  {/* Gradient overlay for text readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  {/* Event title positioned at bottom left */}
                  <div className="absolute bottom-0 left-0 p-6 lg:p-8">
                    <h1 className="text-3xl lg:text-5xl font-bold text-white leading-tight max-w-md">
                      {getCustomHeading() || getEventName()}
                    </h1>
                    {getCustomSubheading() && (
                      <p className="text-white/90 mt-2">{getCustomSubheading()}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-64 lg:h-full w-full p-4 lg:p-6 flex flex-col lg:sticky lg:top-0">
                <div className="flex-1 rounded-lg bg-primary/20 flex items-end p-6 lg:p-8 min-h-[14rem] lg:min-h-0">
                  <div className="text-white">
                    <h1 className="text-xl lg:text-3xl font-bold leading-tight max-w-sm">
                      {getCustomHeading() || getEventName()}
                    </h1>
                    {getCustomSubheading() && (
                      <p className="opacity-90 mt-2">{getCustomSubheading()}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Right side - Form content (scrolls with page) */}
          <div className="flex-1 lg:w-[60%]">
            {/* Header with logo, date, location, and controls - single row, sticky */}
            <div className="bg-background/95 backdrop-blur-sm border-b px-4 py-3 sticky top-0 z-50">
              <div className="flex items-center justify-between gap-6">
                {/* Left: Logo */}
                <div className="shrink-0">
                  <img 
                    src={theme === "dark" ? unicityLogoWhite : unicityLogoDark} 
                    alt="Unicity" 
                    className="h-6 w-auto"
                    data-testid="img-header-logo"
                  />
                </div>
                {/* Center: Date and location */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-1 min-w-0">
                  {event?.startDate && (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>
                        {format(parseLocalDate(event.startDate)!, "MMM d, yyyy")}
                        {event.endDate && ` - ${format(parseLocalDate(event.endDate)!, "MMM d, yyyy")}`}
                      </span>
                    </div>
                  )}
                  {event?.location && (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{event.location}</span>
                    </div>
                  )}
                </div>
                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {verifiedProfile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleLogout}
                      className="text-muted-foreground"
                      data-testid="button-logout"
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
            </div>
            
            {/* Form content - scrolls naturally with page */}
            <div className="p-6 lg:p-10 bg-background">
              <div className="max-w-xl mx-auto">
                {renderMainContent()}
                <footer className="mt-8 pb-8 text-center text-sm text-muted-foreground">
                  <a href="https://unicity.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Unicity International</a>
                  <span className="mx-2">|</span>
                  <a href="mailto:americasevent@unicity.com" className="hover:underline">americasevent@unicity.com</a>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  // Hero-background layout - bright hero image with event info below
  return (
    <>
      {renderOtpDialog()}
      <div className="min-h-screen bg-card">
        {renderHeader()}
      
      {/* Hero Image - bright and prominent */}
      {heroImageUrl && (
        <div 
          className="h-80 md:h-96 bg-cover bg-center relative"
          style={{ backgroundImage: `url(${heroImageUrl})` }}
        >
          {/* Subtle gradient at bottom for smooth transition */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        </div>
      )}
      
      {/* Event Info Section - clean white background */}
      <div className="bg-card py-10 text-center border-b">
        <div className="max-w-2xl mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1a365d] mb-2">
            {getCustomHeading() || getEventName()}
          </h1>
          {getCustomSubheading() && (
            <p className="text-xl text-[#1a365d]/80 mb-4">{getCustomSubheading()}</p>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-[#1a365d]/70 mt-4">
            {event.startDate && (
              <div className="flex items-center gap-2">
                <span className="font-semibold">Date:</span>
                <span>
                  {format(parseLocalDate(event.startDate)!, "MMMM d")}
                  {event.endDate && event.endDate !== event.startDate && (
                    <> - {format(parseLocalDate(event.endDate)!, "d, yyyy")}</>
                  )}
                  {(!event.endDate || event.endDate === event.startDate) && (
                    <>, {format(parseLocalDate(event.startDate)!, "yyyy")}</>
                  )}
                </span>
              </div>
            )}
            {event.location && (
              <div className="flex items-center gap-2">
                <span className="font-semibold">Location:</span>
                <span>{event.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Form Section */}
      <div className="bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          {renderMainContent()}
          <footer className="mt-8 pb-8 text-center text-sm text-muted-foreground">
            <a href="https://unicity.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Unicity International</a>
            <span className="mx-2">|</span>
            <a href="mailto:americasevent@unicity.com" className="hover:underline">americasevent@unicity.com</a>
          </footer>
        </div>
      </div>
    </div>
    </>
  );
}
