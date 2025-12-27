import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, MapPin, ArrowRight, Sparkles, LogOut, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import unicityLogoDark from "@/assets/unicity-logo-dark.png";
import unicityLogoWhite from "@/assets/unicity-logo-white.png";
import { format, parseISO } from "date-fns";
import type { Event } from "@shared/schema";

const ATTENDEE_TOKEN_KEY = "attendeeAuthToken";
const ATTENDEE_EMAIL_KEY = "attendeeEmail";

const parseLocalDate = (dateStr: string | Date | null | undefined) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === "string" && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return parseISO(dateStr + "T12:00:00");
  }
  return new Date(dateStr);
};

// Strip HTML tags for plain text preview
const stripHtml = (html: string | null | undefined): string => {
  if (!html) return "";
  // Create a temporary element to parse HTML and extract text
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

interface AttendeeEventInfo {
  eventId: string;
  registrationStatus: "registered" | "not_registered";
}

export interface EventListPageProps {
  showNotFoundMessage?: boolean;
  notFoundSlug?: string;
}

export default function EventListPage({ showNotFoundMessage = false, notFoundSlug }: EventListPageProps = {}) {
  const { language } = useTranslation();
  const { theme } = useTheme();
  const unicityLogo = theme === 'dark' ? unicityLogoWhite : unicityLogoDark;
  
  const [attendeeToken, setAttendeeToken] = useState<string | null>(null);
  const [attendeeEmail, setAttendeeEmail] = useState<string | null>(null);
  const [attendeeEvents, setAttendeeEvents] = useState<AttendeeEventInfo[]>([]);

  // Check for existing attendee session
  useEffect(() => {
    const token = localStorage.getItem(ATTENDEE_TOKEN_KEY);
    const email = localStorage.getItem(ATTENDEE_EMAIL_KEY);
    if (token && email) {
      setAttendeeToken(token);
      setAttendeeEmail(email);
      
      // Fetch attendee's events to know registration status
      fetch("/api/attendee/events", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.events) {
            setAttendeeEvents(data.events.map((e: any) => ({
              eventId: e.id,
              registrationStatus: e.registrationStatus,
            })));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(ATTENDEE_TOKEN_KEY);
    localStorage.removeItem(ATTENDEE_EMAIL_KEY);
    setAttendeeToken(null);
    setAttendeeEmail(null);
    setAttendeeEvents([]);
  };

  const getRegistrationStatus = (eventId: string) => {
    return attendeeEvents.find(e => e.eventId === eventId)?.registrationStatus;
  };

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events/public"],
  });

  const getEventName = (event: Event) => {
    if (language === "es" && event.nameEs) {
      return event.nameEs;
    }
    return event.name;
  };

  const getEventDescription = (event: Event) => {
    if (language === "es" && event.descriptionEs) {
      return event.descriptionEs;
    }
    return event.description;
  };

  const formatDateRange = (event: Event) => {
    if (!event.startDate) return null;
    const start = parseLocalDate(event.startDate);
    if (!start) return null;
    
    const startFormatted = format(start, "MMM d, yyyy");
    
    if (event.endDate && event.endDate !== event.startDate) {
      const end = parseLocalDate(event.endDate);
      if (end) {
        return `${format(start, "MMM d")} - ${format(end, "d, yyyy")}`;
      }
    }
    
    return startFormatted;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <img 
            src={unicityLogo} 
            alt="Unicity" 
            className="h-8 object-contain"
            data-testid="img-header-logo"
          />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            {attendeeToken && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {showNotFoundMessage && (
          <Card className="mb-8 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950" data-testid="card-event-not-found">
            <CardContent className="p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-100 mb-2" data-testid="text-event-not-available">
                {language === "es" ? "Evento no disponible" : "Event Not Available"}
              </h2>
              <p className="text-amber-700 dark:text-amber-300">
                {language === "es" 
                  ? "Este evento ya no esta disponible o el enlace no es valido. Explore nuestros eventos activos a continuacion."
                  : "This event is no longer available or the link is invalid. Explore our active events below."}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3" data-testid="text-page-title">
            {language === "es" ? "Proximos Eventos" : "Upcoming Events"}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {language === "es" 
              ? "Descubra y registrese para los eventos exclusivos de Unicity"
              : "Discover and register for exclusive Unicity events"}
          </p>
          {attendeeEmail && (
            <p className="text-sm text-muted-foreground mt-2">
              {language === "es" ? "Sesión activa:" : "Logged in as:"} {attendeeEmail}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-7 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <div className="flex gap-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                    </div>
                    <Skeleton className="h-10 w-32" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : events && events.length > 0 ? (
          <div className="space-y-4">
            {events.map((event) => {
              const status = getRegistrationStatus(event.id);
              const isRegistered = status === "registered";
              
              return (
                <Card 
                  key={event.id} 
                  className="overflow-visible"
                  data-testid={`card-event-${event.id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                          <h3 className="text-xl font-semibold" data-testid={`text-event-name-${event.id}`}>
                            {getEventName(event)}
                          </h3>
                          {isRegistered && (
                            <Badge variant="default" className="flex-shrink-0">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {language === "es" ? "Registrado" : "Registered"}
                            </Badge>
                          )}
                        </div>
                        {getEventDescription(event) && (
                          <p className="text-muted-foreground mb-3 line-clamp-2">
                            {stripHtml(getEventDescription(event))}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          {event.startDate && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4" />
                              {formatDateRange(event)}
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
                      <div className="flex-shrink-0">
                        <Link href={`/register/${event.slug || event.id}`}>
                          <Button 
                            variant={isRegistered ? "outline" : "default"}
                            data-testid={`button-register-${event.id}`}
                          >
                            {isRegistered 
                              ? (language === "es" ? "Ver / Editar" : "View / Edit")
                              : (language === "es" ? "Registrarse" : "Register")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                {language === "es" ? "No hay eventos disponibles" : "No Events Available"}
              </h3>
              <p className="text-muted-foreground">
                {language === "es" 
                  ? "No hay eventos activos en este momento. Vuelva pronto."
                  : "There are no active events at this time. Check back soon."}
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="py-8 mt-auto">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Unicity International. {language === "es" ? "Todos los derechos reservados." : "All rights reserved."}</p>
        </div>
      </footer>
    </div>
  );
}
