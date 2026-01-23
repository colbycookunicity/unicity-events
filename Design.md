# Design System

A design system documentation capturing the actual implementation used in this application. All entries are backed by code.

---

## Table of Contents

1. [Typography](#typography)
2. [Color Palette](#color-palette)
3. [Logo Assets](#logo-assets)
4. [Buttons](#buttons)
5. [Form Inputs](#form-inputs)
6. [Cards](#cards)
7. [Badges](#badges)
8. [Language Selector](#language-selector)
9. [Dark Mode](#dark-mode)
10. [Icons](#icons)
11. [Elevation & Interactions](#elevation--interactions)
12. [Status Colors](#status-colors)
13. [Shadows](#shadows)
14. [Phone Input](#phone-input)

---

## Typography

### Font Family

**Source**: `client/index.html` and `client/src/index.css`

- **Primary Font**: Poppins (Google Fonts)
- **Fallback**: sans-serif

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">
```

### Loaded Weights

- 300 (Light)
- 400 (Regular)
- 500 (Medium)
- 600 (SemiBold)
- 700 (Bold)
- 400 Italic, 500 Italic

### CSS Variables

**Source**: `client/src/index.css` lines 60-62

```css
--font-sans: 'Poppins', sans-serif;
--font-serif: 'Poppins', sans-serif;
--font-mono: 'Poppins', sans-serif;
```

### Tailwind Font Families

**Source**: `tailwind.config.ts` lines 85-89

```ts
fontFamily: {
  sans: ["var(--font-sans)"],
  serif: ["var(--font-serif)"],
  mono: ["var(--font-mono)"],
},
```

### Typography in Components

| Component | Class | Source |
|-----------|-------|--------|
| CardTitle | `text-2xl font-semibold` | `card.tsx` line 39 |
| CardDescription | `text-sm text-muted-foreground` | `card.tsx` line 53 |
| Button | `text-sm font-medium` | `button.tsx` line 8 |
| Badge | `text-xs font-semibold` | `badge.tsx` line 8 |

---

## Color Palette

### Light Mode (:root)

**Source**: `client/src/index.css` lines 20-103

| Token | HSL Value | Description |
|-------|-----------|-------------|
| `--background` | 210 20% 96% | Page background |
| `--foreground` | 210 100% 12% | Primary text |
| `--card` | 0 0% 100% | Card background |
| `--card-foreground` | 210 100% 12% | Card text |
| `--card-border` | 210 15% 92% | Card border |
| `--primary` | 210 100% 19.61% | Primary brand color |
| `--primary-foreground` | 0 0% 100% | Text on primary |
| `--secondary` | 209 54% 74% | Secondary color |
| `--secondary-foreground` | 210 100% 12% | Text on secondary |
| `--muted` | 210 15% 92% | Muted background |
| `--muted-foreground` | 210 20% 45% | Muted/secondary text |
| `--accent` | 169 31% 50% | Accent color (teal) |
| `--accent-foreground` | 0 0% 100% | Text on accent |
| `--destructive` | 0 70% 50% | Error/danger color |
| `--destructive-foreground` | 0 0% 100% | Text on destructive |
| `--border` | 210 15% 88% | Default borders |
| `--input` | 210 15% 85% | Input borders |
| `--ring` | 210 100% 19.61% | Focus ring color |
| `--popover` | 0 0% 100% | Popover background |
| `--popover-foreground` | 210 100% 12% | Popover text |

### Dark Mode (.dark)

**Source**: `client/src/index.css` lines 105-182

| Token | HSL Value | Description |
|-------|-----------|-------------|
| `--background` | 210 25% 8% | Page background |
| `--foreground` | 210 20% 96% | Primary text |
| `--card` | 210 25% 12% | Card background |
| `--card-foreground` | 210 20% 96% | Card text |
| `--primary` | 209 54% 60% | Primary (lighter for dark bg) |
| `--primary-foreground` | 210 25% 8% | Text on primary |
| `--secondary` | 210 30% 25% | Secondary color |
| `--muted` | 210 20% 18% | Muted background |
| `--muted-foreground` | 210 15% 55% | Muted text |
| `--accent` | 169 31% 40% | Accent (darker teal) |
| `--destructive` | 0 65% 55% | Error color |

### Sidebar Colors

| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| `--sidebar` | 210 100% 12% | 210 30% 6% |
| `--sidebar-foreground` | 210 20% 96% | 210 20% 96% |
| `--sidebar-border` | 210 80% 20% | 210 25% 15% |
| `--sidebar-primary` | 210 100% 19.61% | 209 54% 60% |
| `--sidebar-accent` | 210 80% 20% | 210 30% 18% |

### Chart Colors

| Token | Value |
|-------|-------|
| `--chart-1` | Same as primary |
| `--chart-2` | 313 35% 56% (purple) |
| `--chart-3` | 169 31% 50% (teal) |
| `--chart-4` | 209 54% 74% (light blue) |
| `--chart-5` | 48 90% 63% (yellow) |

---

## Logo Assets

**Source**: `client/src/assets/`

| File | Description |
|------|-------------|
| `unicity-logo.png` | Standard logo |
| `unicity-logo-white.png` | White variant for dark backgrounds |
| `unicity-logo-dark.png` | Dark variant |

### Import Example

```tsx
import unicityLogo from "@/assets/unicity-logo.png";
import unicityLogoWhite from "@/assets/unicity-logo-white.png";
```

---

## Buttons

**Source**: `client/src/components/ui/button.tsx`

### Base Classes (line 7-9)

```
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium 
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring 
disabled:pointer-events-none disabled:opacity-50 
[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0
hover-elevate active-elevate-2
```

### Variants (lines 11-24)

| Variant | Classes |
|---------|---------|
| `default` | `bg-primary text-primary-foreground border border-primary-border` |
| `destructive` | `bg-destructive text-destructive-foreground border border-destructive-border` |
| `outline` | `border [border-color:var(--button-outline)] shadow-xs active:shadow-none` |
| `secondary` | `border bg-secondary text-secondary-foreground border-secondary-border` |
| `ghost` | `border border-transparent` |

### Sizes (lines 28-33)

| Size | Classes |
|------|---------|
| `default` | `min-h-9 px-4 py-2` |
| `sm` | `min-h-8 rounded-md px-3 text-xs` |
| `lg` | `min-h-10 rounded-md px-8` |
| `icon` | `h-9 w-9` |

### Usage

```tsx
import { Button } from "@/components/ui/button";

<Button variant="default">Primary Action</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost" size="icon"><Icon /></Button>
```

---

## Form Inputs

**Source**: `client/src/components/ui/input.tsx`

### Classes (lines 11-12)

```
flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 
text-base ring-offset-background 
file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground 
placeholder:text-muted-foreground 
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 
disabled:cursor-not-allowed disabled:opacity-50 
md:text-sm
```

### Key Properties

- Height: `h-9` (36px) - matches button default height
- Border: `border-input`
- Border radius: `rounded-md`
- Background: `bg-background`
- Focus: 2px ring with `ring-ring` color

---

## Cards

**Source**: `client/src/components/ui/card.tsx`

### Card Component (lines 11-13)

```
rounded-xl border bg-card border-card-border text-card-foreground shadow-sm
```

### CardHeader (line 26)

```
flex flex-col space-y-1.5 p-6
```

### CardTitle (lines 38-39)

```
text-2xl font-semibold leading-none tracking-tight
```

### CardDescription (line 53)

```
text-sm text-muted-foreground
```

### CardContent (line 63)

```
p-6 pt-0
```

### CardFooter (line 73)

```
flex items-center p-6 pt-0
```

---

## Badges

**Source**: `client/src/components/ui/badge.tsx`

### Base Classes (lines 7-9)

```
whitespace-nowrap inline-flex items-center rounded-md border px-2.5 py-0.5 
text-xs font-semibold transition-colors 
focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
hover-elevate
```

### Variants (lines 12-19)

| Variant | Classes |
|---------|---------|
| `default` | `border-transparent bg-primary text-primary-foreground shadow-xs` |
| `secondary` | `border-transparent bg-secondary text-secondary-foreground` |
| `destructive` | `border-transparent bg-destructive text-destructive-foreground shadow-xs` |
| `outline` | `border [border-color:var(--badge-outline)] shadow-xs` |

---

## Language Selector

### Behavior

**Source**: `client/src/components/LanguageToggle.tsx`

- Renders as ghost button with `EN / ES` text
- Active language is bold (`font-bold text-foreground`)
- Inactive language is muted (`font-normal text-muted-foreground`)
- Clicking toggles between `en` and `es`

### Implementation

```tsx
<Button variant="ghost" size="sm" onClick={toggleLanguage} className="gap-1">
  <span className={language === "en" ? "font-bold text-foreground" : "font-normal text-muted-foreground"}>EN</span>
  <span className="text-muted-foreground/50">/</span>
  <span className={language === "es" ? "font-bold text-foreground" : "font-normal text-muted-foreground"}>ES</span>
</Button>
```

### State Management

**Source**: `client/src/lib/i18n.ts`

- **Store**: Zustand
- **Storage**: localStorage
- **Key**: `language`
- **Values**: `'en'` (default) or `'es'`

```tsx
const { language, setLanguage } = useLanguage();
const { t } = useTranslation();
```

### Supported Languages

| Code | Language |
|------|----------|
| `en` | English (default) |
| `es` | Spanish |

### Translation Usage

```tsx
const { t } = useTranslation();
<span>{t('save')}</span> // "Save" or "Guardar"
```

---

## Dark Mode

**Source**: `client/src/components/ThemeProvider.tsx`

### Implementation

- Uses React Context with `ThemeProvider`
- Adds/removes `dark` or `light` class on `document.documentElement`
- Supports `system` preference detection
- **Storage**: localStorage
- **Key**: `unicity-events-theme`
- **Values**: `'dark'`, `'light'`, or `'system'`

### ThemeProvider Usage

```tsx
<ThemeProvider defaultTheme="system" storageKey="unicity-events-theme">
  {children}
</ThemeProvider>
```

### ThemeToggle Component

**Source**: `client/src/components/ThemeToggle.tsx`

```tsx
const { theme, setTheme } = useTheme();

<Button variant="ghost" size="icon" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
  <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
  <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
</Button>
```

### Tailwind Config

**Source**: `tailwind.config.ts` line 4

```ts
darkMode: ["class"],
```

---

## Icons

### Library

- **Primary**: `lucide-react`

### Sizing in Buttons

**Source**: `button.tsx` line 8

```
[&_svg]:size-4
```

SVGs inside buttons are automatically sized to 16x16px.

### Common Icons Used

Based on codebase imports:

- Loading: `Loader2` (with `animate-spin`)
- Success: `CheckCircle`, `CheckCircle2`
- Error/Warning: `AlertCircle`, `AlertTriangle`
- Navigation: `ArrowLeft`, `ArrowRight`, `ChevronRight`
- Actions: `Plus`, `Edit`, `Pencil`, `Trash2`, `Download`, `Save`
- Content: `Calendar`, `MapPin`, `Mail`, `User`, `Phone`
- UI: `Search`, `Settings`, `LogOut`, `ExternalLink`
- Theme: `Sun`, `Moon`

---

## Elevation & Interactions

**Source**: `client/src/index.css` lines 194-284

### Elevation Variables

| Variable | Light Mode | Dark Mode |
|----------|------------|-----------|
| `--elevate-1` | `rgba(0,0,0, .03)` | `rgba(255,255,255, .04)` |
| `--elevate-2` | `rgba(0,0,0, .08)` | `rgba(255,255,255, .09)` |
| `--button-outline` | `rgba(0,0,0, .10)` | `rgba(255,255,255, .10)` |
| `--badge-outline` | `rgba(0,0,0, .05)` | `rgba(255,255,255, .05)` |

### Utility Classes

| Class | Effect |
|-------|--------|
| `hover-elevate` | Applies `--elevate-1` background on hover via `::after` pseudo-element |
| `active-elevate-2` | Applies `--elevate-2` background on active/pressed state |
| `toggle-elevate` | Base class for toggleable elements |
| `toggle-elevated` | Applied with `toggle-elevate` to show elevated state |
| `no-default-hover-elevate` | Disables hover elevation on components that have it by default |
| `no-default-active-elevate` | Disables active elevation on components that have it by default |

### How It Works

Uses `::after` pseudo-element positioned absolutely over the element with `border-radius: inherit`.

### Built-in Elevation

- `Button`: Has `hover-elevate active-elevate-2` built in
- `Badge`: Has `hover-elevate` built in

---

## Status Colors

**Source**: `client/src/index.css` lines 75-80 (light) and 154-159 (dark)

### Light Mode

| Status | HSL Value |
|--------|-----------|
| `--status-registered` | 142 70% 45% (green) |
| `--status-qualified` | 48 90% 50% (amber) |
| `--status-not-coming` | 210 15% 60% (gray) |
| `--status-checked-in` | 209 54% 50% (blue) |
| `--status-pending` | 30 80% 55% (orange) |

### Dark Mode

| Status | HSL Value |
|--------|-----------|
| `--status-registered` | 142 60% 50% |
| `--status-qualified` | 48 80% 55% |
| `--status-not-coming` | 210 15% 50% |
| `--status-checked-in` | 209 54% 55% |
| `--status-pending` | 30 70% 55% |

---

## Shadows

**Source**: `client/src/index.css` lines 64-71 (light) and 145-152 (dark)

### Light Mode

Shadows use blue-tinted black: `rgba(0, 55, 100, opacity)`

| Token | Value |
|-------|-------|
| `--shadow-2xs` | 0px 1px 2px 0px rgba(0, 55, 100, 0.05) |
| `--shadow-xs` | 0px 1px 3px 0px rgba(0, 55, 100, 0.08) |
| `--shadow-sm` | 0px 2px 4px 0px rgba(0, 55, 100, 0.08) |
| `--shadow` | 0px 4px 6px -1px rgba(0, 55, 100, 0.08) |
| `--shadow-md` | 0px 6px 10px -2px rgba(0, 55, 100, 0.10) |
| `--shadow-lg` | 0px 10px 15px -3px rgba(0, 55, 100, 0.10) |
| `--shadow-xl` | 0px 15px 25px -5px rgba(0, 55, 100, 0.12) |
| `--shadow-2xl` | 0px 25px 50px -12px rgba(0, 55, 100, 0.15) |

### Dark Mode

Shadows use pure black with higher opacity: `rgba(0, 0, 0, opacity)`

| Token | Value |
|-------|-------|
| `--shadow-2xs` | 0px 1px 2px 0px rgba(0, 0, 0, 0.3) |
| `--shadow-xs` | 0px 1px 3px 0px rgba(0, 0, 0, 0.4) |
| `--shadow-sm` | 0px 2px 4px 0px rgba(0, 0, 0, 0.4) |
| `--shadow` | 0px 4px 6px -1px rgba(0, 0, 0, 0.4) |
| `--shadow-md` | 0px 6px 10px -2px rgba(0, 0, 0, 0.5) |
| `--shadow-lg` | 0px 10px 15px -3px rgba(0, 0, 0, 0.5) |
| `--shadow-xl` | 0px 15px 25px -5px rgba(0, 0, 0, 0.6) |
| `--shadow-2xl` | 0px 25px 50px -12px rgba(0, 0, 0, 0.7) |

---

## Phone Input

**Source**: `client/src/index.css` lines 286-337

Custom styling for `react-phone-number-input` library.

### Classes

| Class | Styles |
|-------|--------|
| `.PhoneInput` | `display: flex; align-items: center; gap: 0.5rem;` |
| `.PhoneInputCountry` | `display: flex; align-items: center; padding: 0.25rem; border-radius: var(--radius);` |
| `.PhoneInputCountryIcon` | `width: 1.5rem; height: 1rem; border-radius: 2px; overflow: hidden;` |
| `.PhoneInputInput` | `flex: 1; min-width: 0; background: transparent; border: none; outline: none;` |

### Dark Mode Adaptation

Arrow indicator color adapts using `border-color: hsl(var(--muted-foreground))`.

---

## Border Radius

**Source**: `tailwind.config.ts` lines 8-12

| Token | Value | Pixels |
|-------|-------|--------|
| `rounded-sm` | 0.1875rem | 3px |
| `rounded-md` | 0.375rem | 6px |
| `rounded-lg` | 0.5625rem | 9px |
| (default `--radius`) | 0.375rem | 6px |

---

## File References

| File | Purpose |
|------|---------|
| `client/index.html` | Font loading |
| `client/src/index.css` | CSS variables, utilities |
| `tailwind.config.ts` | Theme configuration |
| `client/src/components/ui/*.tsx` | Component implementations |
| `client/src/lib/i18n.ts` | Language state & translations |
| `client/src/components/ThemeProvider.tsx` | Dark mode provider |
| `client/src/components/ThemeToggle.tsx` | Theme toggle button |
| `client/src/components/LanguageToggle.tsx` | Language toggle button |
