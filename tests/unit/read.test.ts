import { describe, expect, it } from "vitest";
import { clip, count, isObject, list, names, number, opt, text, time } from "../../src/core/read.js";

// BOT-18: the shared readers of the site's answers (CLAUDE.md rule 10).
describe("read", () => {
  it("reads values defensively", () => {
    expect([isObject({}), isObject(null), isObject("x")]).toEqual([true, false, false]);
    expect([text(" a "), text(""), text("  "), text(3)]).toEqual(["a", undefined, undefined, undefined]);
    expect([number(1.5), number(Number.NaN), number("1")]).toEqual([1.5, undefined, undefined]);
    expect([count(0), count(2), count(-1), count(1.5)]).toEqual([0, 2, undefined, undefined]);
    expect([time(1), time(0), time(-5)]).toEqual([1, undefined, undefined]);
    expect(names([" Ada ", "", 3, "Bob"])).toEqual(["Ada", "Bob"]);
    expect(list([{ a: 1 }, null, "x"])).toEqual([{ a: 1 }]);
    expect(names("nope")).toEqual([]);
  });

  it("leaves out undefined fields and clips text", () => {
    expect(opt("a", undefined)).toEqual({});
    expect(opt("a", 0)).toEqual({ a: 0 });
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("abc", 4)).toBe("abc");
  });
});
