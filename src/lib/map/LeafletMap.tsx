import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Polygon } from "geojson";
import { DEFAULT_ZOOM, ELMINA_BOUNDS, ELMINA_CENTER, TILE_ATTRIBUTION, TILE_URL, areaColor } from "./elmina";

export interface MapPin { id: string; lat: number; lng: number; html: string; label: string; onClick?: () => void; z?: number; size?: [number, number] }
export interface AreaShape { id: string; slug: string; name: string; kind: string; boundary: Polygon; note?: string; mine?: boolean }
export interface LivePosition { lat: number; lng: number; accuracy: number; at: number }

const pinIcon = (html: string, size: [number, number] = [36, 44]) =>
  L.divIcon({ html, className: "jiran-pin", iconSize: size, iconAnchor: [size[0] / 2, size[1] - 2] });

/**
 * The Jiran map (Leaflet, key-less tiles). One map per mount; layers re-render when their props change.
 * - areas: the drawn layout of each City of Elmina section, colour-coded with its name on the map.
 * - track: live location through Leaflet's own locate({ watch }). It stays on this device: the
 *   position is drawn here and passed to onLocate, never sent anywhere by this component.
 * - pick/onPick: drop or drag a pin (report flow).
 */
export default function LeafletMap({
  pins = [], areas = [], pick, onPick, center, zoom = DEFAULT_ZOOM, height = 260, interactive = true, label,
  track = false, onLocate, onLocateError, focus,
}: {
  pins?: MapPin[]; areas?: AreaShape[]; pick?: { lat: number; lng: number } | null; onPick?: (lat: number, lng: number) => void;
  center?: [number, number]; zoom?: number; height?: number | string; interactive?: boolean; label: string;
  track?: boolean; onLocate?: (p: LivePosition) => void; onLocateError?: (message: string) => void;
  focus?: { lat: number; lng: number; zoom?: number; key: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const areaLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const pickMarker = useRef<L.Marker | null>(null);
  const cbs = useRef({ onPick, onLocate, onLocateError });
  cbs.current = { onPick, onLocate, onLocateError };

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, {
      center: center ?? ELMINA_CENTER, zoom, maxBounds: L.latLngBounds(ELMINA_BOUNDS).pad(0.6),
      minZoom: 12, zoomControl: interactive, dragging: interactive, scrollWheelZoom: false,
      doubleClickZoom: interactive, touchZoom: interactive, keyboard: interactive, attributionControl: true,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, subdomains: "abcd" }).addTo(m);
    areaLayer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    pinLayer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => cbs.current.onPick?.(e.latlng.lat, e.latlng.lng));
    m.on("locationfound", (e: L.LocationEvent) => {
      const g = meLayer.current;
      if (g) {
        g.clearLayers();
        L.circle(e.latlng, { radius: Math.min(e.accuracy, 400), color: "#1D4ED8", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(g);
        L.marker(e.latlng, { icon: L.divIcon({ html: '<div class="me-dot"></div>', className: "jiran-pin", iconSize: [22, 22], iconAnchor: [11, 11] }),
          title: "You are here", alt: "You are here", interactive: false, zIndexOffset: 2000 }).addTo(g);
      }
      cbs.current.onLocate?.({ lat: e.latlng.lat, lng: e.latlng.lng, accuracy: e.accuracy, at: Date.now() });
    });
    m.on("locationerror", (e: L.ErrorEvent) => cbs.current.onLocateError?.(e.message));
    map.current = m;
    return () => { m.stopLocate(); m.remove(); map.current = null; };
    // created once; props below are applied in their own effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live location: Leaflet watches the phone's position while tracking is on, and stops when off or unmounted.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (track) m.locate({ watch: true, enableHighAccuracy: true, setView: false, maximumAge: 10000, timeout: 20000 });
    else { m.stopLocate(); meLayer.current?.clearLayers(); }
  }, [track]);

  useEffect(() => {
    const g = areaLayer.current;
    if (!g) return;
    g.clearLayers();
    for (const a of areas) {
      const c = areaColor(a.kind, a.slug);
      const shape = L.geoJSON(a.boundary, {
        style: { color: c.line, weight: a.mine ? 3 : 1.5, dashArray: a.mine ? undefined : "4 4", fillColor: c.fill, fillOpacity: 0.32 },
        interactive: false,
      });
      shape.addTo(g);
      const label = `<span>${escapeHtml(a.name)}</span>${a.note ? `<small>${escapeHtml(a.note)}</small>` : ""}`;
      L.tooltip({ permanent: true, direction: "center", className: `area-label${a.mine ? " mine" : ""}`, interactive: false })
        .setLatLng(shape.getBounds().getCenter()).setContent(label).addTo(g);
    }
  }, [areas]);

  useEffect(() => {
    const g = pinLayer.current;
    if (!g) return;
    g.clearLayers();
    for (const p of pins) {
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p.html, p.size), title: p.label, alt: p.label, keyboard: true, zIndexOffset: p.z ?? 0 });
      if (p.onClick) mk.on("click", p.onClick);
      mk.addTo(g);
    }
  }, [pins]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pick) { pickMarker.current?.remove(); pickMarker.current = null; return; }
    if (!pickMarker.current) {
      pickMarker.current = L.marker([pick.lat, pick.lng], {
        icon: pinIcon('<div class="pin pin-pick"><span></span></div>'), draggable: true, title: "Chosen location", keyboard: true,
      }).addTo(m);
      pickMarker.current.on("dragend", () => {
        const ll = pickMarker.current!.getLatLng();
        cbs.current.onPick?.(ll.lat, ll.lng);
      });
    } else {
      pickMarker.current.setLatLng([pick.lat, pick.lng]);
    }
    if (!m.getBounds().pad(-0.2).contains([pick.lat, pick.lng])) m.panTo([pick.lat, pick.lng]);
  }, [pick]);

  useEffect(() => {
    if (center && map.current) map.current.setView(center, map.current.getZoom());
  }, [center]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.current.getZoom(), 16), { duration: 0.6 });
  }, [focus]);

  return <div ref={box} className="leaflet-box" style={{ height }} role="application" aria-label={label} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
