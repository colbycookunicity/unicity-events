import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { useAuth, setAuthToken } from "@/lib/auth";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import unicityLogo from "@/assets/unicity-logo.png";

type LoginStep = "email" | "otp";

export default function LoginPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();

  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const handleSendCode = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/otp/generate", { email });
      await res.json();
      setStep("otp");
      toast({
        title: t("emailSent"),
        description: `Code sent to ${email}`,
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: "Failed to send verification code",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (isVerified || isLoading) return;
    
    if (otpCode.length !== 6) {
      toast({
        title: t("invalidCode"),
        description: "Please enter a 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/otp/validate", {
        email,
        code: otpCode,
      });
      const data = await res.json();
      
      if (data.success && data.user) {
        setIsVerified(true);
        setUser(data.user);
        setAuthToken(data.token);
        toast({
          title: t("success"),
          description: "Successfully signed in",
        });
        setLocation("/admin");
      }
    } catch (error) {
      toast({
        title: t("invalidCode"),
        description: "Please check your code and try again",
        variant: "destructive",
      });
      setOtpCode("");
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setOtpCode("");
    await handleSendCode();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-end gap-2 p-4">
        <LanguageToggle />
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <img 
              src={unicityLogo} 
              alt="Unicity" 
              className="mx-auto h-14 w-14 rounded-md object-cover"
              data-testid="img-unicity-logo"
            />
            <div>
              <CardTitle className="text-2xl font-semibold">
                Unicity Events
              </CardTitle>
              <CardDescription className="mt-2">
                {step === "email" ? t("enterEmail") : t("enterCode")}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {step === "email" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@unicity.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                      className="pl-10"
                      data-testid="input-email"
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSendCode}
                  disabled={isLoading || !email}
                  data-testid="button-send-code"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("sendCode")
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Code sent to {email}</span>
                  </div>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={setOtpCode}
                      data-testid="input-otp"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={handleVerifyCode}
                    disabled={isLoading || isVerified || otpCode.length !== 6}
                    data-testid="button-verify-code"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("verifyCode")
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    data-testid="button-resend-code"
                  >
                    {t("resendCode")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      setStep("email");
                      setOtpCode("");
                    }}
                    data-testid="button-change-email"
                  >
                    Change email
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="p-4 text-center text-sm text-muted-foreground">
        Unicity International
      </footer>
    </div>
  );
}
