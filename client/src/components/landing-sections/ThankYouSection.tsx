import type { ThankYouSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";
import { CheckCircle } from "lucide-react";

interface ThankYouSectionProps {
  content: ThankYouSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: string) => void;
}

export function ThankYouSection({ content, isEditing, onEdit }: ThankYouSectionProps) {
  const { language } = useLanguage();
  
  const headline = language === 'es' ? (content.headlineEs || content.headline) : content.headline;
  const message = language === 'es' ? (content.messageEs || content.message) : content.message;
  const additionalInfo = language === 'es' ? (content.additionalInfoEs || content.additionalInfo) : content.additionalInfo;

  return (
    <section 
      className="relative min-h-[400px] flex items-center justify-center overflow-hidden"
      data-testid="section-thank-you"
    >
      {content.backgroundImage && (
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${content.backgroundImage})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />
      
      <div className="relative z-10 text-center max-w-2xl mx-auto px-6 py-12">
        <div className="mb-6">
          <CheckCircle className="h-16 w-16 text-green-400 mx-auto" />
        </div>
        
        {headline && (
          <h1 
            className="text-3xl md:text-4xl font-bold text-white mb-4"
            data-testid="thank-you-headline"
          >
            {headline}
          </h1>
        )}
        
        {message && (
          <p 
            className="text-lg text-white/90 mb-6"
            data-testid="thank-you-message"
          >
            {message}
          </p>
        )}
        
        {additionalInfo && (
          <p 
            className="text-base text-white/70"
            data-testid="thank-you-additional-info"
          >
            {additionalInfo}
          </p>
        )}
      </div>
    </section>
  );
}
