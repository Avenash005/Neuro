import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../circuitBreaker";

describe("CircuitBreaker", () => {
  it("initializes in closed state with 0 failures", () => {
    const cb = new CircuitBreaker("openai", { failureThreshold: 3 });
    expect(cb.getState()).toBe("closed");
    expect(cb.isAvailable()).toBe(true);
  });

  it("transitions to open state when failure threshold is reached", () => {
    const cb = new CircuitBreaker("openai", { failureThreshold: 3 });
    cb.recordFailure(true);
    expect(cb.getState()).toBe("closed");
    cb.recordFailure(true);
    expect(cb.getState()).toBe("closed");
    cb.recordFailure(true);
    expect(cb.getState()).toBe("open");
    expect(cb.isAvailable()).toBe(false);
  });

  it("resets back to closed upon recordSuccess", () => {
    const cb = new CircuitBreaker("anthropic", { failureThreshold: 2 });
    cb.recordFailure(true);
    cb.recordFailure(true);
    expect(cb.getState()).toBe("open");

    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
    expect(cb.isAvailable()).toBe(true);
  });

  it("transitions from open to half-open after reset timeout expires", async () => {
    const cb = new CircuitBreaker("gemini", { failureThreshold: 1, resetTimeoutMs: 50 });
    cb.recordFailure(true);
    expect(cb.getState()).toBe("open");

    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe("half-open");
    expect(cb.isAvailable()).toBe(true);
  });
});
