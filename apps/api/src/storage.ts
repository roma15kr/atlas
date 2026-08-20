import { constants, createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";

export interface StoredObject {
  key: string;
  size: number;
}

export interface ObjectStorage {
  put(input: { companyId: string; fileName: string; body: Buffer }): Promise<StoredObject>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  health(): Promise<void>;
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  async put(input: { companyId: string; fileName: string; body: Buffer }): Promise<StoredObject> {
    const extension = path.extname(input.fileName).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
    const key = `${input.companyId}/${new Date().getUTCFullYear()}/${randomUUID()}${extension}`;
    const destination = this.resolve(key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, input.body, { flag: "wx" });
    return { key, size: input.body.byteLength };
  }

  async get(key: string): Promise<Readable> {
    await fs.access(this.resolve(key));
    return createReadStream(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async health(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.access(this.root, constants.R_OK | constants.W_OK);
  }

  private resolve(key: string): string {
    const resolved = path.resolve(this.root, key);
    const root = path.resolve(this.root) + path.sep;
    if (!resolved.startsWith(root)) throw new Error("Invalid storage key");
    return resolved;
  }
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: { endpoint: string; region: string; accessKey: string; secretKey: string }
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: true,
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey }
    });
  }

  async put(input: { companyId: string; fileName: string; body: Buffer }): Promise<StoredObject> {
    const extension = path.extname(input.fileName).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
    const key = `${input.companyId}/${new Date().getUTCFullYear()}/${randomUUID()}${extension}`;
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: input.body }));
    return { key, size: input.body.byteLength };
  }

  async get(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) throw new Error("Stored object has no body");
    return response.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async health(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}

function configuredStorage(): ObjectStorage {
  if (config.S3_ENDPOINT && config.S3_ACCESS_KEY && config.S3_SECRET_KEY) {
    return new S3ObjectStorage(config.S3_BUCKET, {
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      accessKey: config.S3_ACCESS_KEY,
      secretKey: config.S3_SECRET_KEY
    });
  }
  if (config.NODE_ENV === "production") {
    throw new Error("S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY are required in production");
  }
  return new LocalObjectStorage(config.STORAGE_DIR);
}

export const objectStorage: ObjectStorage = configuredStorage();
