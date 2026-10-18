// City of Elmina properties, exactly as listed on the official page (checked 18 Oct 2026):
// https://www.simedarbyproperty.com/city-of-elmina/#properties
// Map positions are from Google Maps place results; Elmina Ridge 2 uses the Elmina Ridge neighbourhood (approximate).

export type PropertyKind = "residential" | "commercial" | "industrial";
export interface Property {
  slug: string; name: string; kind: PropertyKind; place: string; lines: string[]; priceNote?: string;
  url: string; lat: number; lng: number; approximate?: boolean;
  /** Artist's impression supplied by the team from the official listing (served from /public/properties). */
  image: string;
}

export const PROPERTIES: Property[] = [
  {
    slug: "kanopi-residences", name: "Kanopi Residences", kind: "residential", place: "Elmina City Centre",
    lines: ["From RM590,888*", "From 1,000 sqft", "3 Beds & 2 Baths"],
    priceNote: "*Price as shown on the Sime Darby Property website. Terms apply; check with the sales team.",
    url: "https://www.simedarbyproperty.com/city-of-elmina/elmina-city-centre/kanopi-residences/",
    lat: 3.1798696, lng: 101.5047925, image: "/properties/kanopi-residences.jpg",
  },
  {
    slug: "elmina-ridge-2", name: "Elmina Ridge 2", kind: "residential", place: "Elmina Ridge",
    lines: ["From 2,274 sqft to 3,288 sqft", "From 4 Beds & 4 Baths"],
    url: "https://www.simedarbyproperty.com/city-of-elmina/elmina-ridge-2/",
    lat: 3.1661426, lng: 101.4978069, approximate: true, image: "/properties/elmina-ridge-2.jpg",
  },
  {
    slug: "jumpa", name: "Jumpa @ Elmina Valley", kind: "commercial", place: "Elmina Valley",
    lines: ["Freehold Shop/Office/Retail Space", "From 3,360 sqft to 8,144 sqft", "Total of 44 units"],
    url: "https://www.simedarbyproperty.com/city-of-elmina/jumpa/",
    lat: 3.1736983, lng: 101.5094744, image: "/properties/jumpa.jpg",
  },
  {
    slug: "elmina-business-park", name: "Elmina Business Park", kind: "industrial", place: "Elmina Business Park",
    lines: ["Freehold Semi-Detached Factories", "4,410 sqft (Type A) & 9,573 sqft (Type B)", "Total of 60 units"],
    url: "https://www.simedarbyproperty.com/elmina-business-park/",
    lat: 3.2266053, lng: 101.5221802, image: "/properties/elmina-business-park.jpg",
  },
];

export const PROPERTY_SOURCE = "https://www.simedarbyproperty.com/city-of-elmina/#properties";
export const propertyBySlug = (slug: string) => PROPERTIES.find((p) => p.slug === slug) ?? null;
