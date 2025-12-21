import { useParams } from "wouter";
import { LandingPageRenderer } from "@/components/LandingPageRenderer";

export default function EventLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  
  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Event not found</p>
      </div>
    );
  }

  return <LandingPageRenderer eventSlug={slug} />;
}
