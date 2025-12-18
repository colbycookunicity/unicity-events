import { Button } from "@/components/ui/button";
import { useLanguage, type Language } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    const newLang: Language = language === "en" ? "es" : "en";
    setLanguage(newLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="gap-1"
      data-testid="button-language-toggle"
    >
      <span className={language === "en" ? "font-bold text-foreground" : "font-normal text-muted-foreground"}>
        EN
      </span>
      <span className="text-muted-foreground/50">/</span>
      <span className={language === "es" ? "font-bold text-foreground" : "font-normal text-muted-foreground"}>
        ES
      </span>
    </Button>
  );
}
