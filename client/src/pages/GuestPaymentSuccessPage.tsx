import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import unicityLogoDark from "@/assets/unicity-logo-dark.png";
import unicityLogoWhite from "@/assets/unicity-logo-white.png";
import { useTranslation } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";

export default function GuestPaymentSuccessPage() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useParams<{ eventSlug: string }>();
  const [, setLocation] = useLocation();
  const [verified, setVerified] = useState<boolean | null>(null);

  const unicityLogo = theme === 'dark' ? unicityLogoWhite : unicityLogoDark;

  // Verify payment mutation
  const verifyMutation = useMutation({
    mutationFn: async ({ sessionId, guestId }: { sessionId: string; guestId: string }) => {
      const response = await apiRequest("POST", "/api/public/verify-guest-payment", {
        sessionId,
        guestId,
      });
      return response.json();
    },
    onSuccess: () => {
      setVerified(true);
    },
    onError: () => {
      setVerified(false);
    },
  });

  // Verify payment on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const guestId = urlParams.get('guest_id');

    if (sessionId && guestId) {
      verifyMutation.mutate({ sessionId, guestId });
    } else {
      setVerified(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={unicityLogo} alt="Unicity" className="h-6" data-testid="img-header-logo" />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            {verified === null && (
              <>
                <Loader2 className="h-16 w-16 text-muted-foreground mx-auto mb-4 animate-spin" />
                <h2 className="text-xl font-semibold mb-2">{t("verifyingPayment") || "Verifying Payment..."}</h2>
                <p className="text-muted-foreground">
                  {t("pleaseWait") || "Please wait while we confirm your payment."}
                </p>
              </>
            )}

            {verified === true && (
              <>
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">{t("paymentSuccessful") || "Payment Successful!"}</h2>
                <p className="text-muted-foreground mb-6">
                  {t("guestRegistrationComplete") || "Your guest registration is complete. You will receive a confirmation email shortly."}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/")}
                  data-testid="button-go-home"
                >
                  {t("goHome") || "Go to Home"}
                </Button>
              </>
            )}

            {verified === false && (
              <>
                <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">{t("paymentFailed") || "Payment Verification Failed"}</h2>
                <p className="text-muted-foreground mb-6">
                  {t("paymentFailedMessage") || "We couldn't verify your payment. Please contact support if you believe this is an error."}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/events/${params.eventSlug}/guest-register`)}
                  data-testid="button-try-again"
                >
                  {t("tryAgain") || "Try Again"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
