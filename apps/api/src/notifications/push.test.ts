import { describe, expect, it } from "vitest";
import { pushOptions, pushTag } from "./push";

describe("push options", () => {
  it("sends with high urgency and a day to deliver, so a locked phone shows it at once", () => {
    expect(pushOptions()).toMatchObject({ urgency: "high", TTL: 86_400 });
  });
});

describe("push tag", () => {
  it("lets chat pop-ups replace each other per conversation, and other kinds per item", () => {
    const link = "/messages?conversation=c1";
    expect(pushTag({ id: "n1", kind: "CHAT_MESSAGE", link, entityId: "m1" })).toBe(pushTag({ id: "n2", kind: "CHAT_MENTION", link, entityId: "m2" }));
    expect(pushTag({ id: "n1", kind: "CHAT_MESSAGE", link, entityId: "m1" })).not.toBe(pushTag({ id: "n3", kind: "CHAT_MESSAGE", link: "/messages?conversation=c2", entityId: "m3" }));
    expect(pushTag({ id: "n4", kind: "TASK_ASSIGNED", link: "/tasks?task=t1", entityId: "t1" })).toBe("TASK_ASSIGNED:t1");
  });
});
