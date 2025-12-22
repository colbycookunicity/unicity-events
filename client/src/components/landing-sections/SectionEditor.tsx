import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, X, Loader2 } from "lucide-react";
import type { EventPageSection, PageSectionContent, HeroSectionContent, AgendaSectionContent, SpeakersSectionContent, StatsSectionContent, CTASectionContent, FAQSectionContent, RichTextSectionContent, GallerySectionContent, IntroSectionContent, ThankYouSectionContent } from "@shared/schema";
import { SECTION_LABELS, type SectionType } from "./index";

interface SectionEditorProps {
  section: EventPageSection;
  onSave: (content: PageSectionContent) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function SectionEditor({ section, onSave, onCancel, isSaving }: SectionEditorProps) {
  const [content, setContent] = useState<PageSectionContent>(section.content as PageSectionContent || {});
  const sectionType = section.type as SectionType;
  const label = SECTION_LABELS[sectionType]?.en || section.type;

  useEffect(() => {
    setContent(section.content as PageSectionContent || {});
  }, [section.id, section.content]);

  const updateField = (field: string, value: unknown) => {
    setContent((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(content);
  };

  const handleCancel = () => {
    setContent(section.content as PageSectionContent || {});
    onCancel();
  };

  return (
    <Card className="border-primary/50">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <CardTitle className="text-lg">Edit {label}</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleCancel} data-testid="button-cancel-edit">
            <X className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="button-save-section">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="english">
          <TabsList>
            <TabsTrigger value="english">English</TabsTrigger>
            <TabsTrigger value="spanish">Spanish</TabsTrigger>
          </TabsList>
          
          {sectionType === 'hero' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <HeroFields content={content as HeroSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <HeroFields content={content as HeroSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'agenda' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <AgendaFields content={content as AgendaSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <AgendaFields content={content as AgendaSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'speakers' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <SpeakersFields content={content as SpeakersSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <SpeakersFields content={content as SpeakersSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'stats' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <StatsFields content={content as StatsSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <StatsFields content={content as StatsSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'cta' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <CTAFields content={content as CTASectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <CTAFields content={content as CTASectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'faq' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <FAQFields content={content as FAQSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <FAQFields content={content as FAQSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'richtext' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <RichTextFields content={content as RichTextSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <RichTextFields content={content as RichTextSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'gallery' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <GalleryFields content={content as GallerySectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <GalleryFields content={content as GallerySectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'intro' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <IntroFields content={content as IntroSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <IntroFields content={content as IntroSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}

          {sectionType === 'thank_you' && (
            <>
              <TabsContent value="english" className="space-y-4">
                <ThankYouFields content={content as ThankYouSectionContent} updateField={updateField} lang="en" />
              </TabsContent>
              <TabsContent value="spanish" className="space-y-4">
                <ThankYouFields content={content as ThankYouSectionContent} updateField={updateField} lang="es" />
              </TabsContent>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface FieldProps<T> {
  content: T;
  updateField: (field: string, value: unknown) => void;
  lang: 'en' | 'es';
}

function HeroFields({ content, updateField, lang }: FieldProps<HeroSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  return (
    <div className="space-y-4">
      <div>
        <Label>Headline</Label>
        <Input
          value={(content as any)[`headline${suffix}`] || content.headline || ''}
          onChange={(e) => updateField(lang === 'es' ? 'headlineEs' : 'headline', e.target.value)}
          placeholder="Enter headline"
          data-testid={`input-hero-headline-${lang}`}
        />
      </div>
      <div>
        <Label>Subheadline</Label>
        <Textarea
          value={(content as any)[`subheadline${suffix}`] || content.subheadline || ''}
          onChange={(e) => updateField(lang === 'es' ? 'subheadlineEs' : 'subheadline', e.target.value)}
          placeholder="Enter subheadline"
          data-testid={`input-hero-subheadline-${lang}`}
        />
      </div>
      {lang === 'en' && (
        <div>
          <Label>Background Image URL</Label>
          <Input
            value={content.backgroundImage || ''}
            onChange={(e) => updateField('backgroundImage', e.target.value)}
            placeholder="https://example.com/image.jpg"
            data-testid="input-hero-bg-image"
          />
        </div>
      )}
      <div>
        <Label>Primary Button Label</Label>
        <Input
          value={(content as any)[`primaryCtaLabel${suffix}`] || content.primaryCtaLabel || ''}
          onChange={(e) => updateField(lang === 'es' ? 'primaryCtaLabelEs' : 'primaryCtaLabel', e.target.value)}
          placeholder="Register Now"
          data-testid={`input-hero-primary-cta-${lang}`}
        />
      </div>
      <div>
        <Label>Secondary Button Label</Label>
        <Input
          value={(content as any)[`secondaryCtaLabel${suffix}`] || content.secondaryCtaLabel || ''}
          onChange={(e) => updateField(lang === 'es' ? 'secondaryCtaLabelEs' : 'secondaryCtaLabel', e.target.value)}
          placeholder="Learn More"
          data-testid={`input-hero-secondary-cta-${lang}`}
        />
      </div>
    </div>
  );
}

function AgendaFields({ content, updateField, lang }: FieldProps<AgendaSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  const items = content.items || [];
  
  const addItem = () => {
    updateField('items', [...items, { time: '', title: '', description: '', titleEs: '', descriptionEs: '' }]);
  };
  
  const updateItem = (index: number, field: string, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    updateField('items', newItems);
  };
  
  const removeItem = (index: number) => {
    updateField('items', items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Section Title</Label>
        <Input
          value={(content as any)[`title${suffix}`] || content.title || ''}
          onChange={(e) => updateField(lang === 'es' ? 'titleEs' : 'title', e.target.value)}
          placeholder="Event Agenda"
          data-testid={`input-agenda-title-${lang}`}
        />
      </div>
      
      <div className="space-y-3">
        {lang === 'en' && (
          <div className="flex items-center justify-between gap-2">
            <Label>Agenda Items</Label>
            <Button size="sm" variant="outline" onClick={addItem} data-testid="button-add-agenda-item">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        )}
        {lang === 'es' && items.length > 0 && (
          <Label className="text-muted-foreground">Translate agenda items below</Label>
        )}
        {items.map((item: any, index: number) => (
          <div key={index} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                Item {index + 1}{lang === 'es' && item.title && `: ${item.title}`}
              </span>
              {lang === 'en' && (
                <Button size="icon" variant="ghost" onClick={() => removeItem(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {lang === 'en' && (
              <Input
                value={item.time || ''}
                onChange={(e) => updateItem(index, 'time', e.target.value)}
                placeholder="9:00 AM"
                data-testid={`input-agenda-time-${index}`}
              />
            )}
            <Input
              value={lang === 'es' ? (item.titleEs || '') : (item.title || '')}
              onChange={(e) => updateItem(index, lang === 'es' ? 'titleEs' : 'title', e.target.value)}
              placeholder={lang === 'es' ? "Título de la sesión" : "Session Title"}
              data-testid={`input-agenda-item-title-${lang}-${index}`}
            />
            <Textarea
              value={lang === 'es' ? (item.descriptionEs || '') : (item.description || '')}
              onChange={(e) => updateItem(index, lang === 'es' ? 'descriptionEs' : 'description', e.target.value)}
              placeholder={lang === 'es' ? "Descripción de la sesión..." : "Session description..."}
              data-testid={`input-agenda-description-${lang}-${index}`}
            />
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === 'en' ? "No agenda items yet. Click Add to create one." : "No hay elementos. Agregue elementos en la pestaña de inglés."}
          </p>
        )}
      </div>
    </div>
  );
}

function SpeakersFields({ content, updateField, lang }: FieldProps<SpeakersSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  const speakers = content.speakers || [];
  
  const addSpeaker = () => {
    updateField('speakers', [...speakers, { name: '', title: '', bio: '', image: '', titleEs: '', bioEs: '' }]);
  };
  
  const updateSpeaker = (index: number, field: string, value: string) => {
    const newSpeakers = [...speakers];
    newSpeakers[index] = { ...newSpeakers[index], [field]: value };
    updateField('speakers', newSpeakers);
  };
  
  const removeSpeaker = (index: number) => {
    updateField('speakers', speakers.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Section Title</Label>
        <Input
          value={(content as any)[`title${suffix}`] || content.title || ''}
          onChange={(e) => updateField(lang === 'es' ? 'titleEs' : 'title', e.target.value)}
          placeholder="Our Speakers"
          data-testid={`input-speakers-title-${lang}`}
        />
      </div>
      
      <div className="space-y-3">
        {lang === 'en' && (
          <div className="flex items-center justify-between gap-2">
            <Label>Speakers</Label>
            <Button size="sm" variant="outline" onClick={addSpeaker} data-testid="button-add-speaker">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        )}
        {lang === 'es' && speakers.length > 0 && (
          <Label className="text-muted-foreground">Translate speaker information below</Label>
        )}
        {speakers.map((speaker: any, index: number) => (
          <div key={index} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                Speaker {index + 1}{lang === 'es' && speaker.name && `: ${speaker.name}`}
              </span>
              {lang === 'en' && (
                <Button size="icon" variant="ghost" onClick={() => removeSpeaker(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {lang === 'en' && (
              <>
                <Input
                  value={speaker.name || ''}
                  onChange={(e) => updateSpeaker(index, 'name', e.target.value)}
                  placeholder="Name"
                  data-testid={`input-speaker-name-${index}`}
                />
                <Input
                  value={speaker.image || ''}
                  onChange={(e) => updateSpeaker(index, 'image', e.target.value)}
                  placeholder="Image URL"
                  data-testid={`input-speaker-image-${index}`}
                />
              </>
            )}
            <Input
              value={lang === 'es' ? (speaker.titleEs || '') : (speaker.title || '')}
              onChange={(e) => updateSpeaker(index, lang === 'es' ? 'titleEs' : 'title', e.target.value)}
              placeholder={lang === 'es' ? "Título / Rol" : "Title / Role"}
              data-testid={`input-speaker-title-${lang}-${index}`}
            />
            <Textarea
              value={lang === 'es' ? (speaker.bioEs || '') : (speaker.bio || '')}
              onChange={(e) => updateSpeaker(index, lang === 'es' ? 'bioEs' : 'bio', e.target.value)}
              placeholder={lang === 'es' ? "Biografía del orador..." : "Speaker bio..."}
              data-testid={`input-speaker-bio-${lang}-${index}`}
            />
          </div>
        ))}
        {speakers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === 'en' ? "No speakers yet. Click Add to create one." : "No hay oradores. Agregue oradores en la pestaña de inglés."}
          </p>
        )}
      </div>
    </div>
  );
}

function StatsFields({ content, updateField, lang }: FieldProps<StatsSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  const stats = content.stats || [];
  
  const addStat = () => {
    updateField('stats', [...stats, { value: '', label: '', labelEs: '' }]);
  };
  
  const updateStat = (index: number, field: string, value: string) => {
    const newStats = [...stats];
    newStats[index] = { ...newStats[index], [field]: value };
    updateField('stats', newStats);
  };
  
  const removeStat = (index: number) => {
    updateField('stats', stats.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Section Title</Label>
        <Input
          value={(content as any)[`title${suffix}`] || content.title || ''}
          onChange={(e) => updateField(lang === 'es' ? 'titleEs' : 'title', e.target.value)}
          placeholder="Event Statistics"
          data-testid={`input-stats-title-${lang}`}
        />
      </div>
      
      <div className="space-y-3">
        {lang === 'en' && (
          <div className="flex items-center justify-between gap-2">
            <Label>Stats</Label>
            <Button size="sm" variant="outline" onClick={addStat} data-testid="button-add-stat">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        )}
        {lang === 'es' && stats.length > 0 && (
          <Label className="text-muted-foreground">Translate stat labels below</Label>
        )}
        {stats.map((stat: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            {lang === 'en' && (
              <Input
                value={stat.value || ''}
                onChange={(e) => updateStat(index, 'value', e.target.value)}
                placeholder="500+"
                className="flex-1"
                data-testid={`input-stat-value-${index}`}
              />
            )}
            {lang === 'es' && stat.value && (
              <span className="text-sm font-medium min-w-16">{stat.value}</span>
            )}
            <Input
              value={lang === 'es' ? (stat.labelEs || '') : (stat.label || '')}
              onChange={(e) => updateStat(index, lang === 'es' ? 'labelEs' : 'label', e.target.value)}
              placeholder={lang === 'es' ? "Etiqueta" : "Attendees"}
              className="flex-1"
              data-testid={`input-stat-label-${lang}-${index}`}
            />
            {lang === 'en' && (
              <Button size="icon" variant="ghost" onClick={() => removeStat(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {stats.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === 'en' ? "No stats yet. Click Add to create one." : "No hay estadísticas. Agregue estadísticas en la pestaña de inglés."}
          </p>
        )}
      </div>
    </div>
  );
}

function CTAFields({ content, updateField, lang }: FieldProps<CTASectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  return (
    <div className="space-y-4">
      <div>
        <Label>Headline</Label>
        <Input
          value={(content as any)[`headline${suffix}`] || content.headline || ''}
          onChange={(e) => updateField(lang === 'es' ? 'headlineEs' : 'headline', e.target.value)}
          placeholder="Ready to Join?"
          data-testid={`input-cta-headline-${lang}`}
        />
      </div>
      <div>
        <Label>Subheadline</Label>
        <Textarea
          value={(content as any)[`subheadline${suffix}`] || content.subheadline || ''}
          onChange={(e) => updateField(lang === 'es' ? 'subheadlineEs' : 'subheadline', e.target.value)}
          placeholder="Join us for an amazing experience..."
          data-testid={`input-cta-subheadline-${lang}`}
        />
      </div>
      <div>
        <Label>Button Label</Label>
        <Input
          value={(content as any)[`buttonLabel${suffix}`] || content.buttonLabel || ''}
          onChange={(e) => updateField(lang === 'es' ? 'buttonLabelEs' : 'buttonLabel', e.target.value)}
          placeholder="Register Now"
          data-testid={`input-cta-button-${lang}`}
        />
      </div>
      {lang === 'en' && (
        <div>
          <Label>Background Color</Label>
          <Input
            value={content.backgroundColor || ''}
            onChange={(e) => updateField('backgroundColor', e.target.value)}
            placeholder="#3B82F6"
            data-testid="input-cta-bgcolor"
          />
        </div>
      )}
    </div>
  );
}

function FAQFields({ content, updateField, lang }: FieldProps<FAQSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  const items = content.items || [];
  
  const addItem = () => {
    updateField('items', [...items, { question: '', answer: '', questionEs: '', answerEs: '' }]);
  };
  
  const updateItem = (index: number, field: string, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    updateField('items', newItems);
  };
  
  const removeItem = (index: number) => {
    updateField('items', items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Section Title</Label>
        <Input
          value={(content as any)[`title${suffix}`] || content.title || ''}
          onChange={(e) => updateField(lang === 'es' ? 'titleEs' : 'title', e.target.value)}
          placeholder="Frequently Asked Questions"
          data-testid={`input-faq-title-${lang}`}
        />
      </div>
      
      <div className="space-y-3">
        {lang === 'en' && (
          <div className="flex items-center justify-between gap-2">
            <Label>FAQ Items</Label>
            <Button size="sm" variant="outline" onClick={addItem} data-testid="button-add-faq">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        )}
        {lang === 'es' && items.length > 0 && (
          <Label className="text-muted-foreground">Translate FAQ items below</Label>
        )}
        {items.map((item: any, index: number) => (
          <div key={index} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                FAQ {index + 1}{lang === 'es' && item.question && `: ${item.question.substring(0, 30)}...`}
              </span>
              {lang === 'en' && (
                <Button size="icon" variant="ghost" onClick={() => removeItem(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Input
              value={lang === 'es' ? (item.questionEs || '') : (item.question || '')}
              onChange={(e) => updateItem(index, lang === 'es' ? 'questionEs' : 'question', e.target.value)}
              placeholder={lang === 'es' ? "Pregunta?" : "Question?"}
              data-testid={`input-faq-question-${lang}-${index}`}
            />
            <Textarea
              value={lang === 'es' ? (item.answerEs || '') : (item.answer || '')}
              onChange={(e) => updateItem(index, lang === 'es' ? 'answerEs' : 'answer', e.target.value)}
              placeholder={lang === 'es' ? "Respuesta..." : "Answer..."}
              data-testid={`input-faq-answer-${lang}-${index}`}
            />
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === 'en' ? "No FAQ items yet. Click Add to create one." : "No hay preguntas. Agregue preguntas en la pestaña de inglés."}
          </p>
        )}
      </div>
    </div>
  );
}

function RichTextFields({ content, updateField, lang }: FieldProps<RichTextSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  return (
    <div className="space-y-4">
      <div>
        <Label>Title (optional)</Label>
        <Input
          value={(content as any)[`title${suffix}`] || content.title || ''}
          onChange={(e) => updateField(lang === 'es' ? 'titleEs' : 'title', e.target.value)}
          placeholder="Section Title"
          data-testid={`input-richtext-title-${lang}`}
        />
      </div>
      <div>
        <Label>Content (HTML supported)</Label>
        <Textarea
          value={(content as any)[`content${suffix}`] || content.content || ''}
          onChange={(e) => updateField(lang === 'es' ? 'contentEs' : 'content', e.target.value)}
          placeholder="<p>Your content here...</p>"
          className="min-h-[200px] font-mono text-sm"
          data-testid={`input-richtext-content-${lang}`}
        />
      </div>
    </div>
  );
}

function GalleryFields({ content, updateField, lang }: FieldProps<GallerySectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  const images = content.images || [];
  
  const addImage = () => {
    updateField('images', [...images, { url: '', alt: '', caption: '', captionEs: '' }]);
  };
  
  const updateImage = (index: number, field: string, value: string) => {
    const newImages = [...images];
    newImages[index] = { ...newImages[index], [field]: value };
    updateField('images', newImages);
  };
  
  const removeImage = (index: number) => {
    updateField('images', images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Section Title</Label>
        <Input
          value={(content as any)[`title${suffix}`] || content.title || ''}
          onChange={(e) => updateField(lang === 'es' ? 'titleEs' : 'title', e.target.value)}
          placeholder="Gallery"
          data-testid={`input-gallery-title-${lang}`}
        />
      </div>
      
      <div className="space-y-3">
        {lang === 'en' && (
          <div className="flex items-center justify-between gap-2">
            <Label>Images</Label>
            <Button size="sm" variant="outline" onClick={addImage} data-testid="button-add-image">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        )}
        {lang === 'es' && images.length > 0 && (
          <Label className="text-muted-foreground">Translate image captions below</Label>
        )}
        {images.map((image: any, index: number) => (
          <div key={index} className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Image {index + 1}</span>
              {lang === 'en' && (
                <Button size="icon" variant="ghost" onClick={() => removeImage(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {lang === 'en' && (
              <>
                <Input
                  value={image.url || ''}
                  onChange={(e) => updateImage(index, 'url', e.target.value)}
                  placeholder="Image URL"
                  data-testid={`input-gallery-image-url-${index}`}
                />
                <Input
                  value={image.alt || ''}
                  onChange={(e) => updateImage(index, 'alt', e.target.value)}
                  placeholder="Alt text (for accessibility)"
                  data-testid={`input-gallery-image-alt-${index}`}
                />
              </>
            )}
            {lang === 'es' && image.url && (
              <div className="text-xs text-muted-foreground truncate">{image.url}</div>
            )}
            <Input
              value={lang === 'es' ? (image.captionEs || '') : (image.caption || '')}
              onChange={(e) => updateImage(index, lang === 'es' ? 'captionEs' : 'caption', e.target.value)}
              placeholder={lang === 'es' ? "Pie de foto (opcional)" : "Caption (optional)"}
              data-testid={`input-gallery-image-caption-${lang}-${index}`}
            />
          </div>
        ))}
        {images.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === 'en' ? "No images yet. Click Add to create one." : "No hay imágenes. Agregue imágenes en la pestaña de inglés."}
          </p>
        )}
      </div>
    </div>
  );
}

function IntroFields({ content, updateField, lang }: FieldProps<IntroSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  return (
    <div className="space-y-4">
      <div>
        <Label>Headline</Label>
        <Input
          value={(content as any)[`headline${suffix}`] || content.headline || ''}
          onChange={(e) => updateField(lang === 'es' ? 'headlineEs' : 'headline', e.target.value)}
          placeholder={lang === 'es' ? "Título del evento" : "Event Title"}
          data-testid={`input-intro-headline-${lang}`}
        />
      </div>
      <div>
        <Label>Subheadline</Label>
        <Input
          value={(content as any)[`subheadline${suffix}`] || content.subheadline || ''}
          onChange={(e) => updateField(lang === 'es' ? 'subheadlineEs' : 'subheadline', e.target.value)}
          placeholder={lang === 'es' ? "Subtítulo o tagline" : "Subtitle or tagline"}
          data-testid={`input-intro-subheadline-${lang}`}
        />
      </div>
      <div>
        <Label>Event Details</Label>
        <Textarea
          value={(content as any)[`eventDetails${suffix}`] || content.eventDetails || ''}
          onChange={(e) => updateField(lang === 'es' ? 'eventDetailsEs' : 'eventDetails', e.target.value)}
          placeholder={lang === 'es' ? "Fecha, ubicación, etc." : "Date, location, etc."}
          data-testid={`input-intro-eventdetails-${lang}`}
        />
      </div>
      {lang === 'en' && (
        <div>
          <Label>Background Image URL</Label>
          <Input
            value={content.backgroundImage || ''}
            onChange={(e) => updateField('backgroundImage', e.target.value)}
            placeholder="https://example.com/image.jpg"
            data-testid="input-intro-background"
          />
        </div>
      )}
    </div>
  );
}

function ThankYouFields({ content, updateField, lang }: FieldProps<ThankYouSectionContent>) {
  const suffix = lang === 'es' ? 'Es' : '';
  return (
    <div className="space-y-4">
      <div>
        <Label>Headline</Label>
        <Input
          value={(content as any)[`headline${suffix}`] || content.headline || ''}
          onChange={(e) => updateField(lang === 'es' ? 'headlineEs' : 'headline', e.target.value)}
          placeholder={lang === 'es' ? "¡Gracias por registrarte!" : "Thank you for registering!"}
          data-testid={`input-thankyou-headline-${lang}`}
        />
      </div>
      <div>
        <Label>Message</Label>
        <Textarea
          value={(content as any)[`message${suffix}`] || content.message || ''}
          onChange={(e) => updateField(lang === 'es' ? 'messageEs' : 'message', e.target.value)}
          placeholder={lang === 'es' ? "Te hemos enviado un correo de confirmación..." : "We've sent you a confirmation email..."}
          data-testid={`input-thankyou-message-${lang}`}
        />
      </div>
      <div>
        <Label>Additional Info</Label>
        <Textarea
          value={(content as any)[`additionalInfo${suffix}`] || content.additionalInfo || ''}
          onChange={(e) => updateField(lang === 'es' ? 'additionalInfoEs' : 'additionalInfo', e.target.value)}
          placeholder={lang === 'es' ? "Próximos pasos o instrucciones" : "Next steps or instructions"}
          data-testid={`input-thankyou-additionalinfo-${lang}`}
        />
      </div>
      {lang === 'en' && (
        <div>
          <Label>Background Image URL</Label>
          <Input
            value={content.backgroundImage || ''}
            onChange={(e) => updateField('backgroundImage', e.target.value)}
            placeholder="https://example.com/image.jpg"
            data-testid="input-thankyou-background"
          />
        </div>
      )}
    </div>
  );
}
