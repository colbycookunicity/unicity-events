import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Download } from "lucide-react";
import { useRef } from "react";

interface RegistrationQRCodeProps {
  registrationId: string;
  attendeeName?: string;
  eventName?: string;
  size?: number;
  showDownload?: boolean;
}

export function RegistrationQRCode({ 
  registrationId, 
  attendeeName,
  eventName,
  size = 200,
  showDownload = false 
}: RegistrationQRCodeProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  
  const qrValue = `REG:${registrationId}`;
  
  const handleDownload = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    img.onload = () => {
      canvas.width = size + 40;
      canvas.height = size + 40;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20);
      
      const link = document.createElement("a");
      link.download = `registration-qr-${registrationId.slice(0, 8)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };
  
  return (
    <div className="flex flex-col items-center gap-4" data-testid="qr-registration">
      <div 
        ref={qrRef}
        className="bg-white p-4 rounded-lg"
      >
        <QRCodeSVG 
          value={qrValue} 
          size={size}
          level="M"
          includeMargin={false}
        />
      </div>
      
      {(attendeeName || eventName) && (
        <div className="text-center text-sm text-muted-foreground">
          {attendeeName && <p className="font-medium">{attendeeName}</p>}
          {eventName && <p>{eventName}</p>}
        </div>
      )}
      
      {showDownload && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDownload}
          data-testid="button-download-qr"
        >
          <Download className="h-4 w-4 mr-2" />
          Download QR Code
        </Button>
      )}
    </div>
  );
}

interface QRCodeDialogProps {
  registrationId: string;
  attendeeName?: string;
  eventName?: string;
  trigger?: React.ReactNode;
  t?: (en: string, es: string) => string;
}

export function QRCodeDialog({ 
  registrationId, 
  attendeeName, 
  eventName,
  trigger,
  t = (en) => en
}: QRCodeDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid="button-show-qr">
            <QrCode className="h-4 w-4 mr-2" />
            {t("Show QR Code", "Mostrar Código QR")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {t("Your Check-In QR Code", "Tu Código QR de Registro")}
          </DialogTitle>
        </DialogHeader>
        <Card className="border-0 shadow-none">
          <CardContent className="flex flex-col items-center p-6">
            <RegistrationQRCode 
              registrationId={registrationId}
              attendeeName={attendeeName}
              eventName={eventName}
              size={220}
              showDownload={true}
            />
            <p className="text-xs text-muted-foreground text-center mt-4">
              {t(
                "Show this code at check-in for fast entry",
                "Muestra este código en el registro para entrada rápida"
              )}
            </p>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
