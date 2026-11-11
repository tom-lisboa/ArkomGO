import { Shell } from "@/components/Shell";
import { SettingsContent } from "@/components/settings/SettingsContent";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ "primeiro-acesso"?: string }>;
}) {
  const query = await searchParams;
  return (
    <Shell>
      <SettingsContent firstAccess={query["primeiro-acesso"] === "1"} />
    </Shell>
  );
}
