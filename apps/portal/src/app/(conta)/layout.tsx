import { requireUser } from "@/lib/auth";

export default async function ContaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The account area is the sole authenticated surface reachable while the
  // temporary-password flag is active.
  await requireUser({ allowPasswordChange: true });

  return children;
}
