import { describe, expect, it } from "vitest";
import {
  VioletAuditLogger,
  redactSensitiveData,
  redactSensitiveString,
} from "./auditLogger";

describe("redactSensitiveString", () => {
  it("redacts bearer tokens", () => {
    const text = "Authorization: Bearer mySecretToken1234567890abcdef and more";
    expect(redactSensitiveString(text)).toBe("Authorization: Bearer [REDACTED] and more");
  });

  it("redacts JWT tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature12345";
    const text = `User session token: ${jwt}`;
    expect(redactSensitiveString(text)).toBe("User session token: [REDACTED_JWT]");
  });

  it("redacts API keys (sk-, nvapi-, ghp_)", () => {
    expect(redactSensitiveString("OpenAI sk-abcdef1234567890abcdef1234567890")).toBe("OpenAI [REDACTED_API_KEY]");
    expect(redactSensitiveString("NVIDIA nvapi-12345678901234567890abcdefghij")).toBe("NVIDIA [REDACTED_API_KEY]");
    expect(redactSensitiveString("GitHub ghp_123456789012345678901234567890123456")).toBe("GitHub [REDACTED_GITHUB_TOKEN]");
  });
});

describe("redactSensitiveData", () => {
  it("masks values for sensitive keys in nested objects", () => {
    const input = {
      user: "alice",
      apiKey: "secret_123",
      nested: {
        token: "tok_abc",
        allowedPath: "C:/Projects",
        auth: {
          password: "myPassword123",
          clientSecret: "shhh",
        },
        credentials: "raw_secret_value",
      },
    };

    const redacted = redactSensitiveData(input);
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.nested.token).toBe("[REDACTED]");
    expect(redacted.nested.credentials).toBe("[REDACTED]");
    expect(redacted.nested.auth.password).toBe("[REDACTED]");
    expect(redacted.nested.auth.clientSecret).toBe("[REDACTED]");
    expect(redacted.user).toBe("alice");
    expect(redacted.nested.allowedPath).toBe("C:/Projects");
  });
});

describe("VioletAuditLogger", () => {
  it("records structured events with redaction and retrieves them", () => {
    const logger = new VioletAuditLogger(10);
    const event = logger.record({
      taskId: "task-100",
      userId: "user-1",
      eventType: "tool.execution",
      summary: "Called files.read with Bearer abcdef1234567890",
      details: {
        path: "C:/notes.txt",
        token: "secret-token",
      },
    });

    expect(event.id).toMatch(/^evt_/);
    expect(event.summary).toBe("Called files.read with Bearer [REDACTED]");
    expect(event.details.token).toBe("[REDACTED]");
    expect(event.details.path).toBe("C:/notes.txt");

    const events = logger.getEvents("task-100");
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(event.id);
  });

  it("notifies subscribers when events are recorded", () => {
    const logger = new VioletAuditLogger();
    const observed: string[] = [];

    const unsubscribe = logger.subscribe((e) => {
      observed.push(e.eventType);
    });

    logger.record({
      taskId: "t1",
      userId: "u1",
      eventType: "step.started",
      summary: "Step started",
      details: {},
    });

    logger.record({
      taskId: "t1",
      userId: "u1",
      eventType: "step.completed",
      summary: "Step completed",
      details: {},
    });

    unsubscribe();

    logger.record({
      taskId: "t1",
      userId: "u1",
      eventType: "task.completed",
      summary: "Task completed",
      details: {},
    });

    expect(observed).toEqual(["step.started", "step.completed"]);
  });

  it("enforces max ring buffer capacity", () => {
    const logger = new VioletAuditLogger(3);
    for (let i = 0; i < 5; i++) {
      logger.record({
        taskId: `task-${i}`,
        userId: "u1",
        eventType: "ping",
        summary: `event ${i}`,
        details: {},
      });
    }

    const events = logger.getEvents();
    expect(events).toHaveLength(3);
    expect(events[0].summary).toBe("event 4");
    expect(events[2].summary).toBe("event 2");
  });
});
