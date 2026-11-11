"use client";

import { PlanProvider, type PlanSessionProfile } from "@/lib/plan";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { PaletteProvider } from "@/components/palette/CommandPalette";

/**
 * Single app-wide client boundary for the context providers (Pkg9 · N1/N5).
 *
 * Mounting these at the root (not inside <Shell>) guarantees ONE instance of
 * each context in the client graph. When the providers lived in Shell, the
 * `children`-slot pattern (a Server page passing a client subtree as children)
 * split the context module across bundles, so deep consumers (GetStartedCard,
 * SearchBar) read a stale/duplicate context and never saw locale changes.
 */
export function Providers({
  children,
  initialProfile,
}: {
  children: React.ReactNode;
  initialProfile: PlanSessionProfile | null;
}) {
  return (
    <PlanProvider initialProfile={initialProfile}>
      <LocaleProvider>
        <ThemeProvider>
          <PaletteProvider>{children}</PaletteProvider>
        </ThemeProvider>
      </LocaleProvider>
    </PlanProvider>
  );
}
