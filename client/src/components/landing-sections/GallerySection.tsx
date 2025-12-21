import type { GallerySectionContent } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

interface GallerySectionProps {
  content: GallerySectionContent;
  isEditing?: boolean;
  onEdit?: (field: string, value: unknown) => void;
}

export function GallerySection({ content, isEditing, onEdit }: GallerySectionProps) {
  const { language } = useLanguage();
  
  const title = language === 'es' ? (content.titleEs || content.title) : content.title;
  const images = content.images || [];

  return (
    <section className="py-16 px-6 bg-muted/30" data-testid="section-gallery">
      <div className="max-w-6xl mx-auto">
        {title && (
          <h2 className="text-3xl font-bold text-center mb-12" data-testid="gallery-title">
            {title}
          </h2>
        )}
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image, index) => {
            const caption = language === 'es' ? (image.captionEs || image.caption) : image.caption;
            
            return (
              <div 
                key={index}
                className="aspect-square rounded-md overflow-hidden"
                data-testid={`gallery-image-${index}`}
              >
                <img 
                  src={image.url}
                  alt={caption || ''}
                  className="w-full h-full object-cover"
                />
              </div>
            );
          })}
          
          {images.length === 0 && !isEditing && (
            <div className="col-span-full text-center text-muted-foreground py-8">
              Gallery images coming soon
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
