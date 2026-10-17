// Links into Organic Maps (organicmaps.app), the free offline map app built on OpenStreetMap.
// Formats come from Organic Maps' own parser (libs/map/mwm_url.cpp and its tests):
//   place:  https://omaps.app/<lat>,<lon>/<Name>?z=<1..20>   opens the app if installed, else the website
//   route:  om://route?sll=<lat>,<lon>&saddr=<name>&dll=<lat>,<lon>&daddr=<name>&type=<vehicle|pedestrian|bicycle>
// The route parameters must be in exactly that order or the app rejects the link.

export const ORGANIC_MAPS_SITE = "https://organicmaps.app";
export type OmRouteType = "vehicle" | "pedestrian" | "bicycle";

const coord = (x: number) => x.toFixed(6);
/** Organic Maps reads "_" in the name part as a space. */
const slug = (name: string) => encodeURIComponent(name.trim().replace(/\s+/g, "_")).replace(/%2F/gi, "_");

export function omPlaceLink(lat: number, lng: number, name?: string, zoom = 17) {
  const z = Math.min(20, Math.max(1, Math.round(zoom)));
  return `https://omaps.app/${coord(lat)},${coord(lng)}${name ? `/${slug(name)}` : ""}?z=${z}`;
}

export function omRouteLink(
  from: { lat: number; lng: number; name: string },
  to: { lat: number; lng: number; name: string },
  type: OmRouteType = "vehicle",
) {
  const q = (s: string) => encodeURIComponent(s);
  return `om://route?sll=${coord(from.lat)},${coord(from.lng)}&saddr=${q(from.name)}`
    + `&dll=${coord(to.lat)},${coord(to.lng)}&daddr=${q(to.name)}&type=${type}`;
}
