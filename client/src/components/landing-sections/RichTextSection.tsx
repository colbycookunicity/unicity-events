import type { RichTextSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

interface RichTextSectionProps {
  content: RichTextSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: string) => void;
}

export function RichTextSection({ content, isEditing, onEdit }: RichTextSectionProps) {
  const { language } = useLanguage();
  
  const title = language === 'es' ? (content.titleEs || content.title) : content.title;
  const body = language === 'es' ? (content.contentEs || content.content) : content.content;

  return (
    <section className="py-16 px-6" data-testid="section-richtext">
      <div className="max-w-3xl mx-auto prose dark:prose-invert">
        {title && (
          <h2 className="text-3xl font-bold text-center mb-8" data-testid="richtext-title">
            {title}
          </h2>
        )}
        
        {body && (
          <div 
            className="text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: body }}
            data-testid="richtext-body"
          />
        )}
        
        {!body && !isEditing && (
          <p className="text-center text-muted-foreground">
            Add content here
          </p>
        )}
      </div>
    </section>
  );
}
