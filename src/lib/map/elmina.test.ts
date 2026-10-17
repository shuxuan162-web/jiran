import { describe, expect, it } from "vitest";
import { areaColor, distanceM, insideElmina, roundCoord } from "./elmina";

describe("map helpers", () => {
  it("rounds public positions to about 110 m (3 decimals), like the database", () => {
    expect(roundCoord(3.1705)).toBe(3.171);  // same value active_emergencies() returned for SOS-2610-0001
    expect(roundCoord(101.4995)).toBe(101.5);
    expect(roundCoord(3.17049)).toBe(3.17);
  });
  it("measures distance in metres", () => {
    const a = { lat: 3.18, lng: 101.5 };
    expect(distanceM(a, a)).toBe(0);
    const d = distanceM(a, { lat: 3.189, lng: 101.5 }); // 0.009 deg of latitude is about 1 km
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
  it("knows the township frame", () => {
    expect(insideElmina(3.18, 101.5)).toBe(true);
    expect(insideElmina(3.139, 101.686)).toBe(false); // Kuala Lumpur city centre
  });
  it("colours sections by kind", () => {
    expect(areaColor("park", "forest-park").line).toBe("#1F7A5C");
    expect(areaColor("precinct", "elmina-valley").fill).toBe("#FDE9DD");
  });
});
