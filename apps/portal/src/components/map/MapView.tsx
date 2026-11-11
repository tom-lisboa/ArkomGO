"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, X } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { loc, deptName } from "@/lib/content-pt";
import { BottomDeptNav } from "./BottomDeptNav";
import { FanStack, type FanLayerState } from "./FanLayer";
import { JobDrawer, type DrawerTarget } from "./JobDrawer";
import { MapTopbar, type SearchEntry } from "./MapTopbar";
import { RadialGraph } from "./RadialGraph";
import { SkillFilePopup } from "./SkillFilePopup";
import { SkillSatellites } from "./SkillSatellites";
import { StarField } from "./StarField";
import { ZoomControls } from "./ZoomControls";
import {
  buildBrain,
  computeFan,
  computeMiniTree,
  FAN,
  frontDeptIndex,
  OVERVIEW_REACH,
  R_ROOT,
  W_STEP,
  WHEEL_DEFAULT,
  wheelForDept,
  type Pt,
} from "./geometry";
import {
  DEPARTMENTS,
  DEPT_COUNT,
  START_HERE,
  type Job,
} from "./skilltree-data";

type Mode = "overview" | "dept";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const JOB_ZOOM = 1.35; // zoom target when a single job node is focused
const MY_KEY = "skilltree-my"; // localStorage bucket for the user's self-assessment

/** rotation that seats department `index` at the bottom, taking the SHORTEST path
 *  from the current target (source: unwrap into ±180 of wheelT). */
function shortestWheelTarget(index: number, currentT: number): number {
  let t = wheelForDept(index);
  while (t - currentT > 180) t -= 360;
  while (t - currentT < -180) t += 360;
  return t;
}

