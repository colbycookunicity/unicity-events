import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslation } from "@/lib/i18n";
import unicityIcon from "@/assets/unicity-logo.png";
import { format, parseISO } from "date-fns";
import type { Event } from "@shared/schema";

const parseLocalDate = (dateStr: string | Date | null | undefined) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === "string" && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return parseISO(dateStr + "T12:00:00");
  }
  return new Date(dateStr);
};

export interface EventListPageProps {
  showNotFoundMessage?: boolean;
  notFoundSlug?: string;
}

export default function EventListPage({ showNotFoundMessage = false, notFoundSlug }: EventListPageProps = {}) {
  const { language } = useTranslation();

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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <img 
            src={unicityIcon} 
            alt="Unicity" 
            className="h-8 w-auto"
            data-testid="img-header-logo"
          />
          <LanguageToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {showNotFoundMessage && (
          <Card className="mb-8 border-amber-200 bg-amber-50" data-testid="card-event-not-found">
            <CardContent className="p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-amber-900 mb-2" data-testid="text-event-not-available">
                {language === "es" ? "Evento no disponible" : "Event Not Available"}
              </h2>
              <p className="text-amber-700">
                {language === "es" 
                  ? "Este evento ya no esta disponible o el enlace no es valido. Explore nuestros eventos activos a continuacion."
                  : "This event is no longer available or the link is invalid. Explore our active events below."}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3" data-testid="text-page-title">
            {language === "es" ? "Proximos Eventos" : "Upcoming Events"}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {language === "es" 
              ? "Descubra y registrese para los eventos exclusivos de Unicity"
              : "Discover and register for exclusive Unicity events"}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
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
            {events.map((event) => (
              <Card 
                key={event.id} 
                className="overflow-hidden hover-elevate transition-shadow"
                data-testid={`card-event-${event.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-semibold text-slate-900 mb-2" data-testid={`text-event-name-${event.id}`}>
                        {getEventName(event)}
                      </h3>
                      {getEventDescription(event) && (
                        <p className="text-slate-600 mb-3 line-clamp-2">
                          {getEventDescription(event)}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
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
                      <Link href={`/register/${event.id}`}>
                        <Button data-testid={`button-register-${event.id}`}>
                          {language === "es" ? "Registrarse" : "Register"}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                {language === "es" ? "No hay eventos disponibles" : "No Events Available"}
              </h3>
              <p className="text-slate-500">
                {language === "es" 
                  ? "No hay eventos activos en este momento. Vuelva pronto."
                  : "There are no active events at this time. Check back soon."}
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-white py-6">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} Unicity International. {language === "es" ? "Todos los derechos reservados." : "All rights reserved."}</p>
        </div>
      </footer>
    </div>
  );
}
