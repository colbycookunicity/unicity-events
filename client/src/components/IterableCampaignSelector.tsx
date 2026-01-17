import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import type { EventIterableCampaigns } from "@shared/schema";

interface Campaign {
  id: number;
  name: string;
  campaignState: string;
}

interface Props {
  value: EventIterableCampaigns | undefined;
  onChange: (campaigns: EventIterableCampaigns) => void;
}

const EMAIL_TYPES = [
  { key: 'confirmation' as const, label: 'Registration Confirmation', description: 'Sent after successful registration' },
  { key: 'checkedIn' as const, label: 'Check-In Notification', description: 'Sent when attendee checks in' },
  { key: 'qualificationGranted' as const, label: 'Qualification Granted', description: 'Sent when added to qualified list' },
  { key: 'registrationCanceled' as const, label: 'Registration Canceled', description: 'Sent when registration is canceled' },
  { key: 'registrationTransferred' as const, label: 'Registration Transferred', description: 'Sent when registration is transferred' },
  { key: 'registrationUpdate' as const, label: 'Registration Updated', description: 'Sent when registration details change' },
];

export function IterableCampaignSelector({ value, onChange }: Props) {
  const { data: campaigns = [], isLoading, error } = useQuery<Campaign[]>({
    queryKey: ['/api/iterable/campaigns'],
    staleTime: 5 * 60 * 1000,
  });

  const handleCampaignChange = (emailType: keyof EventIterableCampaigns, language: 'en' | 'es', campaignId: number | undefined) => {
    const newValue: EventIterableCampaigns = { ...(value ?? {}) };
    if (!newValue[emailType]) {
      newValue[emailType] = {};
    }
    if (campaignId === undefined || campaignId === 0) {
      delete newValue[emailType]![language];
    } else {
      newValue[emailType]![language] = campaignId;
    }
    if (newValue[emailType] && Object.keys(newValue[emailType]!).length === 0) {
      delete newValue[emailType];
    }
    onChange(newValue);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {EMAIL_TYPES.map(({ key }) => (
          <div key={key} className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-destructive bg-destructive/10 rounded-md">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load campaigns from Iterable. Check that ITERABLE_API_KEY is configured.</span>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground bg-muted/50 rounded-md">
        No active campaigns found in Iterable. Create campaigns in Iterable to select them here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {EMAIL_TYPES.map(({ key, label, description }) => (
        <div key={key} className="space-y-3">
          <div>
            <h4 className="font-medium">{label}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">English Campaign</label>
              <Select
                value={value?.[key]?.en?.toString() || "none"}
                onValueChange={(v) => handleCampaignChange(key, 'en', v === "none" ? undefined : parseInt(v))}
              >
                <SelectTrigger data-testid={`select-campaign-${key}-en`}>
                  <SelectValue placeholder="Select campaign..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Use system default</span>
                  </SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name} (ID: {c.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!value?.[key]?.en && (
                <Badge variant="outline" className="text-xs">Using fallback</Badge>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Spanish Campaign</label>
              <Select
                value={value?.[key]?.es?.toString() || "none"}
                onValueChange={(v) => handleCampaignChange(key, 'es', v === "none" ? undefined : parseInt(v))}
              >
                <SelectTrigger data-testid={`select-campaign-${key}-es`}>
                  <SelectValue placeholder="Select campaign..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Use system default</span>
                  </SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name} (ID: {c.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!value?.[key]?.es && (
                <Badge variant="outline" className="text-xs">Using fallback</Badge>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
