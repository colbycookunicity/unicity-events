import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, CheckCircle, User, Shirt, Package, Printer, QrCode, X, AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
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
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Registration, Event, Printer as PrinterType } from "@shared/schema";
import { QRScanner, parseQRCode } from "@/components/QRScanner";

type ScanMode = "list" | "scan";
type ScanResult = {
  registration: Registration | null;
  error: string | null;
  alreadyCheckedIn: boolean;
};

export default function CheckInPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [reprintConfirmReg, setReprintConfirmReg] = useState<Registration | null>(null);
  const [bridgeUrl] = useState<string>(() => 
    localStorage.getItem("print-bridge-url") || ""
  );
  
  // QR Scan mode state
  const [scanMode, setScanMode] = useState<ScanMode>("list");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [scannerPaused, setScannerPaused] = useState(false);

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: registrations, isLoading } = useQuery<Registration[]>({
    queryKey: [`/api/registrations?eventId=${selectedEvent}`],
    enabled: !!selectedEvent,
  });

  const { data: printers } = useQuery<PrinterType[]>({
    queryKey: [`/api/events/${selectedEvent}/printers`],
    enabled: !!selectedEvent,
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/registrations/${id}/check-in`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      toast({ title: t("success"), description: "Attendee checked in successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to check in", variant: "destructive" });
    },
  });

  const markSwagMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/registrations/${id}`, { swagStatus: "picked_up" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      toast({ title: t("success"), description: "Swag marked as picked up" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update swag status", variant: "destructive" });
    },
  });

  const printBadgeMutation = useMutation({
    mutationFn: async (reg: Registration) => {
      if (!bridgeUrl) {
        throw new Error("Print Bridge URL not configured");
      }
      if (!selectedPrinter) {
        throw new Error("No printer selected");
      }

      const printer = printers?.find(p => p.id === selectedPrinter);
      if (!printer) {
        throw new Error("Printer not found");
      }

      const response = await fetch(`${bridgeUrl}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printer: {
            ipAddress: printer.ipAddress,
            port: printer.port || 9100,
          },
          badge: {
            firstName: reg.firstName,
            lastName: reg.lastName,
            unicityId: reg.unicityId || "",
            registrationId: reg.id,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to print badge");
      }

      await apiRequest("POST", `/api/registrations/${reg.id}/record-print`, {
        printerId: selectedPrinter,
      });

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      toast({ title: t("success"), description: "Badge printed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    },
  });

  const handlePrintBadge = (reg: Registration) => {
    if (!bridgeUrl) {
      toast({ 
        title: "Print Bridge not configured", 
        description: "Go to Printers page to configure the Print Bridge URL",
        variant: "destructive" 
      });
      return;
    }
    if (!selectedPrinter) {
      toast({ 
        title: "No printer selected", 
        description: "Select a printer to print badges",
        variant: "destructive" 
      });
      return;
    }

    if (reg.badgePrintCount && reg.badgePrintCount > 0) {
      setReprintConfirmReg(reg);
    } else {
      printBadgeMutation.mutate(reg);
    }
  };

  const confirmReprint = () => {
    if (reprintConfirmReg) {
      printBadgeMutation.mutate(reprintConfirmReg);
      setReprintConfirmReg(null);
    }
  };

  // Handle QR code scan
  const handleQRScan = useCallback(async (rawData: string) => {
    if (isProcessingScan || !selectedEvent) return;
    
    setIsProcessingScan(true);
    setScannerPaused(true);
    
    try {
      const parsed = parseQRCode(rawData);
      if (!parsed.registrationId) {
        setScanResult({
          registration: null,
          error: "Invalid QR code format",
          alreadyCheckedIn: false,
        });
        return;
      }

      // Look up registration in current list
      const reg = registrations?.find(r => r.id === parsed.registrationId);
      if (!reg) {
        // Try fetching directly from API
        try {
          const response = await fetch(`/api/registrations/${parsed.registrationId}`);
          if (!response.ok) {
            setScanResult({
              registration: null,
              error: "Registration not found for this event",
              alreadyCheckedIn: false,
            });
            return;
          }
          const fetchedReg = await response.json();
          // Verify it's for this event
          if (fetchedReg.eventId !== selectedEvent) {
            setScanResult({
              registration: null,
              error: "This registration is for a different event",
              alreadyCheckedIn: false,
            });
            return;
          }
          setScanResult({
            registration: fetchedReg,
            error: null,
            alreadyCheckedIn: fetchedReg.status === "checked_in",
          });
        } catch {
          setScanResult({
            registration: null,
            error: "Failed to fetch registration",
            alreadyCheckedIn: false,
          });
        }
        return;
      }

      setScanResult({
        registration: reg,
        error: null,
        alreadyCheckedIn: reg.status === "checked_in",
      });
    } catch (error) {
      setScanResult({
        registration: null,
        error: error instanceof Error ? error.message : "Unknown error",
        alreadyCheckedIn: false,
      });
    } finally {
      setIsProcessingScan(false);
    }
  }, [isProcessingScan, selectedEvent, registrations]);

  // Reset scan result and resume scanner
  const resetScan = useCallback(() => {
    setScanResult(null);
    setScannerPaused(false);
  }, []);

  // Quick check-in from scan result (check-in + optional print)
  const handleQuickCheckIn = async (reg: Registration, autoPrint: boolean) => {
    try {
      if (reg.status !== "checked_in") {
        await apiRequest("POST", `/api/registrations/${reg.id}/check-in`, {});
        toast({ title: t("success"), description: `${reg.firstName} ${reg.lastName} checked in` });
        queryClient.invalidateQueries({ predicate: (query) => 
          String(query.queryKey[0]).startsWith("/api/registrations")
        });
      }

      if (autoPrint) {
        if (!bridgeUrl) {
          toast({ 
            title: "Print Bridge not configured", 
            description: "Badge not printed. Configure Print Bridge in Printers page.",
            variant: "destructive" 
          });
        } else if (!selectedPrinter) {
          toast({ 
            title: "No printer selected", 
            description: "Badge not printed. Select a printer first.",
            variant: "destructive" 
          });
        } else {
          const printer = printers?.find(p => p.id === selectedPrinter);
          if (!printer) {
            toast({ 
              title: "Printer not found", 
              description: "The selected printer is no longer available.",
              variant: "destructive" 
            });
          } else {
            const printResponse = await fetch(`${bridgeUrl}/print`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                printer: { ipAddress: printer.ipAddress, port: printer.port || 9100 },
                badge: {
                  firstName: reg.firstName,
                  lastName: reg.lastName,
                  unicityId: reg.unicityId || "",
                  registrationId: reg.id,
                },
              }),
            });

            if (!printResponse.ok) {
              const errorData = await printResponse.json().catch(() => ({}));
              throw new Error(errorData.error || "Failed to print badge");
            }

            await apiRequest("POST", `/api/registrations/${reg.id}/record-print`, {
              printerId: selectedPrinter,
            });
            toast({ title: t("success"), description: "Badge printed" });
          }
        }
      }

      // Reset for next scan
      resetScan();
    } catch (error) {
      toast({ 
        title: t("error"), 
        description: error instanceof Error ? error.message : "Check-in failed",
        variant: "destructive" 
      });
    }
  };

  const filteredRegistrations = registrations?.filter((reg) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      reg.firstName.toLowerCase().includes(searchLower) ||
      reg.lastName.toLowerCase().includes(searchLower) ||
      reg.email.toLowerCase().includes(searchLower) ||
      reg.unicityId?.toLowerCase().includes(searchLower)
    );
  });

  const checkedInCount = registrations?.filter((r) => r.status === "checked_in").length ?? 0;
  const totalCount = registrations?.length ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("checkIn")}</h1>
          <p className="text-muted-foreground">Check in attendees and manage swag distribution</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedEvent} onValueChange={(v) => {
            setSelectedEvent(v);
            resetScan();
          }}>
            <SelectTrigger className="w-[220px]" data-testid="select-checkin-event">
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              {events?.filter(e => e.status === "published").map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedEvent && (
            <>
              <Badge variant="secondary" className="text-sm">
                {checkedInCount} / {totalCount} checked in
              </Badge>
              
              <div className="flex items-center border rounded-md overflow-hidden">
                <Button
                  variant={scanMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => { setScanMode("list"); resetScan(); }}
                  className="rounded-none"
                  data-testid="button-mode-list"
                >
                  <Search className="h-4 w-4 mr-1" />
                  List
                </Button>
                <Button
                  variant={scanMode === "scan" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setScanMode("scan")}
                  className="rounded-none"
                  data-testid="button-mode-scan"
                >
                  <QrCode className="h-4 w-4 mr-1" />
                  Scan
                </Button>
              </div>
              
              {printers && printers.length > 0 && (
                <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-printer">
                    <Printer className="h-4 w-4 mr-2 shrink-0" />
                    <SelectValue placeholder="Select printer" />
                  </SelectTrigger>
                  <SelectContent>
                    {printers.map((printer) => (
                      <SelectItem key={printer.id} value={printer.id}>
                        {printer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
        </div>
      </div>

      {selectedEvent && scanMode === "scan" && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 max-w-md mx-auto lg:mx-0">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Scan QR Code</CardTitle>
                <CardDescription>Point camera at attendee's QR code</CardDescription>
              </CardHeader>
              <CardContent>
                {!scanResult ? (
                  <QRScanner
                    onScan={handleQRScan}
                    onError={(error) => toast({ title: "Camera error", description: error, variant: "destructive" })}
                    paused={scannerPaused}
                  />
                ) : (
                  <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                    {scanResult.error ? (
                      <div className="text-center p-4">
                        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-2" />
                        <p className="text-destructive font-medium">{scanResult.error}</p>
                      </div>
                    ) : (
                      <div className="text-center p-4">
                        <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
                        <p className="text-muted-foreground">Attendee found</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex-1 max-w-md mx-auto lg:mx-0">
            {scanResult ? (
              <Card className={scanResult.alreadyCheckedIn ? "border-amber-500" : scanResult.error ? "border-destructive" : "border-green-500"}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">Scan Result</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={resetScan}
                      data-testid="button-reset-scan"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {scanResult.error ? (
                    <div className="text-center py-4">
                      <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                      <p className="font-medium text-destructive">{scanResult.error}</p>
                      <Button onClick={resetScan} className="mt-4" data-testid="button-scan-again">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Scan Again
                      </Button>
                    </div>
                  ) : scanResult.registration ? (
                    <>
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xl font-semibold">
                            {scanResult.registration.firstName} {scanResult.registration.lastName}
                          </h3>
                          <p className="text-muted-foreground truncate">{scanResult.registration.email}</p>
                          {scanResult.registration.unicityId && (
                            <p className="text-sm text-muted-foreground">ID: {scanResult.registration.unicityId}</p>
                          )}
                        </div>
                      </div>

                      {scanResult.alreadyCheckedIn && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
                          <AlertTriangle className="h-5 w-5 shrink-0" />
                          <div>
                            <p className="font-medium">Already Checked In</p>
                            {scanResult.registration.checkedInAt && (
                              <p className="text-sm">at {format(new Date(scanResult.registration.checkedInAt), "h:mm a")}</p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        {scanResult.registration.shirtSize && (
                          <span className="flex items-center gap-1.5">
                            <Shirt className="h-4 w-4" />
                            {scanResult.registration.shirtSize}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Package className="h-4 w-4" />
                          <StatusBadge status={scanResult.registration.swagStatus || "pending"} type="swag" />
                        </div>
                        {scanResult.registration.badgePrintCount && scanResult.registration.badgePrintCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <Printer className="h-3 w-3 mr-1" />
                            Printed {scanResult.registration.badgePrintCount}x
                          </Badge>
                        )}
                      </div>

                      <div className="pt-3 border-t space-y-2">
                        {!scanResult.alreadyCheckedIn ? (
                          <>
                            <Button 
                              onClick={() => handleQuickCheckIn(scanResult.registration!, selectedPrinter && bridgeUrl ? true : false)}
                              className="w-full"
                              data-testid="button-quick-checkin"
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Check In {selectedPrinter && bridgeUrl ? "+ Print Badge" : ""}
                            </Button>
                            {selectedPrinter && bridgeUrl && (
                              <Button 
                                variant="outline"
                                onClick={() => handleQuickCheckIn(scanResult.registration!, false)}
                                className="w-full"
                                data-testid="button-checkin-no-print"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Check In Only
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            <Button 
                              variant="secondary"
                              onClick={() => handlePrintBadge(scanResult.registration!)}
                              disabled={!selectedPrinter || !bridgeUrl}
                              className="w-full"
                              data-testid="button-reprint-badge"
                            >
                              <Printer className="h-4 w-4 mr-2" />
                              Reprint Badge
                            </Button>
                          </>
                        )}
                        <Button 
                          variant="ghost"
                          onClick={resetScan}
                          className="w-full"
                          data-testid="button-next-scan"
                        >
                          <QrCode className="h-4 w-4 mr-2" />
                          Scan Next
                        </Button>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <QrCode className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Ready to Scan</h3>
                  <p className="text-muted-foreground text-sm">
                    Point the camera at an attendee's QR code to check them in
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {selectedEvent && scanMode === "list" && (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-lg"
              autoFocus
              data-testid="input-checkin-search"
            />
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-3">
                    <div className="h-6 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-10 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredRegistrations?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{t("noResults")}</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? "No attendees match your search" : "No registrations for this event"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRegistrations?.map((reg) => (
                <Card
                  key={reg.id}
                  className={reg.status === "checked_in" ? "border-green-200 dark:border-green-900" : ""}
                  data-testid={`card-checkin-${reg.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-lg font-semibold truncate">
                          {reg.firstName} {reg.lastName}
                        </CardTitle>
                        <CardDescription className="truncate">{reg.email}</CardDescription>
                      </div>
                      <StatusBadge status={reg.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                      {reg.unicityId && (
                        <span className="flex items-center gap-1.5">
                          <User className="h-4 w-4 shrink-0" />
                          <span>{reg.unicityId}</span>
                        </span>
                      )}
                      {reg.shirtSize && (
                        <span className="flex items-center gap-1.5">
                          <Shirt className="h-4 w-4 shrink-0" />
                          <span>{reg.shirtSize}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                        <StatusBadge status={reg.swagStatus || "pending"} type="swag" />
                      </div>
                      {reg.badgePrintCount && reg.badgePrintCount > 0 ? (
                        <Badge variant="outline" className="text-xs">
                          <Printer className="h-3 w-3 mr-1" />
                          Printed {reg.badgePrintCount}x
                        </Badge>
                      ) : null}
                    </div>

                    <div className="pt-2 border-t space-y-2">
                      {reg.status !== "checked_in" ? (
                        <Button
                          onClick={() => checkInMutation.mutate(reg.id)}
                          disabled={checkInMutation.isPending}
                          className="w-full"
                          data-testid={`button-checkin-${reg.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Check In
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>Checked in {reg.checkedInAt && `at ${format(new Date(reg.checkedInAt), "h:mm a")}`}</span>
                        </div>
                      )}

                      {reg.swagStatus !== "picked_up" && (
                        <Button
                          variant="outline"
                          onClick={() => markSwagMutation.mutate(reg.id)}
                          disabled={markSwagMutation.isPending}
                          className="w-full"
                          data-testid={`button-swag-${reg.id}`}
                        >
                          <Package className="h-4 w-4 mr-2" />
                          {t("markSwagPickedUp")}
                        </Button>
                      )}

                      {reg.status === "checked_in" && selectedPrinter && (
                        <Button
                          variant="secondary"
                          onClick={() => handlePrintBadge(reg)}
                          disabled={printBadgeMutation.isPending}
                          className="w-full"
                          data-testid={`button-print-${reg.id}`}
                        >
                          <Printer className="h-4 w-4 mr-2" />
                          {reg.badgePrintCount && reg.badgePrintCount > 0 ? "Reprint Badge" : "Print Badge"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!selectedEvent && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Select an Event</h3>
            <p className="text-muted-foreground">Choose an event to start checking in attendees</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!reprintConfirmReg}
        onOpenChange={(open) => !open && setReprintConfirmReg(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprint Badge</AlertDialogTitle>
            <AlertDialogDescription>
              This badge has already been printed {reprintConfirmReg?.badgePrintCount} time(s).
              Are you sure you want to print another badge for {reprintConfirmReg?.firstName} {reprintConfirmReg?.lastName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReprint}
              data-testid="button-confirm-reprint"
            >
              <Printer className="h-4 w-4 mr-2" />
              Reprint Badge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
