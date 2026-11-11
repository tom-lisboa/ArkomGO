"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";

export type Plan = "free" | "pro";
const PLAN_KEY = "skilltree-plan";
export const ARKOM_DEMO_PLAN_ENABLED =
  process.env.NEXT_PUBLIC_ARKOM_ENABLE_DEMO_PLAN === "true";

export type PlanSessionProfile = {
  id: number;
  fullName: string;
  email: string;
  role: "admin" | "student";
  mustChangePassword: boolean;
  isPro: boolean;
};

type SessionResponse =
  | { authenticated: false; user: null; error?: string }
  | { authenticated: true; user: PlanSessionProfile; error?: string };

interface PlanCtx {
  plan: Plan;
  isPro: boolean;
  isLoggedIn: boolean;
  email: string | null;
  role: "admin" | "student" | null;
  upgrade: () => void;
  downgrade: () => void;
  toggle: () => void;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  showToast: (message: string) => void;
}

const Ctx = createContext<PlanCtx | null>(null);

const PLAN_CHANGE_EVENT = "arkom-demo-plan-change";

function readDemoPlan(): Plan {
  if (!ARKOM_DEMO_PLAN_ENABLED || typeof window === "undefined") return "free";
  try {
    return localStorage.getItem(PLAN_KEY) === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

function subscribeToDemoPlan(onStoreChange: () => void) {
  if (!ARKOM_DEMO_PLAN_ENABLED) return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === PLAN_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PLAN_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PLAN_CHANGE_EVENT, onStoreChange);
  };
}

function demoPlanServerSnapshot(): Plan {
  return "free";
}

export function PlanProvider({
  children,
  initialProfile = null,
}: {
  children: React.ReactNode;
  initialProfile?: PlanSessionProfile | null;
}) {
  const pathname = usePathname();
  const plan = useSyncExternalStore(
    subscribeToDemoPlan,
    readDemoPlan,
    demoPlanServerSnapshot,
  );
  const [resolvedSession, setResolvedSession] = useState<{
    pathname: string;
    profile: PlanSessionProfile | null;
  }>(() => ({ pathname, profile: initialProfile }));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SessionResponse;
      })
      .then((session) => {
        if (!active) return;
        setResolvedSession({
          pathname,
          profile: session?.authenticated ? session.user : null,
        });
      })
      .catch(() => {
        if (active) setResolvedSession({ pathname, profile: null });
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const write = useCallback((p: Plan) => {
    if (!ARKOM_DEMO_PLAN_ENABLED) return;
    try {
      localStorage.setItem(PLAN_KEY, p);
      window.dispatchEvent(new Event(PLAN_CHANGE_EVENT));
    } catch {
      /* ignore */
    }
  }, []);

  const upgrade = useCallback(() => {
    if (ARKOM_DEMO_PLAN_ENABLED) write("pro");
    else showToast("O upgrade ainda não está disponível neste ambiente.");
  }, [showToast, write]);
  const downgrade = useCallback(() => write("free"), [write]);
  const toggle = useCallback(
    () => write(plan === "pro" ? "free" : "pro"),
    [plan, write]
  );

  const login = useCallback(async (em: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: em, password }),
      });
      const body = (await response.json()) as SessionResponse & { error?: string };
      if (!response.ok || !body.authenticated) {
        return { error: body.error ?? "Não foi possível entrar." };
      }

      setResolvedSession({ pathname, profile: body.user });
      if (body.user.mustChangePassword) {
        window.location.assign("/settings?primeiro-acesso=1");
      }
      return { error: null };
    } catch {
      return { error: "Não foi possível entrar agora. Tente novamente." };
    }
  }, [pathname]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: "{}",
    });
    setResolvedSession({ pathname, profile: null });
    try {
      localStorage.removeItem(PLAN_KEY);
      window.dispatchEvent(new Event(PLAN_CHANGE_EVENT));
    } catch {
      /* storage unavailable */
    }
  }, [pathname]);

  const profile = resolvedSession.pathname === pathname ? resolvedSession.profile : null;
  const email = profile?.email ?? null;
  const role = profile?.role ?? null;
  const isLoggedIn = profile !== null;
  const isPro = Boolean(profile?.isPro) || (ARKOM_DEMO_PLAN_ENABLED && plan === "pro");

  return (
    <Ctx.Provider
      value={{
        plan,
        isPro,
        isLoggedIn,
        email,
        role,
        upgrade,
        downgrade,
        toggle,
        login,
        logout,
        showToast,
      }}
    >
      {children}
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 whitespace-nowrap rounded-full border border-[rgba(233,228,214,.18)] px-4 py-2 text-[12.5px] font-semibold text-st-ivory"
          style={{
            background: "rgba(16,20,29,.96)",
            backdropFilter: "blur(18px) saturate(1.2)",
            WebkitBackdropFilter: "blur(18px) saturate(1.2)",
            boxShadow: "0 20px 60px -20px rgba(0,0,0,.7)",
          }}
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

export function usePlan(): PlanCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlan must be used within <PlanProvider>");
  return c;
}
