import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SpeakersSectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

interface SpeakersSectionProps {
  content: SpeakersSectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: unknown) => void;
}

export function SpeakersSection({ content, isEditing, onEdit }: SpeakersSectionProps) {
  const { language } = useLanguage();
  
  const title = language === 'es' ? (content.titleEs || content.title) : content.title;
  const speakers = content.speakers || [];

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <section className="py-16 px-6" data-testid="section-speakers">
      <div className="max-w-6xl mx-auto">
        {title && (
          <h2 className="text-3xl font-bold text-center mb-12" data-testid="speakers-title">
            {title}
          </h2>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {speakers.map((speaker, index) => {
            const bio = language === 'es' ? (speaker.bioEs || speaker.bio) : speaker.bio;
            
            return (
              <Card key={index} className="overflow-visible" data-testid={`speaker-card-${index}`}>
                <CardContent className="p-6 text-center">
                  <Avatar className="h-24 w-24 mx-auto mb-4">
                    <AvatarImage src={speaker.headshot} alt={speaker.name} />
                    <AvatarFallback className="text-2xl">
                      {getInitials(speaker.name)}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="font-semibold text-lg">{speaker.name}</h3>
                  {speaker.title && (
                    <p className="text-sm text-muted-foreground mb-2">{speaker.title}</p>
                  )}
                  {bio && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{bio}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          
          {speakers.length === 0 && !isEditing && (
            <div className="col-span-full text-center text-muted-foreground py-8">
              Speakers coming soon
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