export function MapView() {
  const t = useT();
  const { locale } = useLocale();
  // NOTE: the map always boots in OVERVIEW (the full 7-department wheel).
  const [mode, setMode] = useState<Mode>("overview");
  const [wheelA, setWheelA] = useState(WHEEL_DEFAULT);
  const [selected, setSelected] = useState<number | null>(null);
  const [divingIndex, setDivingIndex] = useState<number | null>(null); // aligning phase
  const [fanLayers, setFanLayers] = useState<FanLayerState[]>([]);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [hubOpen, setHubOpen] = useState(false);
  const [zoomPct, setZoomPct] = useState(50); // display only (ZoomControls)
  const [busy, setBusy] = useState(false); // camera in flight → hovers/clicks off
  const [sliding, setSliding] = useState(false); // dept slide in flight → edge buttons inert
  const [myStatus, setMyStatus] = useState<Record<string, "live" | "dev">>({});
  const [skillView, setSkillView] = useState<{ slug: string; job: Job } | null>(null); // open skill-preview modal

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fanKeyRef = useRef(0);
  const diveTimer = useRef<number | null>(null);
  const slideTimer = useRef<number | null>(null);
  // wheel mechanic (9b-1): mirror `mode` into a ref so the native wheel listener
  // reads the live state; zoomIntent accumulates a ctrl/pinch gesture toward a
  // dive/rise; zoomLock debounces it; wheelIdle snaps the gear after a scroll.
  const modeRef = useRef<Mode>("overview");
  const zoomIntentRef = useRef(0);
  const zoomLockRef = useRef(0);
  const wheelIdleRef = useRef<number | null>(null);

  /* ---- camera: current + target, driven by a per-frame rAF lerp ---- */
  const cam = useRef({ scale: 0.5, tx: 0, ty: 0, scaleT: 0.5, txT: 0, tyT: 0 });
  const zoomPctRef = useRef(50);
  const busyRef = useRef(false);
  // wheel rotation: current (a) eased toward target (t). A rotation drag writes both
  // directly (1:1, no lag); chevron-step + snap + dive write only `t` and let the rAF ease.
  const wheelRef = useRef({ a: WHEEL_DEFAULT, t: WHEEL_DEFAULT });
  const draggingRef = useRef(false);
  // keep the mode ref current every render so the once-bound wheel listener sees it
  modeRef.current = mode;

  const brain = useMemo(() => buildBrain(DEPARTMENTS.map((d) => d.color)), []);
  const miniTrees = useMemo(
    () => DEPARTMENTS.map((d, i) => computeMiniTree(d, i, wheelA)),
    [wheelA]
  );

  /* ---- YOUR TREE: load + persist the user's self-assessment ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MY_KEY);
      if (raw) setMyStatus(JSON.parse(raw) as Record<string, "live" | "dev">);
    } catch {
      /* storage unavailable — start empty */
    }
  }, []);

  const myOf = useCallback(
    (deptId: string, jobId: string): "live" | "dev" | undefined => myStatus[`${deptId}/${jobId}`],
    [myStatus]
  );

  /** flat search index over all 137 jobs. */
  const searchIndex = useMemo<SearchEntry[]>(
    () =>
      DEPARTMENTS.flatMap((d, di) =>
        d.functions.flatMap((f) =>
          f.jobs.map((job) => ({
            job,
            deptIndex: di,
            deptId: d.id,
            deptName: d.name,
            deptColor: d.color,
            fnName: f.name,
          }))
        )
      ),
    []
  );

  /* ---- pure fit → zoom factor for a given world reach ---- */
  const fitZoom = useCallback((reach: number) => {
    const el = viewportRef.current;
    if (!el) return 0.5;
    const half = Math.min(el.clientWidth, el.clientHeight) / 2 - 24;
    return clamp(half / reach, 0.12, 1.4);
  }, []);
  const skyFit = useCallback(() => fitZoom(OVERVIEW_REACH), [fitZoom]);

  const markBusy = useCallback(() => {
    if (!busyRef.current) {
      busyRef.current = true;
      setBusy(true);
    }
  }, []);
  const clearBusy = useCallback(() => {
    if (busyRef.current) {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** focusPoint(wx,wy,z): set camera TARGET to centre world (wx,wy) at zoom z. */
  const focusPoint = useCallback(
    (wx: number, wy: number, z: number) => {
      const c = cam.current;
      c.scaleT = z;
      c.txT = -wx * z;
      c.tyT = -(wy - 30 / z) * z; // 30px below screen centre, leaving top chrome room
      markBusy();
    },
    [markBusy]
  );

  /** instant camera set (drag/pinch/wheel) — target == current, no easing. */
  const setCamDirect = useCallback(
    (scale: number, tx: number, ty: number) => {
      const c = cam.current;
      c.scale = c.scaleT = scale;
      c.tx = c.txT = tx;
      c.ty = c.tyT = ty;
      clearBusy();
    },
    [clearBusy]
  );

  /* ---- per-frame camera loop (the "follow" easing) ---- */
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ease = reduce ? 1 : 0.13;
    let raf = 0;
    const tick = () => {
      const c = cam.current;
      c.scale += (c.scaleT - c.scale) * ease;
      c.tx += (c.txT - c.tx) * ease;
      c.ty += (c.tyT - c.ty) * ease;
      const el = stageRef.current;
      if (el) {
        el.style.transform = `translate(${c.tx.toFixed(2)}px, ${c.ty.toFixed(2)}px) scale(${c.scale.toFixed(4)})`;
      }
      const pct = Math.round(c.scale * 100);
      if (pct !== zoomPctRef.current) {
        zoomPctRef.current = pct;
        setZoomPct(pct);
      }
      const settled =
        Math.abs(c.scale - c.scaleT) < 0.004 &&
        Math.abs(c.tx - c.txT) < 0.6 &&
        Math.abs(c.ty - c.tyT) < 0.6;
      if (settled && busyRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
      // wheel rotation easing (snap + chevron step + dive align) — skipped while a drag drives it 1:1
      if (!draggingRef.current) {
        const w = wheelRef.current;
        const dw = w.t - w.a;
        if (Math.abs(dw) > 0.02) {
          w.a += dw * (reduce ? 1 : 0.16);
          if (Math.abs(w.t - w.a) <= 0.02) w.a = w.t;
          setWheelA(Math.round(w.a * 100) / 100);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- clear any pending transition timers on unmount ---- */
  useEffect(
    () => () => {
      if (diveTimer.current) window.clearTimeout(diveTimer.current);
      if (slideTimer.current) window.clearTimeout(slideTimer.current);
    },
    []
  );

  /* ---- initial framing before first paint (no flash) ---- */
  useLayoutEffect(() => {
    const z = skyFit();
    const c = cam.current;
    c.scale = c.scaleT = z;
    c.tx = c.txT = 0;
    c.ty = c.tyT = 30; // focusPoint(0,0,z) equivalent
    if (stageRef.current) {
      stageRef.current.style.transform = `translate(0px, 30px) scale(${z.toFixed(4)})`;
    }
  }, [skyFit]);

  /* ---- fit the WHOLE fan of a department into view (source fanFit) ---- */
  const fitDept = useCallback(
    (index: number) => {
      const f = computeFan(DEPARTMENTS[index]);
      const el = viewportRef.current;
      const cw = el?.clientWidth ?? 1200;
      const ch = el?.clientHeight ?? 800;
      const mobile = cw < 700;
      const mx = mobile ? 56 : 160;
      const my = mobile ? 150 : 230;
      const z = clamp(
        Math.min((cw - mx) / (f.maxX - f.minX), (ch - my) / (f.maxY - f.minY)),
        0.12,
        1.4
      );
      focusPoint(0, (f.minY + f.maxY) / 2, z);
    },
    [focusPoint]
  );

  /* ---- MACRO → ITEM dive: (1) rotate the wheel the SHORTEST way to seat the dept
       at the bottom (aligning), (2) DIM the sibling mini-trees, (3) zoom toward the
       root, then commit to the fan. Staged with a timer so the rotation is visible
       BEFORE the fan replaces the wheel (no overlap). ---- */
  const diveTo = useCallback(
    (index: number) => {
      if (diveTimer.current) window.clearTimeout(diveTimer.current);
      setDivingIndex(index);
      setDrawer(null);
      setHubOpen(false);

      const w = wheelRef.current;
      const target = shortestWheelTarget(index, w.t);
      w.t = target; // rAF eases a → t (the aligning rotation)
      const delta = Math.abs(target - w.a);
      focusPoint(0, R_ROOT + 150, Math.min(0.95, skyFit() * 2)); // zoom toward the seated dept
      const wait = Math.min(800, 180 + delta * 5);

      diveTimer.current = window.setTimeout(() => {
        // settle the wheel exactly and reveal the fan
        w.a = w.t = wheelForDept(index);
        setWheelA(wheelForDept(index));
        setSelected(index);
        setMode("dept");
        setDivingIndex(null);
        setFanLayers([{ key: (fanKeyRef.current += 1), deptIndex: index, phase: "in" }]);
        fitDept(index);
      }, wait);
    },
    [focusPoint, skyFit, fitDept]
  );

  /* ---- DEPT → DEPT lateral slide (source buildFan dir±1): the new fan slides in
       from the side while the old one slides out the opposite way. ---- */
  const slideToDept = useCallback(
    (index: number, dir: 1 | -1) => {
      if (slideTimer.current) window.clearTimeout(slideTimer.current);
      const newKey = (fanKeyRef.current += 1);
      wheelRef.current.a = wheelRef.current.t = wheelForDept(index);
      setWheelA(wheelForDept(index));
      setSelected(index);
      setDrawer(null);
      setSliding(true);

      setFanLayers((prev) => [
        ...prev.map((l) => ({ ...l, phase: (dir >= 0 ? "exit-l" : "exit-r") as FanLayerState["phase"] })),
        { key: newKey, deptIndex: index, phase: dir >= 0 ? "enter-r" : "enter-l" },
      ]);
      // next frame → release the entering fan to translateX(0)
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setFanLayers((prev) => prev.map((l) => (l.key === newKey ? { ...l, phase: "in" } : l)))
        )
      );
      slideTimer.current = window.setTimeout(() => {
        setFanLayers([{ key: newKey, deptIndex: index, phase: "in" }]);
        setSliding(false);
      }, 500);

      fitDept(index);
    },
    [fitDept]
  );

  /* ---- open a job's card (drill-in or search). ---- */
  const openJob = useCallback(
    (job: Job, deptId: string, deptName: string, deptColor: string, fnName: string, pos: Pt) => {
      setSkillView(null); // switching jobs closes any open skill-file popup
      setDrawer({
        job,
        deptId,
        deptName,
        deptColor,
        fnName,
        startHere: START_HERE[deptId] === job.id,
        pos,
      });
    },
    []
  );

  /* ---- focus a specific job (from search): drill in + centre the node ---- */
  const focusJob = useCallback(
    (entry: SearchEntry) => {
      const f = computeFan(DEPARTMENTS[entry.deptIndex]);
      let pos: Pt = { x: 0, y: -FAN.R0 };
      for (const fl of f.functions) {
        const hit = fl.jobs.find((j) => j.job.id === entry.job.id);
        if (hit) {
          pos = hit.pos;
          break;
        }
      }
      wheelRef.current.a = wheelRef.current.t = wheelForDept(entry.deptIndex);
      setSelected(entry.deptIndex);
      setMode("dept");
      setDivingIndex(null);
      setWheelA(wheelForDept(entry.deptIndex));
      setHubOpen(false);
      setFanLayers([{ key: (fanKeyRef.current += 1), deptIndex: entry.deptIndex, phase: "in" }]);
      openJob(entry.job, entry.deptId, entry.deptName, entry.deptColor, entry.fnName, pos);
      focusPoint(pos.x, pos.y, JOB_ZOOM);
    },
    [focusPoint, openJob]
  );

  const backToOverview = useCallback(() => {
    if (diveTimer.current) window.clearTimeout(diveTimer.current);
    if (slideTimer.current) window.clearTimeout(slideTimer.current);
    setMode("overview");
    setSelected(null);
    setDivingIndex(null);
    setDrawer(null);
    setSkillView(null);
    // collapse the fan, then clear it
    setFanLayers((prev) => prev.map((l) => ({ ...l, phase: "collapse" })));
    slideTimer.current = window.setTimeout(() => setFanLayers([]), 380);
    focusPoint(0, 0, skyFit());
  }, [focusPoint, skyFit]);

  /* ---- chevrons: rotate the wheel (overview) or slide depts (focus) ---- */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (mode === "overview") {
        wheelRef.current.t += dir * W_STEP;
        return;
      }
      if (selected === null) return;
      slideToDept((selected + dir + DEPT_COUNT) % DEPT_COUNT, dir);
    },
    [mode, selected, slideToDept]
  );

  /* ---- keyboard: ArrowLeft/Right slide depts in drill-in ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "dept" || selected === null) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        slideToDept((selected + 1) % DEPT_COUNT, 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        slideToDept((selected - 1 + DEPT_COUNT) % DEPT_COUNT, -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selected, slideToDept]);

  /** zoom buttons — animate scale, anchored at screen centre. */
  const onZoom = useCallback(
    (delta: number) => {
      const c = cam.current;
      const s1 = clamp(c.scaleT + delta, 0.12, 1.9);
      const k = s1 / c.scaleT;
      c.scaleT = s1;
      c.txT *= k;
      c.tyT *= k;
      markBusy();
    },
    [markBusy]
  );

  const onSelectJob = useCallback(
    (job: Job, deptId: string, fnName: string, pos: Pt) => {
      const dept = DEPARTMENTS.find((d) => d.id === deptId);
      if (!dept) return;
      openJob(job, dept.id, dept.name, dept.color, fnName, pos);
      focusPoint(pos.x, pos.y, JOB_ZOOM);
    },
    [focusPoint, openJob]
  );

  /* ---- re-frame on resize ---- */
  useEffect(() => {
    const onResize = () => {
      if (mode === "dept" && selected !== null) {
        fitDept(selected);
      } else {
        focusPoint(0, 0, skyFit());
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, selected, focusPoint, skyFit, fitDept]);

  /* ---- drag-to-pan + pinch/scroll-zoom (instant, target == current) ---- */
  const gesture = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    panX: 0,
    panY: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    pinchDist: 0,
    pinchScale: 1,
  });
  const suppressClick = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 1) {
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.panX = cam.current.tx;
      g.panY = cam.current.ty;
      g.moved = false;
    } else if (g.pointers.size === 2) {
      const pts = [...g.pointers.values()];
      g.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      g.pinchScale = cam.current.scale;
      g.pointers.forEach((_, id) => {
        try {
          e.currentTarget.setPointerCapture(id);
        } catch {
          /* capture unavailable — bubbling still delivers moves */
        }
      });
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (!g.pointers.has(e.pointerId)) return;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (g.pointers.size >= 2) {
        const pts = [...g.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (g.pinchDist > 0) {
          const c = cam.current;
          const s1 = clamp(g.pinchScale * (dist / g.pinchDist), 0.1, 1.9);
          const k = s1 / c.scale;
          setCamDirect(s1, c.tx * k, c.ty * k);
        }
        g.moved = true;
        return;
      }

      const totalDx = e.clientX - g.startX;
      const totalDy = e.clientY - g.startY;
      if (!g.moved && Math.abs(totalDx) + Math.abs(totalDy) > 6) {
        g.moved = true;
        draggingRef.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }

      if (g.moved) {
        if (mode === "overview") {
          // OVERVIEW: drag ROTATES the wheel like a dial; the grabbed point stays
          // under the cursor (angular delta about the wheel centre). No pan.
          const rect = viewportRef.current?.getBoundingClientRect();
          const cx = (rect ? rect.left + rect.width / 2 : 0) + cam.current.tx;
          const cy = (rect ? rect.top + rect.height / 2 : 0) + cam.current.ty;
          const mobile = (rect?.width ?? 1200) < 700;
          const w = wheelRef.current;
          let next = w.a;
          const r0x = g.lastX - cx;
          const r0y = g.lastY - cy;
          const r1x = e.clientX - cx;
          const r1y = e.clientY - cy;
          if (mobile) {
            next -= (e.clientX - g.lastX) * 0.26;
          } else if (Math.hypot(r0x, r0y) > 48 && Math.hypot(r1x, r1y) > 48) {
            let dA = (Math.atan2(r1y, r1x) - Math.atan2(r0y, r0x)) * (180 / Math.PI);
            if (dA > 180) dA -= 360;
            if (dA < -180) dA += 360;
            next += dA;
          } else {
            // dead zone at the very centre → fall back to a horizontal scrub
            next -= (e.clientX - g.lastX) * 0.12;
          }
          w.a = w.t = next;
          setWheelA(Math.round(next * 100) / 100);
        } else {
          // DRILL-IN: drag PANS the camera (unchanged).
          setCamDirect(
            cam.current.scale,
            cam.current.tx + (e.clientX - g.lastX),
            cam.current.ty + (e.clientY - g.lastY)
          );
        }
      }
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    },
    [mode, setCamDirect]
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      g.pointers.delete(e.pointerId);
      if (g.pointers.size < 2) g.pinchDist = 0;
      if (g.pointers.size === 0) {
        if (g.moved) {
          suppressClick.current = true;
          window.setTimeout(() => {
            suppressClick.current = false;
          }, 0);
          // on release, snap the wheel so a department seats at the bottom.
          if (mode === "overview") {
            const w = wheelRef.current;
            w.t = 180 + Math.round((w.a - 180) / W_STEP) * W_STEP;
          }
        }
        draggingRef.current = false;
      }
    },
    [mode]
  );

  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (suppressClick.current) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick.current = false;
        return;
      }
      // Empty-canvas click while a job drawer is open → close + deselect (drawer
      // null clears the active ring) + zoom out to fit the dept, STAYING in the
      // dive (R0 Q5). Clicks on a node/leaf/drawer/chrome are left alone.
      if (drawer && mode === "dept" && selected !== null) {
        const t = e.target as HTMLElement | null;
        if (t && !t.closest(".fan-node, .leaf, .map-scroll, .drawer-expanded, button, a, [role='button']")) {
          setDrawer(null);
          setSkillView(null);
          fitDept(selected);
        }
      }
    },
    [drawer, mode, selected, fitDept]
  );

  /* ---- wheel (ported 1:1 from the source app-map.html listener) ----
     plain scroll: OVERVIEW rotates the wheel (dominant axis, snap-to-dept on
     idle) · DIVE pans. ctrl/⌘+wheel: OVERVIEW gathers intent → dives into the
     focused dept past 110 · DIVE zooms (cursor-anchored, clamped) and rises
     back when zoomed out at the floor. Native + non-passive so ctrl+wheel can
     preventDefault the browser's page-zoom. */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const clampZFan = (v: number) => Math.max(0.42, Math.min(1.9, v));
    const onWheelNative = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("input, textarea, .map-scroll")) return;
      e.preventDefault();
      const now = performance.now();
      const c = cam.current;

      if (e.ctrlKey || e.metaKey) {
        if (now < zoomLockRef.current) return;
        if (modeRef.current === "overview") {
          zoomIntentRef.current += -e.deltaY;
          if (zoomIntentRef.current > 110) {
            diveTo(frontDeptIndex(wheelRef.current.a));
            zoomIntentRef.current = 0;
            zoomLockRef.current = now + 900;
          } else if (zoomIntentRef.current < -110) {
            zoomIntentRef.current = 0;
          }
        } else {
          const zn = clampZFan(c.scale * Math.exp(-e.deltaY * 0.01));
          if (zn <= 0.43 && e.deltaY > 0) {
            zoomIntentRef.current += -e.deltaY;
            if (zoomIntentRef.current < -110) {
              backToOverview();
              zoomIntentRef.current = 0;
              zoomLockRef.current = now + 900;
            }
            return;
          }
          const rect = el.getBoundingClientRect();
          const px = e.clientX - (rect.left + rect.width / 2);
          const py = e.clientY - (rect.top + rect.height / 2);
          const k = zn / c.scale;
          setCamDirect(zn, px - k * (px - c.tx), py - k * (py - c.ty));
        }
        return;
      }

      // plain scroll — no modifier
      if (modeRef.current === "dept") {
        setCamDirect(c.scale, c.tx - e.deltaX, c.ty - e.deltaY);
      } else {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        wheelRef.current.t += d * 0.1;
        if (wheelIdleRef.current) window.clearTimeout(wheelIdleRef.current);
        wheelIdleRef.current = window.setTimeout(() => {
          const w = wheelRef.current;
          w.t = 180 + Math.round((w.t - 180) / W_STEP) * W_STEP;
        }, 300);
      }
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheelNative);
      if (wheelIdleRef.current) window.clearTimeout(wheelIdleRef.current);
    };
    // reads mode via modeRef → binds once (no re-attach on mode change)
  }, [diveTo, backToOverview, setCamDirect]);

  const frontIdx = mode === "dept" && selected !== null ? selected : frontDeptIndex(wheelA);
  const dept = DEPARTMENTS[frontIdx];
  const prevDept = DEPARTMENTS[(frontIdx - 1 + DEPT_COUNT) % DEPT_COUNT];
  const nextDept = DEPARTMENTS[(frontIdx + 1) % DEPT_COUNT];

  return (
    <div
      className={`mapview${mode === "dept" ? " fanmode" : ""}${drawer ? " zoomedin" : ""}${sliding ? " sliding" : ""}`}
    >
      <StarField />
      <MapTopbar searchIndex={searchIndex} onPick={focusJob} />

      <div
        ref={viewportRef}
        className="graph-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClickCapture={onClickCapture}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={stageRef}
          className={`graph-stage${busy ? " camera-busy" : ""}`}
          style={{ transformOrigin: "0 0" }}
        >
          <RadialGraph
            miniTrees={miniTrees}
            brain={brain}
            mode={mode}
            divingIndex={divingIndex}
            onSelectDept={diveTo}
            onSelectHub={() => setHubOpen(true)}
          />
          <FanStack
            layers={fanLayers}
            activeJobId={drawer?.job.id ?? null}
            statusFor={myOf}
            onSelectJob={onSelectJob}
            onSelectSkill={(slug, job) => setSkillView({ slug, job })}
          />
          {drawer && mode === "dept" ? (
            <SkillSatellites
              key={drawer.job.id}
              center={drawer.pos}
              skills={drawer.job.skills}
              color={drawer.deptColor}
              onSelect={(slug) => setSkillView({ slug, job: drawer.job })}
            />
          ) : null}
        </div>
      </div>

      {/* dept-mode chrome: back + progress */}
      {mode === "dept" && selected !== null ? (
        <>
          <button
            type="button"
            onClick={backToOverview}
            aria-label={t.map.backToDepts}
            className="absolute left-6 top-[64px] z-30 flex items-center gap-1.5 bg-transparent py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-2)] transition-colors hover:text-[var(--map-ivory)]"
          >
            <ChevronLeft size={12} strokeWidth={2} />
            {loc(locale, "All departments", "Todos os departamentos")}
          </button>
        </>
      ) : null}

      {/* dive edge switchers — jump to the neighbour departments (Pkg9e restore).
          Always mounted so the .4s opacity fade works; CSS shows them only in
          .fanmode (dive) and hides them while sliding or zoomed into a job.
          Dept name localizes per the generalista overlay (Fidv3 P2). */}
      <button type="button" id="edge-l" className="edge-dept" aria-label={deptName(locale, prevDept.name)} onClick={() => step(-1)}>
        <svg className="echev" viewBox="0 0 14 22" fill="none" aria-hidden>
          <path d="M 11 3 L 4 11 L 11 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="4" cy="11" r="1.8" fill="currentColor" />
        </svg>
        <span className="et">{deptName(locale, prevDept.name)}</span>
      </button>
      <button type="button" id="edge-r" className="edge-dept" aria-label={deptName(locale, nextDept.name)} onClick={() => step(1)}>
        <span className="et">{deptName(locale, nextDept.name)}</span>
        <svg className="echev" viewBox="0 0 14 22" fill="none" aria-hidden>
          <path d="M 3 3 L 10 11 L 3 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10" cy="11" r="1.8" fill="currentColor" />
        </svg>
      </button>

      {/* Overview-only: the wheel's bottom dept label + spin chevrons. In the
          dive the fan renders its own root label (.fan-dname), so showing this
          too would duplicate the department name at the bottom (Pkg9f-3). */}
      {mode === "overview" ? (
        <BottomDeptNav
          name={deptName(locale, dept.name)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          showChevrons={divingIndex === null}
        />
      ) : null}
      <ZoomControls
        zoom={zoomPct / 100}
        onZoom={onZoom}
        onFit={() => (mode === "dept" && selected !== null ? fitDept(selected) : backToOverview())}
        onAbout={() => setHubOpen(true)}
      />

      {drawer ? (
        <JobDrawer
          target={drawer}
          onClose={() => {
            setDrawer(null);
            setSkillView(null);
          }}
          onNavigate={(name) => {
            const entry = searchIndex.find((e) => e.job.name === name);
            if (entry) focusJob(entry);
          }}
        />
      ) : null}

      {skillView ? (
        <SkillFilePopup slug={skillView.slug} job={skillView.job} onClose={() => setSkillView(null)} />
      ) : null}

      {hubOpen ? <NodeZeroDrawer onClose={() => setHubOpen(false)} /> : null}
    </div>
  );
}

