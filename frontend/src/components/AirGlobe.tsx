"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNearestArea } from "@/lib/api";
import { MAX_ZOOM, MIN_ZOOM, coordsForArea, distanceKm, projector, type View } from "@/lib/geo";
import { countryAt, loadWorld, nearestCountry, type City, type World } from "@/lib/world";
import { siteKey, useAirLayer, type AirPoint } from "@/lib/useAirLayer";
import { useBands } from "@/lib/catalog";
import { US_SCALE, STANDARD_LABEL, bandFor, indiaScale, rangeLabel, type ScaleBand } from "@/lib/aqiScale";
import { useAqiStandard } from "@/lib/useAqiStandard";
import { formatPollutant } from "@/lib/constants";
import type { AreaInfo } from "@/lib/types";
import AqiStandardSelect from "./AqiStandardSelect";

interface AirGlobeProps {
  /** The area the dashboard is showing. */
  selected: AreaInfo;
  /**
   * The reading Main Statistics is showing for that area, so the coin always
   * matches it. `sample` marks demo-mode values (a labelled fixture).
   */
  reading?: { aqi: number; status: string; sample?: boolean } | null;
  /** Switch the whole dashboard to another Indian area. */
  onChooseArea: (area: AreaInfo) => void;
}

const MAX_SIZE = 660;
const TAU = Math.PI * 2;
const INDIA_BOUNDS = { minLat: 6, maxLat: 38, minLon: 68, maxLon: 98 };

/** Whole-country view of India, used when the selected area is in India. */
const INDIA_VIEW: View = { lat: 22.5, lon: 80, zoom: 2.2 };

function isInIndia(c: [number, number] | null): boolean {
  return (
    !!c &&
    c[0] >= INDIA_BOUNDS.minLat && c[0] <= INDIA_BOUNDS.maxLat &&
    c[1] >= INDIA_BOUNDS.minLon && c[1] <= INDIA_BOUNDS.maxLon
  );
}

function cssVar(cs: CSSStyleDeclaration, name: string): string {
  return cs.getPropertyValue(name).trim();
}

