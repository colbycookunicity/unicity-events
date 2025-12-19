import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle, Calendar, MapPin, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Event, RegistrationSettings } from "@shared/schema";

type PublicEvent = Event & {
  formFields?: any;
  registrationSettings?: RegistrationSettings;
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

const registrationSchema = z.object({
  unicityId: z.string().min(1, "Distributor ID is required"),
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  gender: z.enum(["female", "male"], { required_error: "Gender is required" }),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  passportNumber: z.string().min(1, "Passport number is required"),
  passportCountry: z.string().min(1, "Passport country is required"),
  passportExpiration: z.string().min(1, "Passport expiration is required"),
  emergencyContact: z.string().min(1, "Emergency contact name is required"),
  emergencyContactPhone: z.string().min(1, "Emergency contact phone is required"),
  shirtSize: z.string().min(1, "T-shirt size is required"),
  pantSize: z.string().min(1, "Pant size is required"),
  dietaryRestrictions: z.array(z.string()).default([]),
  adaAccommodations: z.boolean().default(false),
  roomType: z.string().min(1, "Room type is required"),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the event waiver" }),
  }),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function RegistrationPage() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const params = useParams<{ eventId: string }>();
  const [isSuccess, setIsSuccess] = useState(false);

  // Parse URL query params for pre-population
  const urlParams = new URLSearchParams(window.location.search);
  const prePopulatedUnicityId = urlParams.get("uid") || urlParams.get("unicityId") || "";
  const prePopulatedEmail = urlParams.get("email") || "";
  const prePopulatedFirstName = urlParams.get("firstName") || "";
  const prePopulatedLastName = urlParams.get("lastName") || "";
  const prePopulatedPhone = urlParams.get("phone") || "";
  
  // Unicity ID is locked if it was pre-populated via URL
  const isUnicityIdLocked = Boolean(prePopulatedUnicityId);

  const { data: event, isLoading } = useQuery<PublicEvent>({
    queryKey: ["/api/events", params.eventId, "public"],
  });

  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchHeroImage = async () => {
      const settings = event?.registrationSettings;
      if (settings?.heroImagePath) {
        try {
          const res = await fetch(`/api/objects/public/${settings.heroImagePath}?redirect=false`);
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
  }, [event]);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
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
      termsAccepted: false as unknown as true,
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      return apiRequest("POST", `/api/events/${params.eventId}/register`, {
        ...data,
        language,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : null,
        passportExpiration: data.passportExpiration ? new Date(data.passportExpiration).toISOString() : null,
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

  const getCustomHeading = () => {
    const settings = event?.registrationSettings;
    if (!settings) return null;
    if (language === "es" && settings.headingEs) {
      return settings.headingEs;
    }
    return settings.heading || null;
  };

  const getCustomSubheading = () => {
    const settings = event?.registrationSettings;
    if (!settings) return null;
    if (language === "es" && settings.subheadingEs) {
      return settings.subheadingEs;
    }
    return settings.subheading || null;
  };

  const getCtaLabel = () => {
    const settings = event?.registrationSettings;
    if (!settings) return t("register");
    if (language === "es" && settings.ctaLabelEs) {
      return settings.ctaLabelEs;
    }
    return settings.ctaLabel || t("register");
  };

  const layout = event?.registrationSettings?.layout || "standard";

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

  const renderHeader = () => (
    <header className="flex items-center justify-end gap-2 p-4 absolute top-0 right-0 z-10">
      <LanguageToggle />
      <ThemeToggle />
    </header>
  );

  const renderEventInfo = () => (
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
  );

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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium border-b pb-2">
                {language === "es" ? "Informacion Personal" : "Personal Information"}
              </h3>
              
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
                            ? "Este campo ha sido prellenado y no puede ser editado" 
                            : "This field has been pre-filled and cannot be edited")
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
                      <Input type="email" {...field} data-testid="input-reg-email" />
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
                        <span className="text-xs text-muted-foreground ml-1">
                          ({language === "es" ? "como en pasaporte" : "as shown on passport"})
                        </span>
                      </FormLabel>
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
                      <FormLabel>
                        {t("lastName")} *
                        <span className="text-xs text-muted-foreground ml-1">
                          ({language === "es" ? "como en pasaporte" : "as shown on passport"})
                        </span>
                      </FormLabel>
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "es" ? "Numero de Celular" : "Mobile Number"}</FormLabel>
                    <FormControl>
                      <Input type="tel" {...field} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
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
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "es" ? "Fecha de Nacimiento" : "Date of Birth"} *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-dob" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Passport Information Section */}
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
                        <Input type="date" {...field} data-testid="input-passport-expiration" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Emergency Contact Section */}
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
                        <Input type="tel" {...field} data-testid="input-emergency-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Apparel Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium border-b pb-2">
                {language === "es" ? "Tallas de Ropa" : "Apparel Sizes"}
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
            </div>

            {/* Preferences Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium border-b pb-2">
                {language === "es" ? "Preferencias" : "Preferences"}
              </h3>

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
                          <div
                            key={option.value}
                            className={`flex items-center space-x-2 rounded-md border p-2 cursor-pointer transition-colors ${
                              isSelected ? "bg-primary/10 border-primary" : "hover-elevate"
                            }`}
                            onClick={() => toggleDietaryRestriction(option.value)}
                            data-testid={`dietary-option-${option.value}`}
                          >
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleDietaryRestriction(option.value)}
                            />
                            <span className="text-sm">{getDietaryLabel(option)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

            {/* Terms Section */}
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
  );

  // Standard layout - default, form centered on page
  if (layout === "standard") {
    return (
      <div className="min-h-screen bg-background relative">
        {renderHeader()}
        <div className="max-w-2xl mx-auto p-4 pb-12 pt-16">
          <div className="mb-8 text-center">
            {heroImageUrl && (
              <img 
                src={heroImageUrl} 
                alt="" 
                className="w-full h-48 object-cover rounded-lg mb-6"
              />
            )}
            <h1 className="text-3xl font-semibold tracking-tight mb-2">
              {getCustomHeading() || getEventName()}
            </h1>
            {getCustomSubheading() && (
              <p className="text-muted-foreground mb-4">{getCustomSubheading()}</p>
            )}
            {renderEventInfo()}
          </div>

          {getEventDescription() && !getCustomSubheading() && (
            <Card className="mb-6">
              <CardContent className="p-6">
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: getEventDescription() || "" }}
                />
              </CardContent>
            </Card>
          )}

          {renderFormCard()}

          <footer className="mt-8 text-center text-sm text-muted-foreground">
            Unicity International
          </footer>
        </div>
      </div>
    );
  }

  // Split layout - image on left, form on right (matches Punta Cana design)
  if (layout === "split") {
    return (
      <div className="min-h-screen bg-background flex flex-col lg:flex-row">
        {/* Left side - Hero image with title at bottom (40% width) */}
        <div className="lg:w-[40%] lg:fixed lg:left-0 lg:top-0 lg:h-screen relative bg-[#0f2a42]">
          {heroImageUrl ? (
            <div className="h-64 lg:h-full w-full p-4 lg:p-6 flex flex-col">
              {/* Image container with padding */}
              <div 
                className="flex-1 rounded-lg bg-cover bg-center relative overflow-hidden"
                style={{ backgroundImage: `url(${heroImageUrl})` }}
              >
                {/* Gradient overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {/* Event title positioned at bottom left */}
                <div className="absolute bottom-0 left-0 p-6 lg:p-8">
                  <h1 className="text-xl lg:text-3xl font-bold text-white leading-tight max-w-sm">
                    {getCustomHeading() || getEventName()}
                  </h1>
                  {getCustomSubheading() && (
                    <p className="text-white/90 mt-2">{getCustomSubheading()}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 lg:h-full w-full p-4 lg:p-6 flex flex-col">
              <div className="flex-1 rounded-lg bg-primary/20 flex items-end p-6 lg:p-8">
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
        
        {/* Right side - Form with sticky header (60% width) */}
        <div className="lg:w-[60%] lg:ml-[40%] min-h-screen flex flex-col">
          {/* Sticky header with date, location, and controls */}
          <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b px-6 py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap max-w-xl mx-auto">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {event?.startDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {format(new Date(event.startDate), "MMM d, yyyy")}
                      {event.endDate && ` - ${format(new Date(event.endDate), "MMM d, yyyy")}`}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <ThemeToggle />
              </div>
            </div>
            {event?.location && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
                <MapPin className="w-4 h-4" />
                <span>{event.location}</span>
              </div>
            )}
          </div>
          
          {/* Form content */}
          <div className="flex-1 p-6 lg:p-10 overflow-y-auto">
            <div className="max-w-xl mx-auto">
              {renderFormCard()}
              <footer className="mt-8 pb-8 text-center text-sm text-muted-foreground">
                Unicity International
              </footer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Hero-background layout - full width hero with form overlay
  return (
    <div className="min-h-screen bg-background relative">
      {renderHeader()}
      {heroImageUrl && (
        <div 
          className="h-72 bg-cover bg-center relative"
          style={{ backgroundImage: `url(${heroImageUrl})` }}
        >
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white p-8">
              <h1 className="text-4xl font-bold mb-4">
                {getCustomHeading() || getEventName()}
              </h1>
              {getCustomSubheading() && (
                <p className="text-xl opacity-90">{getCustomSubheading()}</p>
              )}
              <div className="mt-4 text-white/80">
                {renderEventInfo()}
              </div>
            </div>
          </div>
        </div>
      )}
      {!heroImageUrl && (
        <div className="bg-primary py-16 text-center">
          <div className="text-primary-foreground p-8">
            <h1 className="text-4xl font-bold mb-4">
              {getCustomHeading() || getEventName()}
            </h1>
            {getCustomSubheading() && (
              <p className="text-xl opacity-90">{getCustomSubheading()}</p>
            )}
            <div className="mt-4 opacity-80">
              {renderEventInfo()}
            </div>
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto p-4 pb-12 -mt-8 relative z-10">
        {renderFormCard()}
        <footer className="mt-8 text-center text-sm text-muted-foreground">
          Unicity International
        </footer>
      </div>
    </div>
  );
}