/* section label inside the node-zero card (.c-sec — 10px/700/.2em). */
function NzSec({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
      {children}
    </div>
  );
}

const NZ_FILES = [
  "company.md",
  "offer.md",
  "voice.md",
  "clients/*",
  "meetings/*",
  "playbooks/*",
  "STATE.md",
];
const NZ_LADDER = [
  {
    k: "Human-led",
    v: "Context lives in the founder's head and a thousand chat threads. Every new session starts at zero.",
  },
  {
    k: "Human-assisted",
    v: "Core files exist · company, offer, voice, per-client state · and humans update them after meaningful work.",
  },
  {
    k: "Fully autonomous",
    v: "Every transcript, email, and deliverable writes itself back. Any agent or human reads one page and is current. The brain maintains the brain.",
  },
];
/* ---- node zero: the Company Knowledge Base card, rebuilt faithful to the live
   (Item 3). The drawer sits below the "All departments" button (Item 5). ---- */
function NodeZeroDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const nz = t.map.nodeZero.drawer;
  const ladderBody = [nz.ladderLed, nz.ladderAssisted, nz.ladderAutonomous];
  const legendFor: Record<string, string> = {
    "Human-led": t.chart.legend.led,
    "Human-assisted": t.chart.legend.assisted,
    "Fully autonomous": t.chart.legend.autonomous,
  };
  return (
    <>
      <aside
        className="drawer-in map-scroll absolute left-7 top-[104px] z-40 w-[364px] max-w-[calc(100%-56px)] rounded-[10px] py-5 pl-5 pr-[18px]"
        style={{
          maxHeight: "calc(100dvh - 130px)",
          background: "var(--map-drawer-bg)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          border: "1px solid var(--map-drawer-border)",
          boxShadow: "0 30px 80px -30px rgba(0,0,0,.7)",
        }}
      >
        {/* 1 · close */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="float-right grid size-[30px] place-items-center rounded-full text-[13px] text-[var(--map-ivory-2)] transition-colors hover:text-[var(--map-ivory)]"
          style={{ border: "1px solid var(--map-line)" }}
        >
          <X size={13} />
        </button>

        {/* 2 · eyebrow */}
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--map-copper)]">
          {loc(locale, "node zero", "nó zero")}
        </div>

        {/* 3 · name + BEFORE EVERYTHING */}
        <h2 className="mb-1.5 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[26px] tracking-[0.04em] text-[var(--map-ivory)]">
          {t.map.nodeZero.title}
          <span
            className="rounded-[3px] px-1.5 py-[2px] align-middle text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--map-copper)]"
            style={{ border: "1px solid color-mix(in srgb, var(--map-copper) 45%, transparent)" }}
          >
            {nz.beforeEverything}
          </span>
        </h2>

        {/* 4 · crumb */}
        <div className="mb-3 text-[11px] tracking-[0.06em] text-[var(--map-ink-2)]">
          {t.map.nodeZero.hubLine}
        </div>

        {/* 5 · desc — theme-aware ink @ .82 (Fidv3 M6 contrast fix, mirrors N7-F3:
            the hardcoded dark-ivory rgba was near-invisible on the light card). */}
        <p className="mb-4 text-[13px] leading-[1.7] text-[color-mix(in_srgb,var(--map-ivory)_82%,transparent)]">
          {nz.desc}
        </p>

        {/* 7 · WHAT LIVES IN IT */}
        <NzSec>{nz.whatLivesIn}</NzSec>
        <div className="flex flex-wrap gap-1.5">
          {NZ_FILES.map((f) => (
            <span
              key={f}
              className="rounded-[3px] px-2 py-[3px] text-[11px] text-[var(--map-ivory-2)]"
              style={{ border: "1px solid rgba(233,228,214,.25)" }}
            >
              {f}
            </span>
          ))}
        </div>

        {/* 8 · WHAT IT REPLACES */}
        <NzSec>{nz.whatItReplaces}</NzSec>
        <div
          className="rounded-[8px] px-3 py-2.5 text-[12.5px] leading-[1.6] text-[var(--map-ivory-2)]"
          style={{ border: "1px solid var(--map-line)", background: "rgba(233,228,214,.03)" }}
        >
          {nz.whatItReplacesBody}
        </div>

        {/* 9 · THE LADDER */}
        <NzSec>{nz.ladder}</NzSec>
        <div>
          {NZ_LADDER.map((row, i) => (
            <div
              key={row.k}
              className="flex gap-2.5 border-t border-[var(--map-line)] py-[7px] text-[12px] leading-[1.55]"
            >
              <span className="w-[92px] shrink-0 pt-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--map-ink-3)]">
                {legendFor[row.k] ?? row.k}
              </span>
              <span className="text-[var(--map-ivory-2)]">{ladderBody[i] ?? row.v}</span>
            </div>
          ))}
        </div>

        {/* 10 · THE HUMAN */}
        <NzSec>{nz.human}</NzSec>
        <p className="text-[12.5px] leading-[1.65] text-[var(--map-ivory-2)]">
          {nz.humanBody}
        </p>

        {/* 11 · BUILD NOTES */}
        <NzSec>{nz.buildNotes}</NzSec>
        <p className="text-[12.5px] leading-[1.65] text-[var(--map-ivory-2)]">
          {nz.buildNotesBody}
        </p>

      </aside>
    </>
  );
}
