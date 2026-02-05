import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { CheckCircle, XCircle, Clock, QrCode, Loader2, ArrowLeft, LogIn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QRScanner, parseQRCode } from "@/components/QRScanner";

type CheckInState = "idle" | "scanning" | "processing" | "success" | "already_checked_in" | "error" | "require_auth";

interface CheckInResult {
  ok: boolean;
  code?: string;
  attendeeName?: string;
  eventName?: string;
  checkedInAt?: string;
  message?: string;
  legacy?: boolean;
}

export default function ScanPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [state, setState] = useState<CheckInState>("idle");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [scannerActive, setScannerActive] = useState(false);
  const [hasTokenParam, setHasTokenParam] = useState(false);

  const processTokenCheckIn = useCallback(async (token: string) => {
    setState("processing");
    setErrorMessage("");
    
    try {
      const response = await fetch("/api/check-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      
      const data: CheckInResult = await response.json();
      
      if (data.ok) {
        setResult(data);
        if (data.code === "ALREADY_CHECKED_IN") {
          setState("already_checked_in");
        } else {
          setState("success");
        }
      } else {
        setErrorMessage(data.message || "Check-in failed");
        setState("error");
      }
    } catch {
      setErrorMessage("Unable to connect to server. Please try again.");
      setState("error");
    }
  }, []);

  const processLegacyCheckIn = useCallback(async (registrationId: string, eventId?: string) => {
    setState("processing");
    setErrorMessage("");
    
    try {
      const response = await fetch("/api/check-in/legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, eventId }),
      });
      
      const data: CheckInResult = await response.json();
      
      if (data.ok) {
        setResult(data);
        if (data.code === "ALREADY_CHECKED_IN") {
          setState("already_checked_in");
        } else {
          setState("success");
        }
      } else {
        setErrorMessage(data.message || "Check-in failed");
        setState("error");
      }
    } catch {
      setErrorMessage("Unable to connect to server. Please try again.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get("token");
    const regId = params.get("registrationId") || params.get("reg");
    const eventId = params.get("eventId");
    
    if (token) {
      setHasTokenParam(true);
      processTokenCheckIn(token);
    } else if (regId) {
      setHasTokenParam(true);
      processLegacyCheckIn(regId, eventId || undefined);
    } else {
      // No token/regId param - this page requires a token from email QR code
      // For admin scanning without a token, redirect to admin check-in page
      setHasTokenParam(false);
      setState("require_auth");
    }
  }, [search, processTokenCheckIn, processLegacyCheckIn]);

  const handleQRScan = useCallback(async (rawData: string) => {
    if (state === "processing") return;
    
    setScannerActive(false);
    
    const parsed = parseQRCode(rawData);
    
    if (parsed.type === "checkin" && parsed.token) {
      await processTokenCheckIn(parsed.token);
    } else if (parsed.registrationId) {
      await processLegacyCheckIn(parsed.registrationId, parsed.eventId);
    } else {
      setErrorMessage("Invalid QR code format");
      setState("error");
    }
  }, [state, processTokenCheckIn, processLegacyCheckIn]);

  const resetState = () => {
    setState("idle");
    setResult(null);
    setErrorMessage("");
    setScannerActive(false);
  };

  const startScanning = () => {
    setState("scanning");
    setScannerActive(true);
  };

  const formatDateTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <QrCode className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Event Check-In</CardTitle>
          <CardDescription>
            Scan your QR code to check in
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {state === "idle" && hasTokenParam && (
            <div className="space-y-4">
              <p className="text-center text-muted-foreground">
                Click below to scan your QR code from the confirmation email
              </p>
              <Button 
                onClick={startScanning} 
                className="w-full" 
                size="lg"
                data-testid="button-start-scan"
              >
                <QrCode className="h-5 w-5 mr-2" />
                Scan QR Code
              </Button>
            </div>
          )}

          {state === "require_auth" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <LogIn className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">
                  Admin Login Required
                </h3>
                <p className="text-sm text-muted-foreground">
                  To scan QR codes without a token, please log in to the admin check-in page.
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={() => navigate("/admin/check-in")} 
                  className="w-full" 
                  size="lg"
                  data-testid="button-go-admin-checkin"
                >
                  <LogIn className="h-5 w-5 mr-2" />
                  Go to Admin Check-In
                </Button>
                
                <p className="text-center text-xs text-muted-foreground">
                  If you received a QR code via email, scan it directly from your email app.
                </p>
              </div>
            </div>
          )}

          {state === "scanning" && (
            <div className="space-y-4">
              <QRScanner
                onScan={handleQRScan}
                onError={(error) => {
                  setErrorMessage(error);
                  setState("error");
                }}
                paused={!scannerActive}
              />
              <Button 
                variant="outline" 
                onClick={resetState} 
                className="w-full"
                data-testid="button-cancel-scan"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}

          {state === "processing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-muted-foreground">Processing check-in...</p>
            </div>
          )}

          {state === "success" && result && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-green-600 dark:text-green-400">
                  Check-In Successful!
                </h3>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium" data-testid="text-attendee-name">{result.attendeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event</span>
                  <span className="font-medium" data-testid="text-event-name">{result.eventName}</span>
                </div>
                {result.checkedInAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Checked In</span>
                    <span className="font-medium" data-testid="text-checked-in-time">
                      {formatDateTime(result.checkedInAt)}
                    </span>
                  </div>
                )}
              </div>
              
              <p className="text-center text-sm text-muted-foreground">
                You're all set! Proceed to the event check-in desk.
              </p>
            </div>
          )}

          {state === "already_checked_in" && result && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-xl font-semibold text-amber-600 dark:text-amber-400">
                  Already Checked In
                </h3>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium" data-testid="text-attendee-name">{result.attendeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event</span>
                  <span className="font-medium" data-testid="text-event-name">{result.eventName}</span>
                </div>
                {result.checkedInAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Checked In</span>
                    <span className="font-medium" data-testid="text-checked-in-time">
                      {formatDateTime(result.checkedInAt)}
                    </span>
                  </div>
                )}
              </div>
              
              <p className="text-center text-sm text-muted-foreground">
                You were already checked in earlier. No action needed!
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">
                  Check-In Failed
                </h3>
                <p className="text-muted-foreground" data-testid="text-error-message">
                  {errorMessage}
                </p>
              </div>
              
              <Button 
                onClick={resetState} 
                variant="outline" 
                className="w-full"
                data-testid="button-try-again"
              >
                Try Again
              </Button>
            </div>
          )}

          {(state === "success" || state === "already_checked_in") && (
            <Button 
              onClick={() => navigate("/")} 
              variant="outline" 
              className="w-full"
              data-testid="button-go-home"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
