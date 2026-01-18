import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Save, Loader2 } from "lucide-react";
import { Link } from "wouter";
import type { Event, EventIterableCampaigns } from "@shared/schema";
import { IterableCampaignSelector } from "@/components/IterableCampaignSelector";
import { useState, useEffect } from "react";

export default function EmailCampaignsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<EventIterableCampaigns | undefined>(undefined);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: event, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ['/api/events', eventId],
    enabled: !!eventId,
  });

  useEffect(() => {
    if (event && (event as any).iterableCampaigns) {
      setCampaigns((event as any).iterableCampaigns as EventIterableCampaigns);
    }
  }, [event]);

  const saveMutation = useMutation({
    mutationFn: async (data: { iterableCampaigns: EventIterableCampaigns | undefined }) => {
      const response = await apiRequest("PATCH", `/api/events/${eventId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      setHasChanges(false);
      toast({
        title: "Saved",
        description: "Email campaign settings updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save email campaign settings.",
        variant: "destructive",
      });
    },
  });

  const handleCampaignsChange = (newCampaigns: EventIterableCampaigns) => {
    setCampaigns(newCampaigns);
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate({ 
      iterableCampaigns: campaigns && Object.keys(campaigns).length > 0 ? campaigns : undefined 
    });
  };

  if (eventLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
          <p className="text-muted-foreground mb-4">The event you're looking for doesn't exist.</p>
          <Link href="/admin/events">
            <Button>Back to Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href={`/admin/events/${eventId}/edit`}>
            <Button variant="ghost" size="icon" data-testid="button-back-to-event">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Email Campaigns</h1>
            <p className="text-muted-foreground">{event.name}</p>
          </div>
        </div>
        <Button 
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-campaigns"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Iterable Campaign Configuration
          </CardTitle>
          <CardDescription>
            Configure Iterable campaigns for each email type. If not configured, system defaults will be used.
            Select a campaign for English and/or Spanish to override the default for this event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IterableCampaignSelector
            value={campaigns}
            onChange={handleCampaignsChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
