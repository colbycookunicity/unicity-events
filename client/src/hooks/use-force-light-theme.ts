import { useEffect } from "react";

/**
 * Forces light theme on public-facing pages.
 * Temporarily removes the 'dark' class from documentElement
 * and restores it when the component unmounts.
 */
export function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    
    // Remove dark class to force light theme
    root.classList.remove("dark");
    
    // Restore previous theme on unmount
    return () => {
      if (hadDarkClass) {
        root.classList.add("dark");
      }
    };
  }, []);
}
