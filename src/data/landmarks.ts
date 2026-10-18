// Township facts and landmarks. Facts quote the official City of Elmina page (checked 18 Oct 2026);
// map positions are from Google Maps place results.

export const TOWNSHIP_FACTS = [
  { value: "5,000", unit: "acres", label: "masterplan" },
  { value: "300", unit: "acres", label: "Central Park" },
  { value: "90", unit: "km", label: "cycling & jogging tracks" },
  { value: "2,700", unit: "acres", label: "forest reserve next door" },
];
export const TOWNSHIP_SOURCE = "https://www.simedarbyproperty.com/city-of-elmina/";

export interface Landmark {
  slug: string; name: string; kind: "mall" | "park" | "nature"; lat: number; lng: number;
  address?: string; hours?: string; blurb: string; link?: { to: string; label: "mall" | "official" };
}

export const LANDMARKS: Landmark[] = [
  {
    slug: "elmina-lakeside-mall", name: "Elmina Lakeside Mall", kind: "mall", lat: 3.1821168, lng: 101.5102279,
    address: "No.5, Persiaran Garcinia, Elmina West, 40170 Shah Alam, Selangor",
    hours: "Monday - Sunday, 10.00am to 10.00pm",
    blurb: "Open concept design, blending indoor and outdoor.",
    link: { to: "/app/mall", label: "mall" },
  },
  {
    slug: "elmina-central-park", name: "Elmina Central Park", kind: "park", lat: 3.1792101, lng: 101.5133778,
    blurb: "The 300-acre Central Park, part of the township's 90 km of cycling and jogging tracks.",
  },
  {
    slug: "erkc", name: "Elmina Rainforest Knowledge Centre (ERKC)", kind: "nature", lat: 3.1710255, lng: 101.500808,
    address: "No. 7, Persiaran Ficus, Seksyen U15 Elmina West, 40170 Shah Alam, Selangor",
    blurb: "Set up with the Tropical Rainforest Conservation and Research Centre (TRCRC): a hub for forestry research, conservation, education and recreation.",
    link: { to: "https://www.simedarbyproperty.com/city-of-elmina/", label: "official" },
  },
];
