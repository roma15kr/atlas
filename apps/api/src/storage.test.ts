import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { LocalObjectStorage } from "./storage";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("LocalObjectStorage", () => {
  it("stores and retrieves an opaque object key", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "atlas-storage-"));
    roots.push(root);
    const storage = new LocalObjectStorage(root);
    const stored = await storage.put({ companyId: "company", fileName: "brief.pdf", body: Buffer.from("atlas") });
    const chunks: Buffer[] = [];
    for await (const chunk of await storage.get(stored.key) as Readable) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("atlas");
    expect(stored.key).not.toContain("brief");
  });
});
