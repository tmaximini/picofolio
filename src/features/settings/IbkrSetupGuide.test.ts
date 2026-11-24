import { describe, expect, it } from "vitest";
import { FLEX_AI_PROMPT } from "./IbkrSetupGuide";

describe("FLEX_AI_PROMPT", () => {
  it("fits IBKR's 200-char AI prompt box", () => {
    expect(FLEX_AI_PROMPT.length).toBeLessThanOrEqual(200);
  });
});
