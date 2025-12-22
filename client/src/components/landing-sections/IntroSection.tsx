import type { IntroSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";
import { Calendar, MapPin } from "lucide-react";

interface IntroSectionProps {
  content: IntroSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: string) => void;
}

export function IntroSection({ content, isEditing, onEdit }: IntroSectionProps) {
  const { language } = useLanguage();
  
  const headline = language === 'es' ? (content.headlineEs || content.headline) : content.headline;
  const subheadline = language === 'es' ? (content.subheadlineEs || content.subheadline) : content.subheadline;
  const eventDetails = language === 'es' ? (content.eventDetailsEs || content.eventDetails) : content.eventDetails;

  return (
    <section 
      className="relative min-h-[300px] flex items-end overflow-hidden"
      data-testid="section-intro"
    >
      {content.backgroundImage && (
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${content.backgroundImage})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" />
      
      <div className="relative z-10 w-full px-6 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          {headline && (
            <h1 
              className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight"
              data-testid="intro-headline"
            >
              {headline}
            </h1>
          )}
          
          {subheadline && (
            <p 
              className="text-lg md:text-xl text-white/90 mb-4 max-w-2xl"
              data-testid="intro-subheadline"
            >
              {subheadline}
            </p>
          )}
          
          {eventDetails && (
            <p 
              className="text-base text-white/80"
              data-testid="intro-event-details"
            >
              {eventDetails}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
