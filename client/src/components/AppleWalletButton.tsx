import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";

interface AppleWalletButtonProps {
  checkInToken: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function AppleWalletButton({ checkInToken, className = "", size = "default" }: AppleWalletButtonProps) {
  const walletUrl = `/api/wallet/${checkInToken}`;

  return (
    <Button
      variant="outline"
      size={size}
      className={`gap-2 ${className}`}
      asChild
      data-testid="button-add-to-wallet"
    >
      <a href={walletUrl} download>
        <Wallet className="h-4 w-4" />
        <span>Add to Apple Wallet</span>
      </a>
    </Button>
  );
}

interface AppleWalletButtonBilingualProps {
  checkInToken: string;
  language?: "en" | "es";
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function AppleWalletButtonBilingual({ 
  checkInToken, 
  language = "en",
  className = "", 
  size = "default" 
}: AppleWalletButtonBilingualProps) {
  const walletUrl = `/api/wallet/${checkInToken}`;
  const label = language === "es" ? "Agregar a Apple Wallet" : "Add to Apple Wallet";

  return (
    <Button
      variant="outline"
      size={size}
      className={`gap-2 ${className}`}
      asChild
      data-testid="button-add-to-wallet"
    >
      <a href={walletUrl} download>
        <Wallet className="h-4 w-4" />
        <span>{label}</span>
      </a>
    </Button>
  );
}
