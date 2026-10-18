// Elmina Lakeside Mall, from the official page (checked 18 Oct 2026):
// https://www.simedarbyproperty.com/malls/elmina-lake-side-mall/
// Store names and lot numbers are copied from the directory as shown (the page loads more on demand, so this may not be complete).
// The official page does not say which category each store is in: "cat" is Jiran's own grouping, shown with a label.
// "other" = we haven't grouped it yet.

export const MALL = {
  name: "Elmina Lakeside Mall",
  address: ["No.5, Persiaran Garcinia", "Elmina West", "40170 Shah Alam", "Selangor Darul Ehsan"],
  hours: "Monday - Sunday, 10.00am to 10.00pm",
  email: "elmmmo@simedarbyproperty.com",
  blurb: "Elmina Lakeside Mall embraces an open concept design, seamlessly blending indoor and outdoor.",
  url: "https://www.simedarbyproperty.com/malls/elmina-lake-side-mall/",
  lat: 3.1821168, lng: 101.5102279,
  checked: "18 Oct 2026",
};

// Category names follow the official filter list.
export const MALL_CATEGORIES = [
  "supermarkets", "home", "leisure", "fashion", "fnb", "it", "services", "accessories", "optical", "kids", "beauty", "other",
] as const;
export type MallCategory = (typeof MALL_CATEGORIES)[number];
export interface Store { name: string; lot: string | null; cat: MallCategory; soon: boolean }

