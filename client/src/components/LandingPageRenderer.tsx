import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, EventPage, EventPageSection } from "@shared/schema";
import { SectionRenderer } from "@/components/landing-sections";
import { Loader2 } from "lucide-react";
import { useLanguage, type Language } from "@/lib/i18n";

interface LandingPageData {
  page: EventPage;
  sections: EventPageSection[];
  event: Event;
}

interface LandingPageRendererProps {
  eventSlug: string;
  isPreview?: boolean;
}

export function LandingPageRenderer({ eventSlug, isPreview }: LandingPageRendererProps) {
  const { setLanguage } = useLanguage();
  const languageInitializedRef = useRef(false);
  
  const { data, isLoading, error } = useQuery<LandingPageData>({
    queryKey: ['/api/public/event-pages', eventSlug],
    enabled: !!eventSlug,
  });
  
  // Set initial language from event's defaultLanguage on first load
  useEffect(() => {
    if (data?.event && !languageInitializedRef.current) {
      const eventDefaultLanguage = (data.event as any).defaultLanguage as Language;
      if (eventDefaultLanguage === 'en' || eventDefaultLanguage === 'es') {
        const userHasManuallySelected = localStorage.getItem('language');
        if (!userHasManuallySelected) {
          setLanguage(eventDefaultLanguage);
        }
      }
      languageInitializedRef.current = true;
    }
  }, [data?.event, setLanguage]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground">
            This event page is not available.
          </p>
        </div>
      </div>
    );
  }

  const { page, sections, event } = data;

  const enabledSections = sections
    .filter(s => s.isEnabled)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="min-h-screen" data-testid="landing-page">
      {isPreview && (
        <div className="bg-yellow-500 text-yellow-950 text-center py-2 text-sm font-medium">
          Preview Mode - This page is not yet published
        </div>
      )}
      
      {enabledSections.length === 0 ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">{event.name}</h1>
            <p className="text-muted-foreground">
              Landing page coming soon.
            </p>
          </div>
        </div>
      ) : (
        enabledSections.map((section) => (
          <SectionRenderer 
            key={section.id} 
            section={section}
          />
        ))
      )}
    </div>
  );
}
