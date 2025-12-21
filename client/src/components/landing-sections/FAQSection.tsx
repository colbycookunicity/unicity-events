import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FAQSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

interface FAQSectionProps {
  content: FAQSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: unknown) => void;
}

export function FAQSection({ content, isEditing, onEdit }: FAQSectionProps) {
  const { language } = useLanguage();
  
  const title = language === 'es' ? (content.titleEs || content.title) : content.title;
  const items = content.items || [];

  return (
    <section className="py-16 px-6" data-testid="section-faq">
      <div className="max-w-3xl mx-auto">
        {title && (
          <h2 className="text-3xl font-bold text-center mb-12" data-testid="faq-title">
            {title}
          </h2>
        )}
        
        <Accordion type="single" collapsible className="w-full">
          {items.map((item, index) => {
            const question = language === 'es' ? (item.questionEs || item.question) : item.question;
            const answer = language === 'es' ? (item.answerEs || item.answer) : item.answer;
            
            return (
              <AccordionItem 
                key={index} 
                value={`faq-${index}`}
                data-testid={`faq-item-${index}`}
              >
                <AccordionTrigger className="text-left">
                  {question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
        
        {items.length === 0 && !isEditing && (
          <p className="text-center text-muted-foreground py-8">
            FAQs coming soon
          </p>
        )}
      </div>
    </section>
  );
}
