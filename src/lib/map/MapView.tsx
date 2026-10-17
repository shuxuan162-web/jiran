import { useEffect, useState } from "react";
import LeafletMap from "./LeafletMap";
import GoogleMap, { type MapProps } from "./GoogleMap";
import { googleMapsFailed, loadGoogleMaps } from "./googleLoader";
import { env } from "../../config/env";

/**
 * The map every screen uses. Google Maps when the key works for this site; if Google refuses the key,
 * is blocked or slow, it switches to the OpenStreetMap (Leaflet) map with the same pins and sections,
 * so the map never goes blank on stage.
 */
export default function MapView(props: MapProps) {
  const [g, setG] = useState<typeof google.maps | null>(null);
  const [fallback, setFallback] = useState(!env.googleMapsKey || googleMapsFailed());

  useEffect(() => {
    if (fallback) return;
    let alive = true;
    loadGoogleMaps().then((x) => { if (alive) setG(x); }).catch(() => { if (alive) setFallback(true); });
    const onFail = () => { if (alive) { setG(null); setFallback(true); } };
    window.addEventListener("jiran-gmaps-failed", onFail);
    return () => { alive = false; window.removeEventListener("jiran-gmaps-failed", onFail); };
  }, [fallback]);

  if (fallback) return <LeafletMap {...props} />;
  if (!g) return <div className="leaflet-box map-loading" style={{ height: props.height ?? 260 }} role="status" aria-label={props.label} />;
  return <GoogleMap g={g} {...props} />;
}