/** Draws the globe: ocean, graticule, every country, country names when zoomed in. */
function drawGlobe(
  canvas: HTMLCanvasElement,
  size: number,
  view: View,
  world: World,
  homeA3: string | null,
  focusA3: string | null
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cs = getComputedStyle(document.documentElement);
  const colors = {
    oceanA: cssVar(cs, "--globe-ocean-a"),
    oceanB: cssVar(cs, "--globe-ocean-b"),
    land: cssVar(cs, "--globe-land"),
    home: cssVar(cs, "--globe-land-home"),
    border: cssVar(cs, "--globe-border"),
    line: cssVar(cs, "--globe-line"),
    rim: cssVar(cs, "--globe-rim"),
    text: cssVar(cs, "--muted-strong"),
  };

  const c = size / 2;
  const R = size * 0.46; // the visible disc; the rest is room for the rim glow
  const P = R * view.zoom;
  const RAD = Math.PI / 180;
  const sinP0 = Math.sin(view.lat * RAD);
  const cosP0 = Math.cos(view.lat * RAD);
  const sinL0 = Math.sin(view.lon * RAD);
  const cosL0 = Math.cos(view.lon * RAD);

  ctx.clearRect(0, 0, size, size);

  // Rim glow, drawn behind the disc.
  ctx.save();
  ctx.shadowColor = colors.rim;
  ctx.shadowBlur = size * 0.07;
  ctx.fillStyle = colors.oceanB;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.clip();

  // Ocean.
  const sea = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.08, c, c, R * 1.3);
  sea.addColorStop(0, colors.oceanA);
  sea.addColorStop(1, colors.oceanB);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, size, size);

  // Graticule.
  const project = projector(view, R);
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 0.8;
  const stroke = (pts: [number, number][]) => {
    ctx.beginPath();
    let pen = false;
    for (const [la, lo] of pts) {
      const p = project(la, lo);
      if (!p.visible) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(c + p.x, c + p.y);
      else ctx.moveTo(c + p.x, c + p.y);
      pen = true;
    }
    ctx.stroke();
  };
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push([lat, lon]);
    stroke(pts);
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const pts: [number, number][] = [];
    for (let lat = -88; lat <= 88; lat += 4) pts.push([lat, lon]);
    stroke(pts);
  }

  // Countries.
  ctx.lineWidth = view.zoom > 3 ? 1 : 0.7;
  ctx.strokeStyle = colors.border;
  ctx.lineJoin = "round";
  for (const country of world.countries) {
    ctx.fillStyle = country.a3 === homeA3 || country.a3 === focusA3 ? colors.home : colors.land;
    for (const ring of country.rings) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < ring.n; i++) {
        const sinDl = ring.sinLam[i] * cosL0 - ring.cosLam[i] * sinL0;
        const cosDl = ring.cosLam[i] * cosL0 + ring.sinLam[i] * sinL0;
        let x = P * ring.cosPhi[i] * sinDl;
        let y = -P * (cosP0 * ring.sinPhi[i] - sinP0 * ring.cosPhi[i] * cosDl);
        if (sinP0 * ring.sinPhi[i] + cosP0 * ring.cosPhi[i] * cosDl > 0) {
          any = true;
        } else {
          // Far side: pin to the horizon so shapes crossing it close up cleanly.
          const len = Math.hypot(x, y) || 1;
          x = (x / len) * P;
          y = (y / len) * P;
        }
        if (i === 0) ctx.moveTo(c + x, c + y);
        else ctx.lineTo(c + x, c + y);
      }
      if (!any) continue;
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Country names once there is room for them.
  if (view.zoom >= 2.2) {
    ctx.font = "500 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.text;
    ctx.globalAlpha = 0.75;
    for (const country of world.countries) {
      const main = country.rings.reduce((a, b) =>
        (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) > (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) ? b : a
      );
      const midLat = (main.bbox[1] + main.bbox[3]) / 2;
      const midLon = (main.bbox[0] + main.bbox[2]) / 2;
      const widthPx = (main.bbox[2] - main.bbox[0]) * RAD * P * Math.cos(midLat * RAD);
      if (widthPx < 90) continue;
      const p = project(midLat, midLon);
      if (!p.visible || Math.hypot(p.x, p.y) > R * 0.9) continue;
      ctx.fillText(country.name, c + p.x, c + p.y);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Fine edge to the disc.
  ctx.strokeStyle = colors.rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.stroke();
}

interface Pin {
  key: string;
  name: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  /** Approximate on-screen size, used to keep pins from overlapping. */
  w: number;
  h: number;
  kind: "home" | "city";
  city?: City;
}

export default function AirGlobe({ selected, reading, onChooseArea }: AirGlobeProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);
  const [world, setWorld] = useState<World | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const [mode, setMode] = useState<"globe" | "list">("globe");
  const [activeKey, setActiveKey] = useState<string>("home");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const bands = useBands();

  const home = useMemo(() => coordsForArea(selected.id), [selected.id]);
  const startView = useMemo<View>(
    () => (isInIndia(home) || !home ? INDIA_VIEW : { lat: home[0], lon: home[1], zoom: 3 }),
    [home]
  );
  const [view, setView] = useState<View>(startView);
  const pending = useRef<View | null>(null);
  const frame = useRef<number | null>(null);

  // Load the world on demand.
  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);

  // Track the stage width.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize(Math.min(MAX_SIZE, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redraw when the theme changes.
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // View updates are coalesced to one per animation frame while dragging.
  const queueView = useCallback((next: View) => {
    pending.current = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) setView(pending.current);
    });
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  // Which country is in the middle of the view (settles shortly after movement).
  const [focusA3, setFocusA3] = useState<string | null>(null);
  useEffect(() => {
    if (!world) return;
    const t = setTimeout(() => {
      const c = countryAt(world, view.lat, view.lon) ?? nearestCountry(world, view.lat, view.lon);
      setFocusA3(c?.a3 ?? null);
    }, 220);
    return () => clearTimeout(t);
  }, [world, view.lat, view.lon]);

  const homeA3 = useMemo(() => {
    if (!world || !home) return null;
    return countryAt(world, home[0], home[1])?.a3 ?? null;
  }, [world, home]);

  const focusCities = useMemo(() => (world && focusA3 ? world.cities[focusA3] ?? [] : []), [world, focusA3]);
  const focusName = world && focusA3 ? world.nameOf(focusA3) : null;

  // Everything we want a reading for: the focused country's major cities and the selected area.
  const sites = useMemo(() => {
    const s = focusCities.map((c) => ({ lat: c.lat, lon: c.lon }));
    if (home) s.push({ lat: home[0], lon: home[1] });
    return s;
  }, [focusCities, home]);
  const air = useAirLayer(sites, focusA3 ?? "none");
  const points = useMemo<Record<string, AirPoint>>(() => air.data ?? {}, [air.data]);

  // ── The AQI shown for a place ────────────────────────────────────────────
  // The scale follows the "AQI Standard" switch. On the India scale the
  // selected area uses the official reading when there is one (so it matches
  // Main Statistics); everywhere else is the modelled estimate.
  const [standard] = useAqiStandard();
  const scale = useMemo<ScaleBand[]>(() => (standard === "us" ? US_SCALE : indiaScale(bands)), [standard, bands]);
  const valueOf = useCallback(
    (est: AirPoint | undefined): number | null => (standard === "us" ? est?.usAqi : est?.aqi) ?? null,
    [standard]
  );
  const infoFor = useCallback(
    (lat: number, lon: number, isHome: boolean) => {
      const est = points[siteKey(lat, lon)];
      const dominant = standard === "us" ? est?.usDominant ?? null : est?.dominant ?? null;
      if (isHome && reading && standard === "india") {
        return {
          aqi: reading.aqi as number | null,
          band: bandFor(scale, reading.aqi),
          official: true,
          sample: !!reading.sample,
          est,
          dominant,
        };
      }
      const aqi = valueOf(est);
      return { aqi, band: bandFor(scale, aqi), official: false, sample: false, est, dominant };
    },
    [points, reading, standard, scale, valueOf]
  );
  const fillOf = (b: ScaleBand | null) => (b ? b.fill : "var(--band-unavailable)");
  const inkOf = (b: ScaleBand | null) => (b ? b.ink : "var(--band-unavailable-ink)");
  const textOf = (b: ScaleBand | null) => (b ? b.text : "var(--muted)");

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world || size <= 0 || mode !== "globe") return;
    drawGlobe(canvas, size, view, world, homeA3, focusA3);
  }, [world, size, view, homeA3, focusA3, themeTick, mode]);

  // City names are shown once the view is close enough and the stage wide enough.
  const showNames = view.zoom >= 3 && size >= 480;
  const shortName = (n: string) => (n.length > 15 ? `${n.slice(0, 14)}…` : n);

  // Pins: the selected area, then the focused country's cities by size, spaced so none overlap.
  const pins = useMemo<Pin[]>(() => {
    if (size <= 0) return [];
    const R = size * 0.46;
    const project = projector(view, R);
    const c = size / 2;
    const out: Pin[] = [];
    const cap = view.zoom < 2 ? 8 : view.zoom < 3 ? 18 : 25;

    const place = (key: string, name: string, lat: number, lon: number, kind: Pin["kind"], city?: City) => {
      const p = project(lat, lon);
      if (!p.visible || Math.hypot(p.x, p.y) > R * 0.95) return;
      const x = c + p.x;
      const y = c + p.y;
      const isHome = kind === "home";
      const w = isHome ? 62 : 36 + (showNames ? shortName(name).length * 6.3 + 6 : 0);
      const h = isHome ? 62 : 30;
      if (out.some((q) => Math.abs(q.x - x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < (q.h + h) / 2 + 2)) return;
      out.push({ key, name, lat, lon, x, y, w, h, kind, city });
    };

    if (home) place("home", selected.name, home[0], home[1], "home");
    if (view.zoom >= 1.5) {
      let shown = 0;
      for (const city of focusCities) {
        if (shown >= cap) break;
        if (home && distanceKm(home, [city.lat, city.lon]) < 25) continue; // that's the selected area
        const before = out.length;
        place(`c:${siteKey(city.lat, city.lon)}`, city.name, city.lat, city.lon, "city", city);
        if (out.length > before) shown++;
      }
    }
    return out;
  }, [size, view, home, focusCities, selected.name, showNames]);

  // ── Interaction ──────────────────────────────────────────────────────────
  const drag = useRef<{ x: number; y: number; view: View; active: boolean } | null>(null);
  const justDragged = useRef(false);

  // Pointer handling lives on the whole globe (pins included) so a drag that
  // starts on a pin still rotates; a plain click on a pin is left alone.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, view, active: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || size <= 0) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      d.active = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDragging(true);
    }
    const R = size * 0.46;
    const degPerPx = 180 / Math.PI / (R * d.view.zoom);
    const cosLat = Math.max(0.2, Math.cos((d.view.lat * Math.PI) / 180));
    const lat = Math.max(-85, Math.min(85, d.view.lat + (e.clientY - d.y) * degPerPx));
    let lon = d.view.lon - ((e.clientX - d.x) * degPerPx) / cosLat;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    queueView({ ...d.view, lat, lon });
  };
  const endDrag = () => {
    if (drag.current?.active) {
      // Swallow the click that ends a drag so it doesn't select a pin.
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
    }
    drag.current = null;
    setDragging(false);
  };
  const suppressClickAfterDrag = (e: React.MouseEvent) => {
    if (justDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const zoomBy = (factor: number) =>
    setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor)) }));
  const rotateBy = (dLat: number, dLon: number) =>
    setView((v) => ({
      ...v,
      lat: Math.max(-85, Math.min(85, v.lat + dLat)),
      lon: ((((v.lon + dLon + 180) % 360) + 360) % 360) - 180,
    }));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 12 / view.zoom;
    if (e.key === "ArrowLeft") rotateBy(0, -step);
    else if (e.key === "ArrowRight") rotateBy(0, step);
    else if (e.key === "ArrowUp") rotateBy(step, 0);
    else if (e.key === "ArrowDown") rotateBy(-step, 0);
    else if (e.key === "+" || e.key === "=") zoomBy(1.5);
    else if (e.key === "-") zoomBy(1 / 1.5);
    else return;
    e.preventDefault();
  };

  // ── Details for the active pin ───────────────────────────────────────────
  const active = pins.find((p) => p.key === activeKey) ?? pins.find((p) => p.key === "home") ?? null;
  const activeInfo = active ? infoFor(active.lat, active.lon, active.kind === "home") : null;
  const activeCountry = active && world ? (active.kind === "home" ? homeA3 : focusA3) : null;
  const activeIsIndia = activeCountry === "IND";
  const activeCountryName = activeCountry && world ? world.nameOf(activeCountry) : null;

  const openArea = async (p: Pin) => {
    setOpening(true);
    setOpenError(false);
    try {
      const { area } = await getNearestArea(Math.round(p.lat * 100) / 100, Math.round(p.lon * 100) / 100);
      onChooseArea(area);
      setActiveKey("home");
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  };

  const recenter = () => {
    setView(startView);
    setActiveKey("home");
  };

  const ranked = useMemo(
    () =>
      focusCities
        .map((city) => ({ city, est: points[siteKey(city.lat, city.lon)] }))
        .sort((a, b) => (valueOf(b.est) ?? -1) - (valueOf(a.est) ?? -1)),
    [focusCities, points, valueOf]
  );

  const pinText = (p: Pin): string => {
    const v = infoFor(p.lat, p.lon, p.kind === "home").aqi;
    if (v != null) return String(Math.round(v));
    return air.isPending ? "…" : "–";
  };

  const dominantLabel = (d: string | null | undefined) => (d ? formatPollutant(d).label : null);

  return (
    <div className="relative">
      <div className="mx-auto mb-3 flex items-end justify-between gap-3" style={{ maxWidth: MAX_SIZE }}>
        <AqiStandardSelect />
        <p className="max-w-[16rem] text-right text-[11px] leading-snug text-muted">
          Switch between the Indian CPCB index and the US EPA index.
        </p>
      </div>
      <div ref={stageRef} className="relative mx-auto w-full" style={{ maxWidth: MAX_SIZE }}>
        {mode === "globe" ? (
          <div
            role="group"
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={suppressClickAfterDrag}
            onDoubleClick={() => zoomBy(1.6)}
            aria-label="Interactive globe. Drag to rotate, use the arrow keys to rotate and plus or minus to zoom."
            className="relative mx-auto aspect-square w-full select-none rounded-full outline-offset-4"
            style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "pan-y" }}
          >
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
            {!world && <div className="absolute inset-[4%] animate-pulse rounded-full bg-surface-2" aria-hidden="true" />}

            {pins.map((p) => {
              const info = infoFor(p.lat, p.lon, p.kind === "home");
              const label =
                info.aqi != null
                  ? `${p.name}: AQI ${Math.round(info.aqi)}${info.band ? `, ${info.band.label}` : ""}${info.sample ? " (demo sample)" : info.official ? " (official reading)" : " (model estimate)"}. Show details.`
                  : `${p.name}: no reading yet. Show details.`;
              const isActive = active?.key === p.key;
              if (p.kind === "home") {
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setActiveKey(p.key)}
                    aria-label={label}
                    aria-pressed={isActive}
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: p.x, top: p.y }}
                  >
                    <span
                      className="pin-pulse absolute inset-0 rounded-full"
                      style={{ background: fillOf(info.band) }}
                      aria-hidden="true"
                    />
                    <span
                      className="relative flex h-12 w-12 items-center justify-center rounded-full border-[3px] font-display text-lg font-bold shadow-[0_8px_26px_-6px_rgba(0,0,0,0.55)] sm:h-[60px] sm:w-[60px] sm:text-xl"
                      style={{ background: fillOf(info.band), color: inkOf(info.band), borderColor: "var(--surface)" }}
                    >
                      {pinText(p)}
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setActiveKey(p.key)}
                  aria-label={label}
                  aria-pressed={isActive}
                  title={label}
                  className={`glass absolute z-10 flex min-h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-foreground transition-transform hover:scale-110 focus-visible:scale-110 sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs ${
                    isActive ? "scale-110 ring-2 ring-accent-text" : ""
                  }`}
                  style={{ left: p.x, top: p.y }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: fillOf(info.band) }}
                    aria-hidden="true"
                  />
                  <span className="tabular-nums">{pinText(p)}</span>
                  {showNames && <span className="font-medium text-muted-strong">{shortName(p.name)}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <ul className="glass mx-auto max-h-[28rem] divide-y divide-glass-border overflow-y-auto rounded-3xl">
            {ranked.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted">No major cities on file for the country in view.</li>
            )}
            {ranked.map(({ city, est }) => {
              const listValue = valueOf(est);
              const listBand = bandFor(scale, listValue);
              const listDominant = standard === "us" ? est?.usDominant : est?.dominant;
              return (
                <li key={`${city.name}-${city.lat}`} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: fillOf(listBand) }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{city.name}</span>
                    <span className="block text-xs text-muted">
                      {city.popK >= 1000 ? `${(city.popK / 1000).toFixed(1)} M` : `${city.popK} k`} people
                      {listDominant ? ` · mainly ${dominantLabel(listDominant)}` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-lg font-semibold tabular-nums text-foreground">
                      {listValue != null ? Math.round(listValue) : "–"}
                    </span>
                    <span className="block text-xs" style={{ color: textOf(listBand) }}>
                      {listBand?.label ?? (air.isPending ? "Loading" : "No reading")}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Controls. */}
      <div className="mx-auto mt-4 flex flex-wrap items-center justify-between gap-3" style={{ maxWidth: MAX_SIZE }}>
        <div role="group" aria-label="Map view" className="glass flex rounded-full p-1 text-sm font-medium">
          {(["globe", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`min-h-9 rounded-full px-4 capitalize transition-colors ${
                mode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <p className="min-w-0 flex-1 truncate text-center text-xs text-muted" aria-live="polite">
          {focusName ? (
            <>
              <span className="font-medium text-muted-strong">{focusName}</span>
              {focusCities.length > 0 ? ` · ${focusCities.length} major cities` : ""}
            </>
          ) : (
            "Drag to explore"
          )}
        </p>

        {mode === "globe" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={recenter}
              className="glass inline-flex min-h-9 items-center rounded-full px-3 text-xs font-medium text-foreground"
            >
              Recenter
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.5)}
              disabled={view.zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              className="glass flex h-9 w-9 items-center justify-center rounded-full text-lg text-foreground disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1.5)}
              disabled={view.zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              className="glass flex h-9 w-9 items-center justify-center rounded-full text-lg text-foreground disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Details for the selected pin: a normal block so it never hides the map. */}
      {mode === "globe" && active && activeInfo && (
        <aside
          aria-live="polite"
          className="glass mx-auto mt-4 w-full rounded-2xl p-4 text-sm"
          style={{ maxWidth: MAX_SIZE }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted">
                {active.kind === "home" ? selected.state || activeCountryName || "Your area" : activeCountryName}
                {active.kind === "home" ? " · your area" : active.city?.capital ? " · capital" : ""}
              </p>
              <p className="truncate font-display text-base font-semibold text-foreground">{active.name}</p>
            </div>
            {activeInfo.aqi != null && (
              <span
                className="shrink-0 rounded-lg px-2.5 py-1 font-display text-sm font-bold tabular-nums"
                style={{ background: fillOf(activeInfo.band), color: inkOf(activeInfo.band) }}
              >
                {Math.round(activeInfo.aqi)}
              </span>
            )}
          </div>

          {activeInfo.aqi != null ? (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold" style={{ color: textOf(activeInfo.band) }}>
                {activeInfo.band?.label ?? "AQI"}
              </span>
              <span className="text-xs text-muted">
                {activeInfo.sample ? "Demo sample" : activeInfo.official ? "Official reading" : "Model estimate"} ·{" "}
                {STANDARD_LABEL[standard].body}
                {!activeInfo.official && activeInfo.dominant ? ` · mainly ${dominantLabel(activeInfo.dominant)}` : ""}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              {air.isPending ? "Loading the latest reading…" : "Not enough data to estimate the AQI here right now."}
            </p>
          )}

          {activeInfo.est && valueOf(activeInfo.est) != null && (
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-glass-border pt-3 text-xs">
              {(
                [
                  ["PM2.5 (24 h)", activeInfo.est.pm25],
                  ["PM10 (24 h)", activeInfo.est.pm10],
                  ["O₃ (8 h)", activeInfo.est.o3],
                ] as const
              ).map(([label, v]) => (
                <div key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {v != null ? Math.round(v * 10) / 10 : "–"} <span className="font-normal text-muted">µg/m³</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {active.kind === "home" && activeInfo.official && valueOf(activeInfo.est) != null && (
            <p className="mt-3 rounded-lg bg-surface-2/70 px-2.5 py-2 text-xs text-muted-strong">
              Real model estimate for the same place: <span className="font-semibold text-foreground">{valueOf(activeInfo.est)}</span>.{" "}
              {activeInfo.sample
                ? "The figure above is the labelled demo sample that Main Statistics is showing."
                : "The official reading above is what Main Statistics uses."}
            </p>
          )}

          {active.kind === "city" && activeIsIndia && (
            <button
              type="button"
              onClick={() => openArea(active)}
              disabled={opening}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {opening ? "Opening…" : `Open dashboard for ${active.name}`}
            </button>
          )}
          {active.kind === "city" && !activeIsIndia && (
            <p className="mt-3 text-xs text-muted">
              Detailed guidance, alerts and plans are available for locations in India.
            </p>
          )}
          {openError && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">
              Couldn&apos;t open that place. Try again.
            </p>
          )}
        </aside>
      )}

      {/* What the numbers mean. */}
      <div className="mx-auto mt-4" style={{ maxWidth: MAX_SIZE }}>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted" aria-label="AQI scale">
          {scale.map((b) => (
            <li key={b.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: b.fill }} aria-hidden="true" />
              {b.label}
              <span className="tabular-nums opacity-70">{rangeLabel(b)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {standard === "india"
            ? "Cities are shown on the CPCB National AQI, estimated from modelled pollutant concentrations (Open-Meteo / Copernicus CAMS) with the official breakpoints: 24-hour averages for particles, NO₂ and SO₂, 8-hour for O₃ and CO."
            : "Cities are shown on the US EPA AQI as computed by Open-Meteo from modelled pollutant concentrations (Copernicus CAMS)."}{" "}
          These are estimates, not station readings, and can differ from official figures.
        </p>
      </div>
    </div>
  );
}
