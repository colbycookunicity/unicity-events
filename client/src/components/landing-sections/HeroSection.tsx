import { Button } from "@/components/ui/button";
import type { HeroSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

interface HeroSectionProps {
  content: HeroSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: string) => void;
}

export function HeroSection({ content, isEditing, onEdit }: HeroSectionProps) {
  const { language } = useLanguage();
  
  const headline = language === 'es' ? (content.headlineEs || content.headline) : content.headline;
  const subheadline = language === 'es' ? (content.subheadlineEs || content.subheadline) : content.subheadline;
  const primaryCtaLabel = language === 'es' ? (content.primaryCtaLabelEs || content.primaryCtaLabel) : content.primaryCtaLabel;
  const secondaryCtaLabel = language === 'es' ? (content.secondaryCtaLabelEs || content.secondaryCtaLabel) : content.secondaryCtaLabel;

  return (
    <section 
      className="relative min-h-[500px] flex items-center justify-center overflow-hidden"
      data-testid="section-hero"
    >
      {content.backgroundImage && (
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${content.backgroundImage})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/60" />
      
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6 py-20">
        {headline && (
          <h1 
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight"
            data-testid="hero-headline"
          >
            {headline}
          </h1>
        )}
        
        {subheadline && (
          <p 
            className="text-xl md:text-2xl text-white/90 mb-8 max-w-2xl mx-auto"
            data-testid="hero-subheadline"
          >
            {subheadline}
          </p>
        )}
        
        <div className="flex flex-wrap gap-4 justify-center">
          {primaryCtaLabel && (
            <Button 
              size="lg" 
              className="bg-white text-black hover:bg-white/90 font-semibold px-8"
              data-testid="hero-primary-cta"
            >
              {primaryCtaLabel}
            </Button>
          )}
          {secondaryCtaLabel && (
            <Button 
              size="lg" 
              variant="outline"
              className="border-white text-white bg-white/10 backdrop-blur-sm hover:bg-white/20 font-semibold px-8"
              data-testid="hero-secondary-cta"
            >
              {secondaryCtaLabel}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
