import { useEffect, useRef } from "react";
import type { AreaShape, LivePosition, MapPin } from "./LeafletMap";
import { DEFAULT_ZOOM, ELMINA_BOUNDS, ELMINA_CENTER, areaColor } from "./elmina";

export interface MapProps {
  pins?: MapPin[]; areas?: AreaShape[]; pick?: { lat: number; lng: number } | null; onPick?: (lat: number, lng: number) => void;
  center?: [number, number]; zoom?: number; height?: number | string; interactive?: boolean; label: string;
  track?: boolean; onLocate?: (p: LivePosition) => void; onLocateError?: (message: string) => void;
  focus?: { lat: number; lng: number; zoom?: number; key: number } | null;
}

// Quiet base style so Jiran's own sections and pins stand out (shops and business labels hidden).
const STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

type HtmlOverlay = google.maps.OverlayView & { remove(): void };

/** An HTML element pinned to a map position (our pins, labels and live dot share the Leaflet HTML/CSS). */
function htmlOverlay(g: typeof google.maps, map: google.maps.Map, pos: google.maps.LatLngLiteral, html: string,
  opts: { className?: string; anchor?: [number, number]; z?: number; title?: string; onClick?: () => void }): HtmlOverlay {
  class O extends g.OverlayView {
    el: HTMLDivElement | null = null;
    onAdd() {
      const el = document.createElement("div");
      el.className = `gm-html ${opts.className ?? ""}`;
      el.innerHTML = html;
      el.style.position = "absolute";
      el.style.zIndex = String(1000 + (opts.z ?? 0));
      if (opts.title) { el.title = opts.title; el.setAttribute("aria-label", opts.title); }
      if (opts.onClick) {
        el.setAttribute("role", "button"); el.tabIndex = 0; el.style.cursor = "pointer";
        const go = (e: Event) => { e.stopPropagation(); opts.onClick?.(); };
        el.addEventListener("click", go);
        el.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") go(e); });
      } else {
        el.style.pointerEvents = "none";
      }
      g.OverlayView.preventMapHitsAndGesturesFrom(el);
      this.el = el;
      this.getPanes()!.overlayMouseTarget.appendChild(el);
    }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(new g.LatLng(pos));
      if (!p || !this.el) return;
      const [ax, ay] = opts.anchor ?? [0, 0];
      this.el.style.left = `${p.x - ax}px`;
      this.el.style.top = `${p.y - ay}px`;
    }
    onRemove() { this.el?.remove(); this.el = null; }
    remove() { this.setMap(null); }
  }
  const o = new O();
  o.setMap(map);
  return o;
}

/**
 * The Jiran map on Google Maps. Same props and behaviour as LeafletMap:
 * - areas: each City of Elmina section drawn and labelled;
 * - track: live location via the browser (watchPosition). It stays on this phone unless the resident checks in;
 * - pick/onPick: tap the map or drag the pin.
 */
