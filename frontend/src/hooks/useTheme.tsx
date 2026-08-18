/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "dark" | "light" | "system";

type ThemeContextValue = {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = "jilora-theme";

function readTheme(): ThemeMode {
    const value = window.localStorage.getItem(storageKey);
    return value === "light" || value === "system" ? value : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<ThemeMode>(readTheme);

    useEffect(() => {
        window.localStorage.setItem(storageKey, theme);
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: light)");
        const update = () => {
            document.documentElement.dataset.resolvedTheme = theme === "system" ? (media.matches ? "light" : "dark") : theme;
        };
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, [theme]);

    const value = useMemo(() => ({ theme, setTheme }), [theme]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const value = useContext(ThemeContext);
    if (!value) throw new Error("useTheme must be used inside ThemeProvider");
    return value;
}
