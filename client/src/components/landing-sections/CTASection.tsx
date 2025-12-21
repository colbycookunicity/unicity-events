import { Button } from "@/components/ui/button";
import type { CTASectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

interface CTASectionProps {
  content: CTASectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: string) => void;
}

export function CTASection({ content, isEditing, onEdit }: CTASectionProps) {
  const { language } = useLanguage();
  
  const headline = language === 'es' ? (content.headlineEs || content.headline) : content.headline;
  const subheadline = language === 'es' ? (content.subheadlineEs || content.subheadline) : content.subheadline;
  const buttonLabel = language === 'es' ? (content.buttonLabelEs || content.buttonLabel) : content.buttonLabel;

  return (
    <section 
      className="py-20 px-6 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
      data-testid="section-cta"
    >
      <div className="max-w-4xl mx-auto text-center">
        {headline && (
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="cta-headline">
            {headline}
          </h2>
        )}
        
        {subheadline && (
          <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto" data-testid="cta-subheadline">
            {subheadline}
          </p>
        )}
        
        {buttonLabel && (
          <Button 
            size="lg"
            variant="secondary"
            className="font-semibold px-8"
            data-testid="cta-button"
          >
            {buttonLabel}
          </Button>
        )}
      </div>
    </section>
  );
}
