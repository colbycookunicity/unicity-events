import { Card, CardContent } from "@/components/ui/card";
import type { AgendaSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";
import { Clock } from "lucide-react";

interface AgendaSectionProps {
  content: AgendaSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: unknown) => void;
}

export function AgendaSection({ content, isEditing, onEdit }: AgendaSectionProps) {
  const { language } = useLanguage();
  
  const title = language === 'es' ? (content.titleEs || content.title) : content.title;
  const items = content.items || [];

  return (
    <section className="py-16 px-6 bg-muted/30" data-testid="section-agenda">
      <div className="max-w-4xl mx-auto">
        {title && (
          <h2 className="text-3xl font-bold text-center mb-12" data-testid="agenda-title">
            {title}
          </h2>
        )}
        
        <div className="space-y-4">
          {items.map((item, index) => {
            const itemLabel = language === 'es' ? (item.labelEs || item.label) : item.label;
            const itemDescription = language === 'es' ? (item.descriptionEs || item.description) : item.description;
            
            return (
              <Card key={index} className="overflow-visible" data-testid={`agenda-item-${index}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {item.time && (
                      <div className="flex items-center gap-2 text-muted-foreground shrink-0 min-w-[120px]">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium">{item.time}</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{itemLabel}</h3>
                      {itemDescription && (
                        <p className="text-muted-foreground">{itemDescription}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          
          {items.length === 0 && !isEditing && (
            <p className="text-center text-muted-foreground py-8">
              Schedule coming soon
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
