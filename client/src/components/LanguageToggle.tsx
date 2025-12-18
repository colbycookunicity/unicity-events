import { useLanguage, type Language } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div 
      className="flex items-center bg-muted rounded-full p-0.5"
      data-testid="toggle-language"
    >
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
          language === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid="button-language-en"
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("es")}
        className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
          language === "es"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid="button-language-es"
      >
        ES
      </button>
    </div>
  );
}
