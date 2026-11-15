import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps type size next to text colour", () => {
    expect(cn("text-on-surface text-title-md")).toBe("text-on-surface text-title-md");
    expect(cn("text-label-lg", "text-body-md")).toBe("text-body-md");
    expect(cn("rounded-lg-plus", "rounded-full")).toBe("rounded-full");
  });
});
