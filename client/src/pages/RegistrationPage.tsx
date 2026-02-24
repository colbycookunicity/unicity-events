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
  // Distributor ID is only locked if we actually have a value from Hydra or URL
  const isUnicityIdLocked = Boolean(verifiedProfile?.unicityId) || Boolean(prePopulatedUnicityId);

  const { data: event, isLoading } = useQuery<PublicEvent>({
    queryKey: ["/api/events", params.eventId, "public"],
  });

  // Fetch CMS page sections for this event (intro, thank_you, etc.)
  // CMS content is OPTIONAL - endpoint returns { sections: [], cmsAvailable: false } if no CMS
  const { data: pageData, isLoading: isPageDataLoading } = useQuery<PageData & { event?: Event; cmsAvailable?: boolean } | null>({
    queryKey: ["/api/public/event-pages", params.eventId],
    enabled: !!params.eventId,
    retry: false, // CMS is optional, don't retry on failure
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to prevent repeated requests
  });

  // Fetch LOGIN page CMS data for verification screens
  const { data: loginPageData } = useQuery<PageData & { cmsAvailable?: boolean } | null>({
    queryKey: ["/api/public/event-pages", params.eventId, "login"],
    queryFn: async () => {
      const res = await fetch(`/api/public/event-pages/${params.eventId}?pageType=login`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.eventId,
    retry: false, // CMS is optional
    staleTime: 5 * 60 * 1000,
  });

  // Extract login hero content from CMS (only if CMS is available and has sections)
  const loginHeroSection = loginPageData?.cmsAvailable !== false 
    ? loginPageData?.sections?.find(s => s.type === "hero" && s.isEnabled) 
    : null;
  const loginHeroContent = loginHeroSection?.content as HeroSectionContent | undefined;

  // Find intro and thank_you sections from CMS (only when page data is loaded)
  // Check cmsAvailable flag - if false, sections array is empty (CMS not configured for this event)
  const cmsDataReady = !isPageDataLoading && pageData && pageData.cmsAvailable !== false;
  const introSection = cmsDataReady ? pageData?.sections?.find(s => s.type === "intro" && s.isEnabled) : null;
  const thankYouSection = cmsDataReady ? pageData?.sections?.find(s => s.type === "thank_you" && s.isEnabled) : null;

  // Fetch REGISTRATION page CMS data for form content
  const { data: registrationPageData } = useQuery<PageData & { cmsAvailable?: boolean } | null>({
    queryKey: ["/api/public/event-pages", params.eventId, "registration"],
    queryFn: async () => {
      const res = await fetch(`/api/public/event-pages/${params.eventId}?pageType=registration`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.eventId,
    retry: false, // CMS is optional
    staleTime: 5 * 60 * 1000,
  });

  // Extract registration page CMS sections (only if CMS is available)
  const registrationHeroSection = registrationPageData?.cmsAvailable !== false 
    ? registrationPageData?.sections?.find(s => s.type === "hero" && s.isEnabled) 
    : null;
  const registrationHeroContent = registrationHeroSection?.content as HeroSectionContent | undefined;
  const formSection = registrationPageData?.cmsAvailable !== false 
    ? registrationPageData?.sections?.find(s => s.type === "form" && s.isEnabled) 
    : null;
  const formSectionContent = formSection?.content as FormSectionContent | undefined;
  
  // Store event info for thank you page (preserves data after mutation/refetch)
  const [savedEventInfo, setSavedEventInfo] = useState<{ name: string; nameEs?: string; startDate?: string } | null>(null);

  // Track which event we've initialized language for (to handle navigation between events)
  const languageInitializedForEventRef = useRef<string | null>(null);
  
  // Set initial language from URL query param (?lang=en or ?lang=es) or event's defaultLanguage
  // Priority: 1) URL ?lang= parameter, 2) event's defaultLanguage, 3) keep current language
  useEffect(() => {
    const currentEventId = params.eventId;
    
    // Only initialize language once per event (not on every re-render or navigation)
    if (event && currentEventId && languageInitializedForEventRef.current !== currentEventId) {
      // Check URL query parameter first (highest priority)
      const langParam = urlParams.get("lang");
      if (langParam === 'en' || langParam === 'es') {
        setLanguage(langParam);
      } else {
        // Fall back to event's defaultLanguage
        const eventDefaultLanguage = event.defaultLanguage as 'en' | 'es' | undefined;
        if (eventDefaultLanguage === 'en' || eventDefaultLanguage === 'es') {
          setLanguage(eventDefaultLanguage);
        }
      }
      languageInitializedForEventRef.current = currentEventId;
    }
  }, [event, params.eventId, setLanguage]);

  // Custom form fields data (for events with custom form fields)
  const [customFormData, setCustomFormData] = useState<Record<string, any>>({});
  // Track validation errors for custom fields (field key -> error message)
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  // Multi-attendee support for open_anonymous mode
  const [ticketCount, setTicketCount] = useState(1);
  const [additionalAttendees, setAdditionalAttendees] = useState<Array<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }>>([]);

  // registrationMode is the sole source of truth - no legacy fallbacks
  // - qualified_verified: OTP required, must be on qualified list, email unique per event
  // - open_verified: OTP required, no qualification, email unique per event
  // - open_anonymous: no OTP, email may be reused, multiple registrations allowed
  const registrationMode = event?.registrationMode || "open_verified";
  const requiresVerification = (registrationMode !== "open_anonymous") && !skipVerification;
  const qualifiedVerifiedMode = registrationMode === "qualified_verified";
  const openVerifiedMode = registrationMode === "open_verified";
  const openAnonymousMode = registrationMode === "open_anonymous";
  
  // Lookup dialog state for already registered users (used in open_verified mode)
  const [showLookupDialog, setShowLookupDialog] = useState(false);
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupStep, setLookupStep] = useState<"email" | "otp">("email");
  const [isSendingLookupOtp, setIsSendingLookupOtp] = useState(false);

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

  // Skip to form based on registration mode:
  // - qualified_verified: NEVER skip - must verify email + OTP first
  // - open_verified: form visible immediately, OTP verification gates submission
  // - open_anonymous: form visible immediately, NO verification at all
  // - skipVerification: pre-populated from URL params
  useEffect(() => {
    // CRITICAL: Wait for event data to load before making any decisions
    // Without this, the default "open_verified" mode would incorrectly skip to form
    if (!event) {
      return;
    }
    
    // For qualified_verified mode, NEVER skip to form - must go through email → OTP → form steps
    if (qualifiedVerifiedMode && !skipVerification) {
      // Stay on email step, do not auto-advance to form
      return;
    }
    if (skipVerification || !requiresVerification || openVerifiedMode || openAnonymousMode) {
      setVerificationStep("form");
    }
  }, [skipVerification, event, requiresVerification, qualifiedVerifiedMode, openVerifiedMode, openAnonymousMode]);

  // For open_verified mode: check if user already has a valid attendee token from homepage
  // This prevents double verification when user verified on homepage then navigates to registration
  useEffect(() => {
    const checkAttendeeTokenForOpenVerified = async () => {
      if (!openVerifiedMode || isEmailVerified || verifiedProfile || !params.eventId) {
        return;
      }
      
      const attendeeToken = localStorage.getItem("attendeeAuthToken");
      const attendeeEmail = localStorage.getItem("attendeeEmail");
      
      if (!attendeeToken || !attendeeEmail) {
        return;
      }
      
      try {
        // Validate the attendee session is still valid
        const res = await fetch("/api/attendee/events", {
          headers: { Authorization: `Bearer ${attendeeToken}` },
        });
        
        if (res.ok) {
          // Session is valid - mark email as verified to skip OTP dialog at submission
          setIsEmailVerified(true);
          setVerificationEmail(attendeeEmail);
          
          // Optionally set verifiedProfile to populate form fields
          try {
            const qualifierRes = await fetch(`/api/public/qualifier-info/${params.eventId}?email=${encodeURIComponent(attendeeEmail)}`);
            if (qualifierRes.ok) {
              const qualifierData = await qualifierRes.json();
              setVerifiedProfile({
                unicityId: qualifierData.unicityId || "",
                email: attendeeEmail,
                firstName: qualifierData.firstName || "",
                lastName: qualifierData.lastName || "",
                phone: "",
              });
              // Pre-populate form
              form.setValue("email", attendeeEmail);
              if (qualifierData.firstName) form.setValue("firstName", qualifierData.firstName);
              if (qualifierData.lastName) form.setValue("lastName", qualifierData.lastName);
              if (qualifierData.unicityId) form.setValue("unicityId", qualifierData.unicityId);
            } else {
              // No qualifier data but session is valid
              setVerifiedProfile({
                unicityId: "",
                email: attendeeEmail,
                firstName: "",
                lastName: "",
                phone: "",
              });
              form.setValue("email", attendeeEmail);
            }
          } catch (e) {
            // Session valid, just set email
            form.setValue("email", attendeeEmail);
          }
        } else {
          // Token expired - clear it
          localStorage.removeItem("attendeeAuthToken");
          localStorage.removeItem("attendeeEmail");
        }
      } catch (error) {
        console.error("Failed to validate attendee session for open_verified mode:", error);
      }
    };
    
    checkAttendeeTokenForOpenVerified();
  }, [openVerifiedMode, isEmailVerified, verifiedProfile, params.eventId]);

  // Check for existing verified session on page load (for refresh persistence)
  // Also checks attendee token from /my-events authentication
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  useEffect(() => {
    const checkExistingSession = async () => {
      // Skip if already verified, consuming token, OTP just verified, or no event
      // otpJustVerified prevents race condition where this effect runs during OTP verification state transition
      if (verificationStep !== "email" || isConsumingToken || tokenConsumed || skipVerification || otpJustVerified || !params.eventId) {
        return;
      }
      
      // CRITICAL: For qualified_verified mode, NEVER auto-skip to form from stored sessions
      // User MUST go through the full email → qualification check → OTP → form flow
      if (qualifiedVerifiedMode) {
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
  }, [params.eventId, verificationStep, isConsumingToken, tokenConsumed, skipVerification, otpJustVerified, qualifiedVerifiedMode]);

  // Reset existing registration state when verification email or event changes (security: prevents cross-user/cross-event data leakage)
  useEffect(() => {
    const currentEmail = verifiedProfile?.email || verificationEmail || prePopulatedEmail;
    const currentKey = currentEmail && params.eventId ? `${currentEmail.toLowerCase()}:${params.eventId}` : null;
    
    if (loadedForKey && currentKey && loadedForKey !== currentKey) {
      setExistingRegistrationId(null);
      setCustomFormData({});
      setCustomFieldErrors({});
      setLoadedForKey(null);
    }
  }, [verifiedProfile?.email, verificationEmail, prePopulatedEmail, params.eventId, loadedForKey]);

  const handleSendOtp = async () => {
    // For qualified_verified mode, check qualification FIRST before sending OTP
    // User can provide email OR distributorId (at least one)
    if (qualifiedVerifiedMode) {
      const hasEmail = verificationEmail && verificationEmail.includes("@");
      const hasDistributorId = verificationDistributorId && verificationDistributorId.trim();
      
      if (!hasEmail && !hasDistributorId) {
        toast({
          title: language === "es" ? "Información requerida" : "Information Required",
          description: language === "es" 
            ? "Por favor ingrese su correo electrónico o ID de distribuidor" 
            : "Please enter your email or distributor ID",
          variant: "destructive",
        });
        return;
      }

      setIsVerifying(true);
      try {
        // Build query with available info - check qualification BEFORE sending OTP
        const queryParams = new URLSearchParams();
        if (hasEmail) queryParams.set("email", verificationEmail);
        if (hasDistributorId) queryParams.set("distributorId", verificationDistributorId.trim());
        
        const qualRes = await fetch(`/api/public/qualifier-info/${params.eventId}?${queryParams.toString()}`);
        
        if (!qualRes.ok) {
          // User is NOT qualified - block them immediately, NO OTP sent
          setIsQualified(false);
          setQualificationChecked(true);
          const errorData = await qualRes.json().catch(() => ({}));
          const errorMsg = errorData.error || (language === "es" 
            ? "No está calificado para registrarse en este evento."
            : "You are not qualified to register for this event.");
          setQualificationMessage(errorMsg);
          toast({
            title: language === "es" ? "No califica" : "Not Qualified",
            description: errorMsg,
            variant: "destructive",
          });
          setIsVerifying(false);
          return; // STOP - do NOT call Hydra
        }

        // User IS qualified - get their info
        const qualifierData = await qualRes.json();
        setIsQualified(true);
        setQualificationChecked(true);
        
        // SECURITY: If user only provided distributorId, the email is MASKED
        // Use the new generate-by-id endpoint to send OTP without exposing email
        const emailIsMasked = qualifierData.emailMasked === true;
        
        if (emailIsMasked) {
          // Use distributorId-based OTP flow (email never exposed)
          const res = await apiRequest("POST", "/api/register/otp/generate-by-id", { 
            distributorId: verificationDistributorId.trim(),
            eventId: params.eventId,
          });
          const data = await res.json();
          
          // SECURITY: Store sessionToken for validation (allows validation without knowing email)
          if (data.sessionToken) {
            setVerificationSessionToken(data.sessionToken);
          }
          
          // Show masked email in UI so user knows where code was sent
          setVerificationEmail(qualifierData.email); // This is masked like "j***n@g***l.com"
          setVerificationStep("otp");
          toast({
            title: language === "es" ? "Código enviado" : "Code Sent",
            description: language === "es" 
              ? `Código enviado a ${qualifierData.email}` 
              : `Verification code sent to ${qualifierData.email}`,
          });
          
          // Show dev code in development
          if (data.devCode) {
            console.log("DEV MODE: Use code", data.devCode);
          }
        } else {
          // User provided email directly - use normal flow
          // SECURITY: Clear any existing sessionToken since we're using email-based flow
          setVerificationSessionToken(null);
          
          const emailForOtp = hasEmail ? verificationEmail : qualifierData.email;
          
          if (!emailForOtp) {
            toast({
              title: language === "es" ? "Correo no encontrado" : "Email Not Found",
              description: language === "es" 
                ? "No tenemos un correo registrado para este ID. Por favor ingrese su correo." 
                : "We don't have an email on file for this ID. Please enter your email.",
              variant: "destructive",
            });
            setIsVerifying(false);
            return;
          }
          
          // Update verificationEmail if it came from qualifier data
          if (!hasEmail && emailForOtp) {
            setVerificationEmail(emailForOtp);
          }
          
          // Continue to send OTP via Hydra
          const res = await apiRequest("POST", "/api/register/otp/generate", { 
            email: emailForOtp,
            eventId: params.eventId,
          });
          const data = await res.json();
          
          setVerificationStep("otp");
          toast({
            title: language === "es" ? "Código enviado" : "Code Sent",
            description: language === "es" ? `Código enviado a ${emailForOtp}` : `Verification code sent to ${emailForOtp}`,
          });
          
          // Show dev code in development
          if (data.devCode) {
            console.log("DEV MODE: Use code", data.devCode);
          }
        }
      } catch (error: any) {
        // Parse error message
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
      return;
    }
    
    // For non-qualified_verified modes, email is required
    if (!verificationEmail || !verificationEmail.includes("@")) {
      toast({
        title: language === "es" ? "Correo inválido" : "Invalid Email",
        description: language === "es" ? "Por favor ingrese un correo electrónico válido" : "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    // For open_verified mode (or other modes), just send OTP without qualification check
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/generate", { 
        email: verificationEmail,
        eventId: params.eventId,
      });
      const data = await res.json();
      
      setVerificationStep("otp");
      toast({
        title: language === "es" ? "Código enviado" : "Code Sent",
        description: language === "es" ? `Código enviado a ${verificationEmail}` : `Verification code sent to ${verificationEmail}`,
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
      // SECURITY: Use sessionToken for validation when available (distributorId flow)
      // This allows validation without needing to expose the real email to the client
      const validationPayload: { code: string; eventId: string; email?: string; sessionToken?: string } = {
        code: otpCode,
        eventId: params.eventId,
      };
      
      if (verificationSessionToken) {
        // DistributorId flow: use sessionToken for validation
        validationPayload.sessionToken = verificationSessionToken;
      } else {
        // Standard email flow: use email for validation
        validationPayload.email = verificationEmail;
      }
      
      const res = await apiRequest("POST", "/api/register/otp/validate", validationPayload);
      const data = await res.json();
      
      if (data.verified) {
        // Set flag to prevent checkExistingSession from clearing state during transition
        setOtpJustVerified(true);
        
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
        
        // Force refresh event data to ensure formFields are loaded before showing form
        await queryClient.invalidateQueries({ queryKey: ["/api/events", params.eventId, "public"] });
        
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
      // Parse error message - it may be in format "400: {\"error\":\"...\"}
      let errorMessage = language === "es" ? "Por favor verifica tu código e intenta de nuevo" : "Please check your code and try again";
      if (error.message) {
        try {
          // Try to extract JSON from error message like "400: {...}"
          const jsonMatch = error.message.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || errorMessage;
          }
        } catch {
          // If parsing fails, use default message
        }
      }
      toast({
        title: language === "es" ? "Código inválido" : "Invalid Code",
        description: errorMessage,
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
    setVerificationSessionToken(null); // Clear session token for security
    setOtpCode("");
    setOtpJustVerified(false); // Reset flag to allow session checks on restart
    setExistingRegistrationId(null);
    setCustomFormData({});
    setCustomFieldErrors({});
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
            // CRITICAL: Do NOT skip for qualified_verified mode - require full verification flow
            if (verificationStep === "email" && !qualifiedVerifiedMode) {
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
      
      // Strategy 2: Use OTP session to fetch existing registration
      // For qualified_verified: OTP was already completed before reaching form
      // For open_verified: OTP may have been completed (isEmailVerified) - if so, fetch existing data
      // For open_anonymous: skip fetching (allows multiple registrations per email)
      const hasVerifiedSession = verifiedProfile || isEmailVerified;
      const shouldFetchExisting = verificationStep === "form" && 
                                   !openAnonymousMode && 
                                   hasVerifiedSession;
      
      if (shouldFetchExisting) {
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
            // OTP session expired - for open_verified, just mark as loaded (verification happens at submit)
            // For qualified_verified, redirect to email verification
            fetchingExistingRef.current = null;
            setLoadedForKey(currentKey);
            if (!openVerifiedMode) {
              resetToEmailVerification(true);
            }
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
      } else if (verificationStep === "form" && openAnonymousMode) {
        // For open_anonymous mode only, skip fetching (allows multiple registrations)
        setLoadedForKey(currentKey);
      }
    };
    
    fetchExistingRegistration();
  }, [verificationStep, verifiedProfile, verificationEmail, prePopulatedEmail, params.eventId, event, loadedForKey, openAnonymousMode, openVerifiedMode, isEmailVerified]);

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      // Debug: Log phone value before building payload
      console.log('[DataFlow] Client - Form phone value:', JSON.stringify({
        phone: data.phone,
        phoneType: typeof data.phone,
        phoneLength: data.phone?.length,
      }));
      
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
      
      // Debug: Log final payload phone value
      console.log('[DataFlow] Client - Final payload phone:', JSON.stringify({
        phone: payload.phone,
        phoneType: typeof payload.phone,
      }));
      
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
      // Include attendee token if available (for users who verified via /my-events homepage)
      const attendeeToken = localStorage.getItem("attendeeAuthToken");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (attendeeToken) {
        headers["Authorization"] = `Bearer ${attendeeToken}`;
      }
      const res = await fetch(`/api/events/${params.eventId}/register`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          throw json; // Throw parsed error object for onError handler
        } catch {
          throw new Error(`${res.status}: ${text}`);
        }
      }
      return res;
    },
    onSuccess: async (response) => {
      setIsSuccess(true);
      // Check if the response indicates an update vs create
      let wasUpdated = existingRegistrationId ? true : false;
      let registrationCount = 1;
      let regId: string | null = existingRegistrationId;
      try {
        const result = await response.json();
        if (result.wasUpdated) wasUpdated = true;
        if (result.ticketCount) registrationCount = result.ticketCount;
        if (result.id) regId = result.id;
        if (result.registrationId) regId = result.registrationId;
        // Store check-in token for Apple Wallet button
        if (result.checkInToken) setCompletedCheckInToken(result.checkInToken);
      } catch {
        // Ignore JSON parse errors
      }
      // Store the registration ID for the thank-you page QR code
      if (regId) setCompletedRegistrationId(regId);
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
      
      // Check if this is a NOT_QUALIFIED error (user not on qualified list)
      const isNotQualified = 
        errorCode === "NOT_QUALIFIED" ||
        errorMsg.includes("NOT_QUALIFIED") || 
        errorMsg.includes("Not qualified for this event");
      
      if (isNotQualified) {
        // Show friendly qualification error with custom messaging
        toast({ 
          title: language === "es" ? "No calificado" : "Not Qualified",
          description: language === "es" 
            ? "No está en la lista de calificados para este evento. Por favor contacte al organizador si cree que esto es un error."
            : "You are not on the qualified list for this event. Please contact the event organizer if you believe this is an error.",
          variant: "destructive"
        });
        setIsQualified(false);
        setQualificationMessage(
          language === "es"
            ? "Su correo electrónico o ID de Unicity no está en la lista de calificados para este evento."
            : "Your email or Unicity ID is not on the qualified list for this event."
        );
        return; // Don't show default error toast
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

  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!existingRegistrationId || !params.eventId) throw new Error("Missing registration data");
      const attendeeToken = localStorage.getItem("attendeeAuthToken");
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (attendeeToken) {
        headers["Authorization"] = `Bearer ${attendeeToken}`;
      }
      const res = await fetch(`/api/events/${params.eventId}/register/${existingRegistrationId}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || `${res.status}: ${text}`);
        } catch {
          throw new Error(`${res.status}: ${text}`);
        }
      }
      return res.json();
    },
    onSuccess: () => {
      setShowCancelDialog(false);
      setExistingRegistrationId(null);
      setVerifiedProfile(null);
      setVerificationStep("email");
      setVerificationEmail("");
      setVerificationSessionToken(null);
      setOtpCode("");
      setIsSuccess(false);
      localStorage.removeItem("attendeeAuthToken");
      queryClient.invalidateQueries({ queryKey: ["/api/events", params.eventId, "public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendee/events"] });
      form.reset();
      toast({
        title: language === "es" ? "Registro cancelado" : "Registration Cancelled",
        description: language === "es"
          ? "Su registro ha sido cancelado exitosamente."
          : "Your registration has been successfully cancelled.",
      });
    },
    onError: (error: any) => {
      setShowCancelDialog(false);
      toast({
        title: language === "es" ? "Error" : "Error",
        description: error.message || (language === "es" ? "No se pudo cancelar el registro" : "Failed to cancel registration"),
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
        // Set flag to prevent checkExistingSession from clearing state during transition
        setOtpJustVerified(true);
        
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
        
        // For open_verified mode: Check for existing registration BEFORE submitting
        // If user has existing registration, show them the DB data and let them review before resubmitting
        if (openVerifiedMode && params.eventId) {
          try {
            const existingRes = await fetch("/api/register/existing", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, eventId: params.eventId }),
            });
            
            if (existingRes.ok) {
              const existingData = await existingRes.json();
              if (existingData.success && existingData.exists && existingData.registration) {
                console.log("[DataFlow] open_verified OTP complete - Found existing registration:", existingData.registration.id);
                
                // Populate form with database values (admin-updated data takes precedence)
                populateFormWithRegistration(existingData.registration);
                setPendingSubmissionData(null); // Clear pending data so user can review
                
                toast({
                  title: language === "es" ? "Registro encontrado" : "Existing Registration Found",
                  description: language === "es" 
                    ? "Hemos cargado su información existente. Por favor revise y actualice según sea necesario." 
                    : "We've loaded your existing information. Please review and update as needed.",
                });
                
                // Don't submit - let user review the loaded data first
                return;
              }
            }
          } catch (err) {
            console.error("[DataFlow] Failed to fetch existing registration during OTP verification:", err);
            // Fall through to submit (new registration)
          }
        }
        
        // Now complete the registration (no existing registration found or not open_verified)
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
      // Parse error message - it may be in format "400: {\"error\":\"...\"}
      let errorMessage = language === "es" ? "Por favor verifica tu código e intenta de nuevo" : "Please check your code and try again";
      if (error.message) {
        try {
          const jsonMatch = error.message.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || errorMessage;
          }
        } catch {
          // If parsing fails, use default message
        }
      }
      toast({
        title: language === "es" ? "Código inválido" : "Invalid Code",
        description: errorMessage,
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
      const fieldErrors: Record<string, string> = {};

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
            fieldErrors[fieldKey] = language === "es"
              ? "Este campo es requerido"
              : "This field is required";
          }
        }
      }

      setCustomFieldErrors(fieldErrors);

      if (missingFields.length > 0) {
        toast({
          title: language === "es" ? "Campos requeridos" : "Required Fields",
          description: language === "es"
            ? `Por favor complete: ${missingFields.join(", ")}`
            : `Please complete: ${missingFields.join(", ")}`,
          variant: "destructive",
        });
        // Scroll to first field with an error
        const firstErrorKey = Object.keys(fieldErrors)[0];
        if (firstErrorKey) {
          const el = document.querySelector(`[data-field-key="${firstErrorKey}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        return;
      }
    } else {
      setCustomFieldErrors({});
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
    setVerificationSessionToken(null); // Clear session token for security
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
    
    // Get custom thank you text from event (used for both CMS and default thank you pages)
    const customQrInstructions = language === "es"
      ? ((event as any).thankYouQrInstructionsEs || (event as any).thankYouQrInstructions || "Muestra este código en el registro para entrada rápida")
      : ((event as any).thankYouQrInstructions || "Show this code at check-in for fast entry");

    // Use CMS thank_you section if available
    if (thankYouSection) {
      const content = thankYouSection.content as ThankYouSectionContent;
      return (
        <div className="min-h-screen bg-background">
          {renderHeader()}
          <ThankYouSection content={content} />
          <div className="max-w-md mx-auto p-6 text-center space-y-6">
            {completedRegistrationId && (
              <div className="flex flex-col items-center gap-3">
                <h3 className="text-sm font-medium text-foreground">
                  {language === "es" ? "Tu Código QR de Registro" : "Your Check-In QR Code"}
                </h3>
                <RegistrationQRCode 
                  registrationId={completedRegistrationId}
                  eventName={eventName}
                  size={180}
                  showDownload={true}
                />
                <p className="text-xs text-muted-foreground">
                  {customQrInstructions}
                </p>
              </div>
            )}
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
    
    // Default thank you page - use custom text from event if available
    const thankYouHeadline = language === "es"
      ? ((event as any).thankYouHeadlineEs || (event as any).thankYouHeadline || t("registrationSuccess"))
      : ((event as any).thankYouHeadline || t("registrationSuccess"));
    
    const thankYouMessage = language === "es"
      ? ((event as any).thankYouMessageEs || (event as any).thankYouMessage || "Su registro ha sido completado. Recibira un correo de confirmacion pronto.")
      : ((event as any).thankYouMessage || "Your registration has been completed. You will receive a confirmation email shortly.");

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
              <h2 className="text-2xl font-semibold mb-2 text-foreground">{thankYouHeadline}</h2>
              <p className="text-muted-foreground mb-4">
                {thankYouMessage}
              </p>
              
              {completedRegistrationId && (
                <div className="my-6 py-6 border-t border-b">
                  <h3 className="text-sm font-medium text-foreground mb-4">
                    {language === "es" ? "Tu Código QR de Registro" : "Your Check-In QR Code"}
                  </h3>
                  <RegistrationQRCode 
                    registrationId={completedRegistrationId}
                    eventName={eventName}
                    size={180}
                    showDownload={true}
                  />
                  <p className="text-xs text-muted-foreground mt-3">
                    {customQrInstructions}
                  </p>
                </div>
              )}
              
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

  const renderRegistrationClosed = () => {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-foreground">
            {language === "es" ? "Registro Cerrado" : "Registration Closed"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {language === "es"
              ? "El registro para este evento ya no está disponible."
              : "Registration for this event is no longer available."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  };

  // Verification step UI
  const renderVerificationStep = () => {
    if ((event as any)?.registrationClosedAt) {
      return renderRegistrationClosed();
    }

    // For qualified_verified mode, if user failed qualification, show the not qualified message
    if (qualifiedVerifiedMode && qualificationChecked && !isQualified) {
      return renderNotQualifiedMessage();
    }

    if (verificationStep === "email") {
      return (
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
            {/* For qualified_verified mode: Email OR Distributor ID (at least one required) */}
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
                setVerificationSessionToken(null); // Clear session token for security
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

  // Not qualified message with helpful guidance
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
              : <>If you're having issues, <a href={`mailto:${contactEmail}`} className="text-primary underline hover:no-underline">contact us</a>.</>}
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

  // Main content renderer - decides what to show based on verification state
  const renderMainContent = () => {
    // Check registration closed FIRST - before any verification or form rendering
    if ((event as any)?.registrationClosedAt) {
      return renderRegistrationClosed();
    }

    // CRITICAL GUARD for qualified_verified mode:
    // Form MUST NOT render until BOTH qualification AND OTP are verified
    if (qualifiedVerifiedMode && !skipVerification) {
      // If qualification check failed, show not qualified message
      if (qualificationChecked && !isQualified) {
        return renderNotQualifiedMessage();
      }
      
      // If not yet at form step (still on email or otp), show verification step
      if (verificationStep !== "form") {
        return renderVerificationStep();
      }
      
      // If at form step but no verified profile, something went wrong - show email step
      if (!verifiedProfile) {
        return renderVerificationStep();
      }
    }
    
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

  const renderFormCard = () => {
    // Guard: ensure event form fields are loaded before rendering full form
    // This prevents rendering an incomplete form during state transitions
    const formFieldsLoaded = event?.formFields && Array.isArray(event.formFields);
    if (!formFieldsLoaded) {
      console.log("[RegistrationPage] Waiting for formFields to load...", { eventExists: !!event, formFields: event?.formFields });
      return (
        <Card>
          <CardHeader>
            <CardTitle>{getCtaLabel()}</CardTitle>
            <CardDescription>
              {language === "es"
                ? "Cargando formulario de registro..."
                : "Loading registration form..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </CardContent>
        </Card>
      );
    }
    
    return (
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
          <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
            // Scroll to first field with a validation error
            const firstErrorField = Object.keys(errors)[0];
            if (firstErrorField) {
              const el = document.querySelector(`[name="${firstErrorField}"]`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          })} className="space-y-6">
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

              {/* Show QR code for already registered users */}
              {existingRegistrationId && verifiedProfile && (
                <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <QrCode className="w-4 h-4" />
                      {language === "es" ? "Tu Código de Registro" : "Your Check-In Code"}
                    </div>
                    <RegistrationQRCode 
                      registrationId={existingRegistrationId}
                      eventName={language === "es" && event?.nameEs ? event.nameEs : event?.name || "Event"}
                      size={160}
                      showDownload={true}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {language === "es" 
                        ? "Muestra este código en el registro para entrada rápida"
                        : "Show this code at check-in for fast entry"}
                    </p>
                  </div>
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
              console.log("[RegistrationPage] Custom fields section render:", {
                eventExists: !!event,
                formFieldsType: typeof event?.formFields,
                formFieldsLength: Array.isArray(event?.formFields) ? event.formFields.length : 'not-array',
                formFieldsRaw: event?.formFields,
              });
              const customFields = getCustomOnlyFields(event?.formFields as any[]);
              console.log("[RegistrationPage] Custom fields filtered:", customFields.length, customFields.map(f => f.name));
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
                    const fieldError = customFieldErrors[fieldKey];
                    const errorBorderClass = fieldError ? "border-destructive ring-destructive" : "";

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

                    // Helper to clear this field's error on change
                    const clearError = () => {
                      if (fieldError) {
                        setCustomFieldErrors(prev => {
                          const next = { ...prev };
                          delete next[fieldKey];
                          return next;
                        });
                      }
                    };

                    return (
                      <div key={fieldKey} className="space-y-2" data-field-key={fieldKey}>
                        <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${fieldError ? "text-destructive" : ""}`}>
                          {fieldLabel}{isRequired && " *"}
                        </label>

                        {field.type === "text" && (
                          <Input
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value })); }}
                            className={errorBorderClass}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}

                        {field.type === "email" && (
                          <Input
                            type="email"
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value })); }}
                            className={errorBorderClass}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}

                        {field.type === "phone" && (
                          <PhoneInput
                            international
                            defaultCountry="US"
                            value={customFormData[fieldKey] || ""}
                            onChange={(value) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: value })); }}
                            className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-sm ${fieldError ? "border-destructive" : "border-input"}`}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}

                        {field.type === "number" && (
                          <Input
                            type="number"
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value })); }}
                            className={errorBorderClass}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}

                        {field.type === "date" && (
                          <Input
                            type="date"
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value })); }}
                            className={errorBorderClass}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}

                        {field.type === "textarea" && (
                          <Textarea
                            placeholder={fieldPlaceholder}
                            value={customFormData[fieldKey] || ""}
                            onChange={(e) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: e.target.value })); }}
                            className={errorBorderClass}
                            required={isRequired}
                            data-testid={`input-custom-${fieldKey}`}
                          />
                        )}

                        {field.type === "select" && field.options && (
                          <Select
                            value={customFormData[fieldKey] || ""}
                            onValueChange={(value) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: value })); }}
                          >
                            <SelectTrigger data-testid={`select-custom-${fieldKey}`} className={errorBorderClass}>
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
                              onCheckedChange={(checked) => { clearError(); setCustomFormData(prev => ({ ...prev, [fieldKey]: checked })); }}
                              className={fieldError ? "border-destructive data-[state=unchecked]:border-destructive" : ""}
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
                              clearError();
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
                            className={`space-y-2 ${fieldError ? "rounded-md border border-destructive p-3" : ""}`}
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

                        {fieldError && (
                          <p className="text-sm font-medium text-destructive">{fieldError}</p>
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

            {existingRegistrationId && (
              <Button
                type="button"
                variant="outline"
                className="w-full mt-3 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setShowCancelDialog(true)}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel-registration"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  language === "es" ? "Cancelar Registro" : "Cancel Registration"
                )}
              </Button>
            )}
          </form>
        </Form>

        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                {language === "es" ? "Cancelar Registro" : "Cancel Registration"}
              </DialogTitle>
              <DialogDescription>
                {language === "es"
                  ? "¿Está seguro de que desea cancelar su registro para este evento? Esta acción no se puede deshacer."
                  : "Are you sure you want to cancel your registration for this event? This action cannot be undone."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setShowCancelDialog(false)}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel-dialog-no"
              >
                {language === "es" ? "No, mantener registro" : "No, keep registration"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel-dialog-yes"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {language === "es" ? "Sí, cancelar registro" : "Yes, cancel registration"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
    );
  };

  // OTP Verification Dialog for open_verified mode
  // Use pendingSubmissionData.email as primary source (set before dialog opens)
  // Falls back to verificationEmail for consistency
  const dialogEmail = pendingSubmissionData?.email || verificationEmail;
  
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
              ? `Ingrese el código de 6 dígitos enviado a ${dialogEmail}`
              : `Enter the 6-digit code sent to ${dialogEmail}`}
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
            variant="ghost"
            onClick={() => handleOpenVerifiedSendOtp(dialogEmail)}
            disabled={isVerifying || !dialogEmail}
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

  // Handle lookup OTP send for already registered users
  const handleLookupSendOtp = async () => {
    if (!lookupEmail) return;
    
    setIsSendingLookupOtp(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/generate", {
        email: lookupEmail,
        eventId: params.eventId,
      });
      const data = await res.json();
      
      if (data.sent) {
        setLookupStep("otp");
        toast({
          title: language === "es" ? "Código enviado" : "Code sent",
          description: language === "es" 
            ? `Se envió un código de verificación a ${lookupEmail}`
            : `A verification code was sent to ${lookupEmail}`,
        });
      }
    } catch (error: any) {
      let errorMessage = language === "es" ? "No se pudo enviar el código" : "Failed to send code";
      if (error.message) {
        try {
          const jsonMatch = error.message.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || errorMessage;
          }
        } catch { }
      }
      toast({
        title: language === "es" ? "Error" : "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSendingLookupOtp(false);
    }
  };

  // Handle lookup OTP verify and redirect to check-in code
  const handleLookupVerifyOtp = async () => {
    if (otpCode.length !== 6) return;
    
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/register/otp/validate", {
        email: lookupEmail,
        code: otpCode,
        eventId: params.eventId,
      });
      const data = await res.json();
      
      if (data.verified) {
        // Close dialog and set verification state
        setShowLookupDialog(false);
        setOtpCode("");
        setLookupStep("email");
        setVerificationEmail(lookupEmail);
        setVerifiedProfile(data.profile);
        setVerifiedByHydra(data.verifiedByHydra || false);
        
        // Store verified email in sessionStorage
        if (params.eventId) {
          sessionStorage.setItem(`reg_verified_email_${params.eventId}`, lookupEmail);
        }
        
        // Force refresh event data to ensure formFields are loaded before showing form
        await queryClient.invalidateQueries({ queryKey: ["/api/events", params.eventId, "public"] });
        
        // Now navigate to form step - the existing registration will be loaded automatically
        setVerificationStep("form");
        
        toast({
          title: language === "es" ? "Verificado" : "Verified",
          description: language === "es" 
            ? "Su correo ha sido verificado. Si ya está registrado, verá sus datos."
            : "Your email has been verified. If you're already registered, you'll see your details.",
        });
      }
    } catch (error: any) {
      let errorMessage = language === "es" ? "Por favor verifica tu código e intenta de nuevo" : "Please check your code and try again";
      if (error.message) {
        try {
          const jsonMatch = error.message.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || errorMessage;
          }
        } catch { }
      }
      toast({
        title: language === "es" ? "Código inválido" : "Invalid Code",
        description: errorMessage,
        variant: "destructive",
      });
      setOtpCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  // Lookup dialog for already registered users in open_verified mode
  const renderLookupDialog = () => (
    <Dialog open={showLookupDialog} onOpenChange={(open) => {
      if (!open) {
        setShowLookupDialog(false);
        setOtpCode("");
        setLookupEmail("");
        setLookupStep("email");
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            {language === "es" ? "Buscar Registro" : "Find Registration"}
          </DialogTitle>
          <DialogDescription>
            {lookupStep === "email"
              ? (language === "es" 
                  ? "Ingrese el correo con el que se registró"
                  : "Enter the email you registered with")
              : (language === "es"
                  ? `Ingrese el código de 6 dígitos enviado a ${lookupEmail}`
                  : `Enter the 6-digit code sent to ${lookupEmail}`)}
          </DialogDescription>
        </DialogHeader>
        
        {lookupStep === "email" ? (
          <div className="flex flex-col gap-4 py-4">
            <Input
              type="email"
              placeholder={language === "es" ? "correo@ejemplo.com" : "email@example.com"}
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              data-testid="input-lookup-email"
            />
            <Button
              onClick={handleLookupSendOtp}
              disabled={isSendingLookupOtp || !lookupEmail}
              data-testid="button-lookup-send-otp"
            >
              {isSendingLookupOtp ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {language === "es" ? "Enviando..." : "Sending..."}
                </>
              ) : (
                language === "es" ? "Enviar código" : "Send code"
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <InputOTP
              value={otpCode}
              onChange={setOtpCode}
              maxLength={6}
              data-testid="input-lookup-otp"
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
              variant="ghost"
              onClick={handleLookupSendOtp}
              disabled={isSendingLookupOtp}
              className="text-sm"
              data-testid="button-lookup-resend"
            >
              {language === "es" ? "Reenviar código" : "Resend code"}
            </Button>
            
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setLookupStep("email");
                  setOtpCode("");
                }}
                className="flex-1"
                data-testid="button-lookup-back"
              >
                {language === "es" ? "Atrás" : "Back"}
              </Button>
              <Button
                onClick={handleLookupVerifyOtp}
                disabled={isVerifying || otpCode.length !== 6}
                className="flex-1"
                data-testid="button-lookup-verify"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {language === "es" ? "Verificando..." : "Verifying..."}
                  </>
                ) : (
                  language === "es" ? "Verificar" : "Verify"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // Standard layout - default, form centered on page
  if (layout === "standard") {
    return (
      <>
      {renderOtpDialog()}
      {renderLookupDialog()}
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
        
        {/* Already registered link - for qualified_verified: scroll to verification, for open_verified: open lookup dialog */}
        {/* Hide when user is already verified and registered (they see QR in form) */}
        {requiresVerification && !openAnonymousMode && !(existingRegistrationId && verifiedProfile) && (
          <div className="max-w-2xl mx-auto px-4 text-center">
            <button 
              onClick={() => {
                if (verificationStep === "email") {
                  // For qualified_verified mode (email step shown), scroll to verification section
                  const section = document.getElementById("verification-section");
                  if (section) {
                    section.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                } else {
                  // For open_verified mode (form shown), open lookup dialog
                  setShowLookupDialog(true);
                }
              }}
              className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto"
              data-testid="link-already-registered"
            >
              <Ticket className="h-4 w-4" />
              {language === "es" 
                ? "¿Ya registrado? Obtén tu código de acceso" 
                : "Already registered? Get your check-in code"}
            </button>
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
      {renderLookupDialog()}
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
                    <a 
                      href={getMapUrl(event.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 whitespace-nowrap hover:text-primary hover:underline transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      data-testid="link-header-location"
                    >
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{event.location}</span>
                    </a>
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
            
            {/* Already registered link for split layout */}
            {/* Hide when user is already verified and registered (they see QR in form) */}
            {requiresVerification && !openAnonymousMode && !(existingRegistrationId && verifiedProfile) && (
              <div className="pt-4 px-6 lg:px-10 text-center bg-background">
                <button 
                  onClick={() => {
                    if (verificationStep === "email") {
                      const section = document.getElementById("verification-section");
                      if (section) {
                        section.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    } else {
                      setShowLookupDialog(true);
                    }
                  }}
                  className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto"
                  data-testid="link-already-registered-split"
                >
                  <Ticket className="h-4 w-4" />
                  {language === "es" 
                    ? "¿Ya registrado? Obtén tu código de acceso" 
                    : "Already registered? Get your check-in code"}
                </button>
              </div>
            )}
            
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

  // If registration is closed, show event info with a "Registration Closed" message instead of the form
  if (event.registrationClosedAt) {
    return (
      <>
        <div className="min-h-screen bg-card">
          {renderHeader()}
          {heroImageUrl && (
            <div 
              className="h-80 md:h-96 bg-cover bg-center relative"
              style={{ backgroundImage: `url(${heroImageUrl})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </div>
          )}
          <div className="bg-card py-10 text-center border-b">
            <div className="max-w-2xl mx-auto px-4">
              <h1 className="text-3xl md:text-4xl font-bold text-[#1a365d] mb-2">
                {getCustomHeading() || getEventName()}
              </h1>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-[#1a365d]/70 mt-4">
                {event.startDate && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{language === "es" ? "Fecha:" : "Date:"}</span>
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
                    <span className="font-semibold">{language === "es" ? "Ubicación:" : "Location:"}</span>
                    <span>{event.location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="bg-gray-50 py-8">
            <div className="max-w-2xl mx-auto px-4">
              {renderRegistrationClosed()}
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

  // Hero-background layout - bright hero image with event info below
  return (
    <>
      {renderOtpDialog()}
      {renderLookupDialog()}
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
                <a 
                  href={getMapUrl(event.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary hover:underline transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  data-testid="link-info-location"
                >
                  {event.location}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Already registered link for hero-background layout */}
      {/* Hide when user is already verified and registered (they see QR in form) */}
      {requiresVerification && !openAnonymousMode && !(existingRegistrationId && verifiedProfile) && (
        <div className="bg-card pb-4 text-center">
          <button 
            onClick={() => {
              if (verificationStep === "email") {
                const section = document.getElementById("verification-section");
                if (section) {
                  section.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              } else {
                setShowLookupDialog(true);
              }
            }}
            className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto"
            data-testid="link-already-registered-hero"
          >
            <Ticket className="h-4 w-4" />
            {language === "es" 
              ? "¿Ya registrado? Obtén tu código de acceso" 
              : "Already registered? Get your check-in code"}
          </button>
        </div>
      )}
      
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
