import type { StatsSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

interface StatsSectionProps {
  content: StatsSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: unknown) => void;
}

export function StatsSection({ content, isEditing, onEdit }: StatsSectionProps) {
  const { language } = useLanguage();
  
  const title = language === 'es' ? (content.titleEs || content.title) : content.title;
  const stats = content.stats || [];

  return (
    <section className="py-16 px-6 bg-primary text-primary-foreground" data-testid="section-stats">
      <div className="max-w-6xl mx-auto">
        {title && (
          <h2 className="text-3xl font-bold text-center mb-12" data-testid="stats-title">
            {title}
          </h2>
        )}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => {
            const label = language === 'es' ? (stat.labelEs || stat.label) : stat.label;
            
            return (
              <div key={index} className="text-center" data-testid={`stat-item-${index}`}>
                <div className="text-4xl md:text-5xl font-bold mb-2">{stat.value}</div>
                <div className="text-sm md:text-base opacity-80">{label}</div>
              </div>
            );
          })}
          
          {stats.length === 0 && !isEditing && (
            <div className="col-span-full text-center opacity-80 py-4">
              Add statistics to showcase
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
