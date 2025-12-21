import type { EventPageSection, PageSectionContent } from "@shared/schema";
import { HeroSection } from "./HeroSection";
import { AgendaSection } from "./AgendaSection";
import { SpeakersSection } from "./SpeakersSection";
import { StatsSection } from "./StatsSection";
import { CTASection } from "./CTASection";
import { FAQSection } from "./FAQSection";
import { RichTextSection } from "./RichTextSection";
import { GallerySection } from "./GallerySection";

export {
  HeroSection,
  AgendaSection,
  SpeakersSection,
  StatsSection,
  CTASection,
  FAQSection,
  RichTextSection,
  GallerySection,
};

export type SectionType = 
  | 'hero'
  | 'agenda'
  | 'speakers'
  | 'stats'
  | 'cta'
  | 'faq'
  | 'richtext'
  | 'gallery';

export const SECTION_LABELS: Record<SectionType, { en: string; es: string }> = {
  hero: { en: 'Hero', es: 'Portada' },
  agenda: { en: 'Agenda', es: 'Agenda' },
  speakers: { en: 'Speakers', es: 'Ponentes' },
  stats: { en: 'Stats', es: 'Estadísticas' },
  cta: { en: 'Call to Action', es: 'Llamada a la Acción' },
  faq: { en: 'FAQ', es: 'Preguntas Frecuentes' },
  richtext: { en: 'Rich Text', es: 'Texto Enriquecido' },
  gallery: { en: 'Gallery', es: 'Galería' },
};

interface SectionRendererProps {
  section: EventPageSection;
  isEditing?: boolean;
  onEditContent?: (sectionId: string, field: string, value: unknown) => void;
}

export function SectionRenderer({ section, isEditing, onEditContent }: SectionRendererProps) {
  const content = section.content as PageSectionContent;
  
  const handleEdit = (field: string, value: unknown) => {
    onEditContent?.(section.id, field, value);
  };

  switch (section.type) {
    case 'hero':
      return <HeroSection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    case 'agenda':
      return <AgendaSection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    case 'speakers':
      return <SpeakersSection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    case 'stats':
      return <StatsSection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    case 'cta':
      return <CTASection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    case 'faq':
      return <FAQSection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    case 'richtext':
      return <RichTextSection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    case 'gallery':
      return <GallerySection content={content as any} isEditing={isEditing} onEdit={handleEdit} />;
    default:
      return (
        <div className="py-8 text-center text-muted-foreground">
          Unknown section type: {section.type}
        </div>
      );
  }
}
