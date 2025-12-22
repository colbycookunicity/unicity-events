import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Plus, 
  GripVertical, 
  Trash2, 
  Eye, 
  Save,
  Globe,
  Loader2,
  Pencil
} from "lucide-react";
import { Link } from "wouter";
import type { Event, EventPage, EventPageSection } from "@shared/schema";
import { SectionRenderer, SECTION_LABELS, type SectionType } from "@/components/landing-sections";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { SectionEditor } from "@/components/landing-sections/SectionEditor";
import type { PageSectionContent } from "@shared/schema";

interface PageData {
  page: EventPage;
  sections: EventPageSection[];
}

interface SortableSectionItemProps {
  section: EventPageSection;
  eventId: string;
  onToggle: (id: string, isEnabled: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (section: EventPageSection) => void;
}

function SortableSectionItem({ section, eventId, onToggle, onDelete, onEdit }: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const label = SECTION_LABELS[section.type as SectionType]?.en || section.type;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`${section.isEnabled ? '' : 'opacity-60'}`} data-testid={`section-item-${section.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none"
              data-testid={`drag-handle-${section.id}`}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </button>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{label}</span>
                <Badge variant="outline" className="text-xs">
                  {section.isEnabled ? 'Visible' : 'Hidden'}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit(section)}
                data-testid={`edit-section-${section.id}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Switch
                checked={section.isEnabled}
                onCheckedChange={(checked) => onToggle(section.id, checked)}
                data-testid={`toggle-section-${section.id}`}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDelete(section.id)}
                data-testid={`delete-section-${section.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  login: "Login / Verification Page",
  registration: "Registration Form Page", 
  thank_you: "Thank You / Confirmation Page",
};

export default function LandingEditorPage() {
  const { id: eventId, pageType: rawPageType } = useParams<{ id: string; pageType?: string }>();
  const pageType = rawPageType || "registration";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<EventPageSection | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: event, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ['/api/events', eventId],
    enabled: !!eventId,
  });

  const { data: pageData, isLoading: pageLoading } = useQuery<PageData | null>({
    queryKey: ['/api/events', eventId, 'pages', pageType],
    enabled: !!eventId,
  });

  const createPageMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/events/${eventId}/pages/${pageType}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'pages', pageType] });
    },
  });

  const addSectionMutation = useMutation({
    mutationFn: (type: string) => 
      apiRequest('POST', `/api/events/${eventId}/pages/${pageType}/sections`, { type, content: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'pages', pageType] });
      toast({ title: "Section added" });
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: Partial<EventPageSection> }) =>
      apiRequest('PATCH', `/api/events/${eventId}/pages/${pageType}/sections/${sectionId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'pages', pageType] });
      setEditingSection(null);
      toast({ title: "Section updated" });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) =>
      apiRequest('DELETE', `/api/events/${eventId}/pages/${pageType}/sections/${sectionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'pages', pageType] });
      toast({ title: "Section deleted" });
    },
  });

  const reorderSectionsMutation = useMutation({
    mutationFn: (sectionIds: string[]) =>
      apiRequest('POST', `/api/events/${eventId}/pages/${pageType}/sections/reorder`, { sectionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'pages', pageType] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/events/${eventId}/pages/${pageType}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'pages', pageType] });
      toast({ title: "Page published", description: "Your page is now live." });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/events/${eventId}/pages/${pageType}/unpublish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'pages', pageType] });
      toast({ title: "Page unpublished", description: "Your page is now in draft mode." });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && pageData?.sections) {
      const oldIndex = pageData.sections.findIndex((s) => s.id === active.id);
      const newIndex = pageData.sections.findIndex((s) => s.id === over.id);
      const newOrder = arrayMove(pageData.sections, oldIndex, newIndex);
      reorderSectionsMutation.mutate(newOrder.map((s) => s.id));
    }
  };

  const handleToggleSection = (sectionId: string, isEnabled: boolean) => {
    updateSectionMutation.mutate({ sectionId, data: { isEnabled } });
  };

  const handleEditSection = (section: EventPageSection) => {
    setEditingSection(section);
  };

  const handleSaveSection = (content: PageSectionContent) => {
    if (editingSection) {
      updateSectionMutation.mutate({ sectionId: editingSection.id, data: { content } });
    }
  };

  const handleDeleteSection = (sectionId: string) => {
    setSectionToDelete(sectionId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (sectionToDelete) {
      deleteSectionMutation.mutate(sectionToDelete);
      setSectionToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  if (eventLoading || pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Event not found</p>
        <Button variant="ghost" asChild>
          <Link href="/admin/events">Back to Events</Link>
        </Button>
      </div>
    );
  }

  const sections = pageData?.sections || [];
  const page = pageData?.page;
  const isPublished = page?.status === 'published';

  const sectionTypes: SectionType[] = ['intro', 'hero', 'agenda', 'speakers', 'stats', 'cta', 'faq', 'richtext', 'gallery', 'thank_you'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/admin/events/${eventId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="page-title">
              {PAGE_TYPE_LABELS[pageType] || "Page Editor"}
            </h1>
            <p className="text-sm text-muted-foreground">{event.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
              <a href={`/register/${event.slug}${pageType === 'thank_you' ? '?preview=thankyou' : ''}`} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </a>
            </Button>
          
          {page && (
            isPublished ? (
              <Button
                variant="outline"
                onClick={() => unpublishMutation.mutate()}
                disabled={unpublishMutation.isPending}
                data-testid="button-unpublish"
              >
                Unpublish
              </Button>
            ) : (
              <Button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                data-testid="button-publish"
              >
                <Globe className="h-4 w-4 mr-2" />
                Publish
              </Button>
            )
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {page && (
          <Badge variant={isPublished ? "default" : "secondary"}>
            {isPublished ? 'Published' : 'Draft'}
          </Badge>
        )}
      </div>

      {!page ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No {PAGE_TYPE_LABELS[pageType]?.toLowerCase() || 'page'} design created for this event yet.
            </p>
            <Button 
              onClick={() => createPageMutation.mutate()}
              disabled={createPageMutation.isPending}
              data-testid="button-create-page"
            >
              Create {PAGE_TYPE_LABELS[pageType] || 'Page'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                <CardTitle className="text-lg">Sections</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" data-testid="button-add-section">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Section
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {sectionTypes.map((type) => (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => addSectionMutation.mutate(type)}
                        data-testid={`add-section-${type}`}
                      >
                        {SECTION_LABELS[type].en}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                {sections.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No sections added yet. Click "Add Section" to start building your page.
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={sections.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {sections
                        .sort((a, b) => a.position - b.position)
                        .map((section) => (
                          <SortableSectionItem
                            key={section.id}
                            section={section}
                            eventId={eventId!}
                            onToggle={handleToggleSection}
                            onDelete={handleDeleteSection}
                            onEdit={handleEditSection}
                          />
                        ))}
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
            
            {editingSection && (
              <SectionEditor
                section={editingSection}
                onSave={handleSaveSection}
                onCancel={() => setEditingSection(null)}
                isSaving={updateSectionMutation.isPending}
              />
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md bg-muted/30 min-h-[400px] overflow-hidden">
                  <div className="scale-50 origin-top-left w-[200%] h-[200%]">
                    {sections
                      .filter((s) => s.isEnabled)
                      .sort((a, b) => a.position - b.position)
                      .map((section) => (
                        <SectionRenderer key={section.id} section={section} />
                      ))}
                    {sections.filter((s) => s.isEnabled).length === 0 && (
                      <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
                        Add sections to see a preview
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this section? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
