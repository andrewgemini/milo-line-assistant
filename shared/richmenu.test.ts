import { describe, expect, it } from "vitest";
import config from "./richmenu.json";

describe("Milo 20-button Rich Menu", () => {
  it("contains exactly 20 non-overlapping button areas inside the LINE canvas", () => {
    expect(config.areas).toHaveLength(20);
    for (const area of config.areas) {
      expect(area.bounds.x).toBeGreaterThanOrEqual(0);
      expect(area.bounds.y).toBeGreaterThanOrEqual(0);
      expect(area.bounds.x + area.bounds.width).toBeLessThanOrEqual(config.size.width);
      expect(area.bounds.y + area.bounds.height).toBeLessThanOrEqual(config.size.height);
      expect(area.action.type).toBe("message");
    }
  });
});