export default function GoogleMap({ g, pins = [], areas = [], pick, onPick, center, zoom = DEFAULT_ZOOM, height = 260,
  interactive = true, label, track = false, onLocate, onLocateError, focus }: MapProps & { g: typeof google.maps }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pinOverlays = useRef<HtmlOverlay[]>([]);
  const areaItems = useRef<(google.maps.Polygon | HtmlOverlay)[]>([]);
  const me = useRef<{ dot: HtmlOverlay | null; circle: google.maps.Circle | null }>({ dot: null, circle: null });
  const pickMarker = useRef<google.maps.Marker | null>(null);
  const cbs = useRef({ onPick, onLocate, onLocateError });
  cbs.current = { onPick, onLocate, onLocateError };

  useEffect(() => {
    if (!box.current || map.current) return;
    const [[s, w], [n, e]] = ELMINA_BOUNDS;
    const pad = 0.05;
    const m = new g.Map(box.current, {
      center: { lat: (center ?? ELMINA_CENTER)[0], lng: (center ?? ELMINA_CENTER)[1] }, zoom, minZoom: 12,
      restriction: { latLngBounds: { south: s - pad, west: w - pad, north: n + pad, east: e + pad }, strictBounds: false },
      styles: STYLE, clickableIcons: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
      gestureHandling: interactive ? "greedy" : "none", disableDefaultUI: !interactive, keyboardShortcuts: interactive,
    });
    m.addListener("click", (ev: google.maps.MapMouseEvent) => { if (ev.latLng) cbs.current.onPick?.(ev.latLng.lat(), ev.latLng.lng()); });
    map.current = m;
    return () => {
      pinOverlays.current.forEach((o) => o.remove());
      areaItems.current.forEach((a) => (a instanceof g.Polygon ? a.setMap(null) : a.remove()));
      me.current.dot?.remove(); me.current.circle?.setMap(null);
      pickMarker.current?.setMap(null);
      map.current = null;
    };
    // created once; props below are applied in their own effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sections of City of Elmina
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    areaItems.current.forEach((a) => (a instanceof g.Polygon ? a.setMap(null) : a.remove()));
    areaItems.current = [];
    for (const a of areas) {
      const c = areaColor(a.kind, a.slug);
      const ring = a.boundary.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
      areaItems.current.push(new g.Polygon({
        map: m, paths: ring, strokeColor: c.line, strokeWeight: a.mine ? 3 : 1.5, strokeOpacity: 0.9,
        fillColor: c.fill, fillOpacity: 0.32, clickable: false, zIndex: 1,
      }));
      const lat = ring.reduce((s2, p) => s2 + p.lat, 0) / ring.length;
      const lng = ring.reduce((s2, p) => s2 + p.lng, 0) / ring.length;
      const text = `<span>${esc(a.name)}</span>${a.note ? `<small>${esc(a.note)}</small>` : ""}`;
      areaItems.current.push(htmlOverlay(g, m, { lat, lng }, `<div class="area-label gm-center${a.mine ? " mine" : ""}">${text}</div>`, { z: -500 }));
    }
  }, [areas, g]);

  // Pins (issues, SOS, neighbours) use the same HTML as the Leaflet map.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pinOverlays.current.forEach((o) => o.remove());
    pinOverlays.current = pins.map((p) => {
      const size = p.size ?? [36, 44];
      return htmlOverlay(g, m, { lat: p.lat, lng: p.lng }, p.html,
        { className: "jiran-pin", anchor: [size[0] / 2, size[1] - 2], z: p.z, title: p.label, onClick: p.onClick });
    });
  }, [pins, g]);

  // Live location: the browser watches the position while tracking is on; nothing is sent from here.
  useEffect(() => {
    const m = map.current;
    if (!m || !track) return;
    if (!("geolocation" in navigator)) { cbs.current.onLocateError?.("unsupported"); return; }
    const id = navigator.geolocation.watchPosition((pos) => {
      const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      me.current.dot?.remove();
      me.current.dot = htmlOverlay(g, m, ll, '<div class="me-dot"></div>', { anchor: [11, 11], z: 2000, title: "You are here" });
      if (!me.current.circle) me.current.circle = new g.Circle({ map: m, strokeColor: "#1D4ED8", strokeWeight: 1, fillColor: "#1D4ED8", fillOpacity: 0.12, clickable: false });
      me.current.circle.setCenter(ll);
      me.current.circle.setRadius(Math.min(pos.coords.accuracy, 400));
      cbs.current.onLocate?.({ ...ll, accuracy: pos.coords.accuracy, at: Date.now() });
    }, (err) => cbs.current.onLocateError?.(err.message), { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    return () => {
      navigator.geolocation.clearWatch(id);
      me.current.dot?.remove(); me.current.dot = null;
      me.current.circle?.setMap(null); me.current.circle = null;
    };
  }, [track, g]);

  // Drop or drag a pin
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pick) { pickMarker.current?.setMap(null); pickMarker.current = null; return; }
    if (!pickMarker.current) {
      pickMarker.current = new g.Marker({ map: m, position: pick, draggable: true, title: "Chosen location" });
      pickMarker.current.addListener("dragend", () => {
        const p = pickMarker.current?.getPosition();
        if (p) cbs.current.onPick?.(p.lat(), p.lng());
      });
    } else {
      pickMarker.current.setPosition(pick);
    }
    if (!m.getBounds()?.contains(pick)) m.panTo(pick);
  }, [pick, g]);

  useEffect(() => { if (center && map.current) map.current.setCenter({ lat: center[0], lng: center[1] }); }, [center]);
  useEffect(() => {
    const m = map.current;
    if (!focus || !m) return;
    m.panTo({ lat: focus.lat, lng: focus.lng });
    m.setZoom(focus.zoom ?? Math.max(m.getZoom() ?? DEFAULT_ZOOM, 16));
  }, [focus]);

  return <div ref={box} className="leaflet-box" style={{ height }} role="application" aria-label={label} />;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
