import { jobGlyph } from "@/components/map/skilltree-data";

/**
 * Renders the same 0 0 24 24 stroke glyph the map uses for a job, by name.
 * The path fragments are static, trusted data from skilltree-data.ts.
 */
export function JobGlyph({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: jobGlyph(name) }}
    />
  );
}
