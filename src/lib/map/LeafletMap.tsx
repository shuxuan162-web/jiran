import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_ZOOM, ELMINA_BOUNDS, ELMINA_CENTER, TILE_ATTRIBUTION, TILE_URL } from "./elmina";

export interface MapPin { id: string; lat: number; lng: number; html: string; label: string; onClick?: () => void; z?: number }

const pinIcon = (html: string) => L.divIcon({ html, className: "jiran-pin", iconSize: [36, 44], iconAnchor: [18, 42] });

/**
 * Thin Leaflet wrapper (the fallback map provider). One map per mount; pins re-render on change.
 * Tapping the map calls onPick when given (used by the report flow to drop a pin).
 */
export default function LeafletMap({ pins = [], pick, onPick, center, zoom = DEFAULT_ZOOM, height = 260, interactive = true, label }: {
  pins?: MapPin[]; pick?: { lat: number; lng: number } | null; onPick?: (lat: number, lng: number) => void;
  center?: [number, number]; zoom?: number; height?: number | string; interactive?: boolean; label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pickMarker = useRef<L.Marker | null>(null);
  const pickCb = useRef(onPick);
  pickCb.current = onPick;

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, {
      center: center ?? ELMINA_CENTER, zoom, maxBounds: L.latLngBounds(ELMINA_BOUNDS).pad(0.6),
      minZoom: 12, zoomControl: interactive, dragging: interactive, scrollWheelZoom: false,
      doubleClickZoom: interactive, touchZoom: interactive, keyboard: interactive, attributionControl: true,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, subdomains: "abcd" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pickCb.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // created once; props below are applied in their own effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const p of pins) {
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p.html), title: p.label, alt: p.label, keyboard: true, zIndexOffset: p.z ?? 0 });
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
        icon: pinIcon('<div class="pin pin-pick"><span></span></div>'), draggable: true, title: "Issue location", keyboard: true,
      }).addTo(m);
      pickMarker.current.on("dragend", () => {
        const ll = pickMarker.current!.getLatLng();
        pickCb.current?.(ll.lat, ll.lng);
      });
    } else {
      pickMarker.current.setLatLng([pick.lat, pick.lng]);
    }
    if (!m.getBounds().pad(-0.2).contains([pick.lat, pick.lng])) m.panTo([pick.lat, pick.lng]);
  }, [pick]);

  useEffect(() => {
    if (center && map.current) map.current.setView(center, map.current.getZoom());
  }, [center]);

  return <div ref={box} className="leaflet-box" style={{ height }} role="application" aria-label={label} />;
}
