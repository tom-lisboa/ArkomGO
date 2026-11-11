import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Marcellus } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getSessionUser } from "@/lib/auth";
import { isPro } from "@/lib/entitlements";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arkom",
  description:
    "Arkom — your AI workforce HQ. Install runnable skills, build your second brain, and put your AI employees to work.",
};

export const viewport: Viewport = {
  themeColor: "#0E0E0E",
};

/* Pre-paint script (Pkg9 · N1+N5) — reads theme + locale from localStorage and
   applies data-theme + lang + the shadcn `.dark` class BEFORE first paint, so
   there is no flash of the wrong theme on reload. One script for both axes. */
const BOOT = `(function(){try{
var t=localStorage.getItem('skilltree-theme');if(t!=='light'&&t!=='dark')t='dark';
var l=localStorage.getItem('skilltree-locale');if(l!=='pt'&&l!=='en')l='pt';
var e=document.documentElement;
e.setAttribute('data-theme',t);e.lang=l;
if(t==='dark')e.classList.add('dark');else e.classList.remove('dark');
}catch(_){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionUser = await getSessionUser();
  // ⚠ Segundo produtor do perfil de sessão (o outro é src/app/api/auth/_shared.ts).
  // `isPro` TEM de sair da mesma função nos dois, senão a UI pisca entre o SSR
  // e o fetch de /api/auth/session feito pelo PlanProvider.
  const initialProfile = sessionUser
    ? {
        id: sessionUser.id,
        fullName: sessionUser.full_name,
        email: sessionUser.email,
        role: sessionUser.role,
        mustChangePassword: sessionUser.must_change_password === 1,
        isPro: await isPro(sessionUser),
      }
    : null;

  return (
    <html
      lang="pt-BR"
      className={`${jakarta.variable} ${marcellus.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="min-h-full">
        <Providers initialProfile={initialProfile}>{children}</Providers>
      </body>
    </html>
  );
}
