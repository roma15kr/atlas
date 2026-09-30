import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { LocalObjectStorage, S3ObjectStorage, selectStorage } from "./storage";

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

describe("selectStorage", () => {
  const base = { STORAGE_DIR: "/data/documents", S3_REGION: "us-east-1", S3_BUCKET: "atlas-documents" };

  it("uses the local document volume when S3 is not configured", () => {
    expect(selectStorage(base)).toBeInstanceOf(LocalObjectStorage);
  });

  it("ignores partial S3 settings", () => {
    expect(selectStorage({ ...base, S3_ENDPOINT: "http://storage:9000", S3_ACCESS_KEY: "key" })).toBeInstanceOf(LocalObjectStorage);
  });

  it("uses S3 only when endpoint and both credentials are set", () => {
    expect(selectStorage({ ...base, S3_ENDPOINT: "http://storage:9000", S3_ACCESS_KEY: "key", S3_SECRET_KEY: "secret" })).toBeInstanceOf(S3ObjectStorage);
  });
});

describe("LocalObjectStorage safety", () => {
  it("reports a healthy writable directory and an unwritable one", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "atlas-storage-"));
    roots.push(root);
    await expect(new LocalObjectStorage(path.join(root, "documents")).health()).resolves.toBeUndefined();
    const locked = path.join(root, "locked");
    await fs.mkdir(locked, { mode: 0o500 });
    const probe = await fs.writeFile(path.join(locked, "probe"), "x").then(() => true, () => false);
    // Root can write anywhere; the permission assertion only means something for a non-root runtime user.
    if (!probe) await expect(new LocalObjectStorage(locked).health()).rejects.toThrow();
    await fs.chmod(locked, 0o700);
  });

  it("never overwrites an existing object and rejects keys outside the root", async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "atlas-storage-"));
    roots.push(root);
    const storage = new LocalObjectStorage(root);
    const stored = await storage.put({ companyId: "company", fileName: "a.pdf", body: Buffer.from("first") });
    const again = await storage.put({ companyId: "company", fileName: "a.pdf", body: Buffer.from("second") });
    expect(again.key).not.toBe(stored.key);
    await expect(fs.writeFile(path.join(root, stored.key), "x", { flag: "wx" })).rejects.toThrow();
    await expect(fs.readFile(path.join(root, stored.key), "utf8")).resolves.toBe("first");
    await expect(storage.get("../outside")).rejects.toThrow("Invalid storage key");
  });
});
