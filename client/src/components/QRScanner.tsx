import { useState, useCallback, useEffect } from "react";
import { Scanner, IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, CameraOff, RefreshCw, SwitchCamera, AlertCircle, Pause } from "lucide-react";

export function parseQRCode(rawData: string): { registrationId: string | null; raw: string } {
  if (rawData.startsWith("REG:")) {
    return { registrationId: rawData.replace("REG:", ""), raw: rawData };
  } else if (rawData.match(/^[0-9a-f-]{36}$/i)) {
    return { registrationId: rawData, raw: rawData };
  }
  return { registrationId: null, raw: rawData };
}

interface QRScannerProps {
  onScan: (registrationId: string) => void;
  onError?: (error: string) => void;
  isProcessing?: boolean;
  disabled?: boolean;
  paused?: boolean;
}

export function QRScanner({ onScan, onError, isProcessing = false, disabled = false, paused = false }: QRScannerProps) {
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const handleScan = useCallback((detectedCodes: IDetectedBarcode[]) => {
    if (disabled || isProcessing || !isActive || paused) return;
    
    const code = detectedCodes[0];
    if (!code?.rawValue) return;
    
    const value = code.rawValue;
    
    if (value === lastScanned) return;
    setLastScanned(value);
    
    if (value.startsWith("REG:")) {
      const registrationId = value.replace("REG:", "");
      onScan(registrationId);
    } else if (value.match(/^[0-9a-f-]{36}$/i)) {
      onScan(value);
    } else {
      setError("Invalid QR code format. Please scan a registration QR code.");
      onError?.("Invalid QR code format");
    }
  }, [onScan, onError, isProcessing, disabled, isActive, lastScanned, paused]);

  const handleError = useCallback((err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes("NotAllowedError")) {
      setError("Camera access denied. Please allow camera access to scan QR codes.");
    } else if (errorMessage.includes("NotFoundError")) {
      setError("No camera found. Please ensure your device has a camera.");
    } else {
      setError(`Camera error: ${errorMessage}`);
    }
    onError?.(errorMessage);
  }, [onError]);

  useEffect(() => {
    if (lastScanned) {
      const timer = setTimeout(() => setLastScanned(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [lastScanned]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  };

  const restartScanner = () => {
    setError(null);
    setIsActive(false);
    setTimeout(() => setIsActive(true), 100);
  };

  if (!isActive) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
          <CameraOff className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground text-center">Camera is paused</p>
          <Button onClick={() => setIsActive(true)} data-testid="button-start-camera">
            <Camera className="h-4 w-4 mr-2" />
            Start Camera
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={restartScanner}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-w-md mx-auto w-full">
        <Scanner
          onScan={handleScan}
          onError={handleError}
          constraints={{
            facingMode: facingMode,
          }}
          styles={{
            container: { width: "100%", height: "100%" },
            video: { width: "100%", height: "100%", objectFit: "cover" },
          }}
          components={{
            audio: false,
            torch: true,
          }}
        />
        
        {paused && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-white text-center">
              <Pause className="h-12 w-12 mx-auto mb-2 opacity-70" />
              <p className="text-sm opacity-70">Scanner Paused</p>
            </div>
          </div>
        )}
        
        {isProcessing && !paused && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent mx-auto mb-2" />
              <p>Processing...</p>
            </div>
          </div>
        )}
        
        <div className="absolute inset-4 border-2 border-white/50 rounded-lg pointer-events-none">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
        </div>
      </div>
      
      <div className="flex justify-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={toggleCamera}
          data-testid="button-switch-camera"
        >
          <SwitchCamera className="h-4 w-4 mr-2" />
          Switch Camera
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsActive(false)}
          data-testid="button-pause-camera"
        >
          <CameraOff className="h-4 w-4 mr-2" />
          Pause
        </Button>
      </div>
      
      <p className="text-center text-sm text-muted-foreground">
        Point your camera at an attendee's QR code to check them in
      </p>
    </div>
  );
}
