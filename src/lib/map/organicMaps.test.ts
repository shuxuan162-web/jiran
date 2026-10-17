import { describe, expect, it } from "vitest";
import { omPlaceLink, omRouteLink } from "./organicMaps";

describe("Organic Maps links", () => {
  it("builds a place link in the clear-coordinate form the app parses", () => {
    expect(omPlaceLink(3.1705, 101.4995, "Elmina Valley")).toBe("https://omaps.app/3.170500,101.499500/Elmina_Valley?z=17");
    expect(omPlaceLink(3.18, 101.5)).toBe("https://omaps.app/3.180000,101.500000?z=17");
  });
  it("keeps zoom in the range the app accepts (1-20)", () => {
    expect(omPlaceLink(3.18, 101.5, undefined, 25)).toMatch(/\?z=20$/);
    expect(omPlaceLink(3.18, 101.5, undefined, 0)).toMatch(/\?z=1$/);
  });
  it("never lets a name break the path", () => {
    expect(omPlaceLink(3.18, 101.5, "Fire / smoke")).toBe("https://omaps.app/3.180000,101.500000/Fire___smoke?z=17");
  });
  it("builds a route with parameters in the required order", () => {
    const url = omRouteLink({ lat: 3.2, lng: 101.49, name: "Security desk" }, { lat: 3.1705, lng: 101.4995, name: "SOS-2610-0001" }, "pedestrian");
    expect(url).toBe("om://route?sll=3.200000,101.490000&saddr=Security%20desk&dll=3.170500,101.499500&daddr=SOS-2610-0001&type=pedestrian");
    const keys = [...new URL(url.replace("om://", "https://x/")).searchParams.keys()];
    expect(keys).toEqual(["sll", "saddr", "dll", "daddr", "type"]);
  });
});