export const STORES: Store[] = [
  {
  "name": "Chica Bonita",
  "lot": "GF-79",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Jaya Grocer",
  "lot": "GF-29",
  "cat": "supermarkets",
  "soon": false
  },
  {
  "name": "Creative Lab",
  "lot": "GF-90, 91 & 92",
  "cat": "other",
  "soon": false
  },
  {
  "name": "Harvey Norman",
  "lot": "GF-88 & 89",
  "cat": "home",
  "soon": false
  },
  {
  "name": "Meija",
  "lot": "GF-55",
  "cat": "other",
  "soon": false
  },
  {
  "name": "Mr D.I.Y.",
  "lot": "GF-25",
  "cat": "home",
  "soon": false
  },
  {
  "name": "D'Special Day",
  "lot": "GF-51",
  "cat": "other",
  "soon": false
  },
  {
  "name": "Happy Fish",
  "lot": "GF-57",
  "cat": "other",
  "soon": false
  },
  {
  "name": "Pets Wonderland",
  "lot": "GF-41 & 42",
  "cat": "leisure",
  "soon": false
  },
  {
  "name": "The Bike Artisans",
  "lot": "GF-81",
  "cat": "leisure",
  "soon": false
  },
  {
  "name": "Aula",
  "lot": "GF-46",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Bayu Somerset",
  "lot": "GF-66",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "F.O.S.",
  "lot": "GF-56",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Icahfa",
  "lot": "GF-67A",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Matase Sutera",
  "lot": "GF-45",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Onura Atelier",
  "lot": "GF-67B",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Siti Khadijah",
  "lot": "GF-02",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Sorella",
  "lot": "GF-53",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Teera Bellesa",
  "lot": "GF-63",
  "cat": "fashion",
  "soon": false
  },
  {
  "name": "Ali, Muthu & Ah Hock",
  "lot": "GF-43A",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Annie1",
  "lot": "GF-07",
  "cat": "other",
  "soon": false
  },
  {
  "name": "BHC Chicken",
  "lot": "GF-69",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Boost Juice Bars",
  "lot": "GK-01",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Buah",
  "lot": "GF-22",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Bukuh Express",
  "lot": "GF-37 & 38",
  "cat": "other",
  "soon": false
  },
  {
  "name": "Burger King",
  "lot": "DT-02",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Chagee",
  "lot": "GF-85",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "ChaTraMue",
  "lot": "GF-16",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Daily Fresh",
  "lot": "GK-02",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "D'Aroma Sajian",
  "lot": "GF-70",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Diana's Premium Cakes",
  "lot": "GF-32",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Dolly Dim Sum",
  "lot": "GF-68",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Fifbites",
  "lot": "GK-08",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Fish & Co.",
  "lot": "GF-71",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Gula Petite x Arieni's Roti Jala",
  "lot": "GF-65",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Potato Corner",
  "lot": "GF-30",
  "cat": "fnb",
  "soon": true
  },
  {
  "name": "Hot & Roll",
  "lot": "GF-33",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Inari Express",
  "lot": "GK-09",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Inside Scoop",
  "lot": "GF-13A",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Jardin Coffee and Tea",
  "lot": "GK-10",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Serai Serai",
  "lot": "GF-75",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Kenny Hills Bakers",
  "lot": "GF-77 & 78",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Koffie Macroy",
  "lot": "GF-43",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Krispy Kreme",
  "lot": "GF-31",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Lavender",
  "lot": "GF-18 & 19",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "llaollao",
  "lot": "GF-23",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Mee Hiris China Muslim",
  "lot": "GF-08",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Nak Nak",
  "lot": "DT-03",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Nyonya Colors",
  "lot": "GF-53A",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Ole-Ole Bali",
  "lot": "GF-80",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "ParaThai",
  "lot": "GF-73",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Rollti",
  "lot": "GK-03 & 03A",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Rotiboy",
  "lot": "GF-33A",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Subway",
  "lot": "GF-21",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Super Saigon",
  "lot": "GF-73A",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Sushi Zanmai",
  "lot": "GF-82 & 83",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Taffy Gelato",
  "lot": "GK-11",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Tealive",
  "lot": "GF-17",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "The Coffee Bean and Tea Leaf Café",
  "lot": "GF-20",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Tutti Fruitti",
  "lot": "GF-39",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Zus Coffee",
  "lot": "GF-95 & 96",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "CASE",
  "lot": "GF-27",
  "cat": "it",
  "soon": false
  },
  {
  "name": "Gadget C Store",
  "lot": "GF-11",
  "cat": "it",
  "soon": false
  },
  {
  "name": "Machines",
  "lot": "GF-01",
  "cat": "it",
  "soon": false
  },
  {
  "name": "7-Eleven",
  "lot": "GF-83A",
  "cat": "supermarkets",
  "soon": false
  },
  {
  "name": "Big Eye",
  "lot": "GF-93 & 93A",
  "cat": "other",
  "soon": false
  },
  {
  "name": "myNews.com",
  "lot": "GF-06",
  "cat": "supermarkets",
  "soon": false
  },
  {
  "name": "Swift Bike",
  "lot": "GF-35 & 36",
  "cat": "leisure",
  "soon": false
  },
  {
  "name": "Typical Lux & Bag Services",
  "lot": "GF-13",
  "cat": "services",
  "soon": false
  },
  {
  "name": "Wax Zone",
  "lot": "P-01",
  "cat": "beauty",
  "soon": true
  },
  {
  "name": "Skechers",
  "lot": "GF-86",
  "cat": "accessories",
  "soon": false
  },
  {
  "name": "A-Look",
  "lot": "GF-05",
  "cat": "optical",
  "soon": false
  },
  {
  "name": "Jac's Optometry",
  "lot": "GF-50",
  "cat": "optical",
  "soon": false
  },
  {
  "name": "The BabyLoft",
  "lot": "GF-67",
  "cat": "kids",
  "soon": false
  },
  {
  "name": "Toys \"R\" Us",
  "lot": "GF-58 & 59",
  "cat": "kids",
  "soon": false
  },
  {
  "name": "Twigs Bookshop",
  "lot": "GF-63A",
  "cat": "kids",
  "soon": false
  },
  {
  "name": "Caring Pharmacy",
  "lot": "GF-52",
  "cat": "beauty",
  "soon": false
  },
  {
  "name": "Velvet Vanity",
  "lot": "GF-15",
  "cat": "beauty",
  "soon": false
  },
  {
  "name": "NIMROC",
  "lot": "GF-12",
  "cat": "other",
  "soon": false
  },
  {
  "name": "Thai Odyssey",
  "lot": "GF-23A",
  "cat": "beauty",
  "soon": false
  },
  {
  "name": "Watsons",
  "lot": "GF-03 & 03A",
  "cat": "beauty",
  "soon": false
  },
  {
  "name": "Gong Cha",
  "lot": "GK-07",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Puteh",
  "lot": "GF-60 & GF-61",
  "cat": "other",
  "soon": false
  },
  {
  "name": "TiQaco",
  "lot": "GF-09 & GF-10",
  "cat": "other",
  "soon": false
  },
  {
  "name": "LG Puricare",
  "lot": "GF-26",
  "cat": "home",
  "soon": false
  },
  {
  "name": "Anytime Fitness",
  "lot": "GF-87A",
  "cat": "leisure",
  "soon": false
  },
  {
  "name": "Littlefoot (indoor playground)",
  "lot": "GF-87B",
  "cat": "kids",
  "soon": false
  },
  {
  "name": "Penang Chendul",
  "lot": "GK-05 & GK-06",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "W Gallery",
  "lot": "GF-62",
  "cat": "other",
  "soon": false
  },
  {
  "name": "18 Lab by KLGCC Sales Gallery",
  "lot": null,
  "cat": "services",
  "soon": false
  },
  {
  "name": "Al-Ikhsan Sports",
  "lot": "GF-47, 48 & 49",
  "cat": "accessories",
  "soon": false
  },
  {
  "name": "Ediya Coffee",
  "lot": "DT-01",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Ohcha Matcha",
  "lot": "GF-39A",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Banglo 289",
  "lot": "GF-76",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "Decathlon",
  "lot": "GF-97",
  "cat": "leisure",
  "soon": false
  },
  {
  "name": "Nando's",
  "lot": "GF-72",
  "cat": "fnb",
  "soon": false
  },
  {
  "name": "The Nail Place",
  "lot": "GF-28",
  "cat": "beauty",
  "soon": false
  }
  ];

/** Lot prefix GF = ground floor. Other prefixes (GK, DT, P) are not explained on the official page. */
export function lotArea(lot: string | null): "gf" | "other" | "none" {
  if (!lot) return "none";
  return lot.startsWith("GF") ? "gf" : "other";
}
