import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { cloudflareVisitorIp, isCloudflareAddress, useCloudflareVisitorIp } from "./clientIp";

const req = (ip: string | undefined, header?: string) => ({ ip, header: (name: string) => name.toLowerCase() === "cf-connecting-ip" ? header : undefined });

describe("visitor address behind Cloudflare", () => {
  it("recognises Cloudflare edge addresses, IPv4 and IPv6", () => {
    expect(isCloudflareAddress("162.158.103.147")).toBe(true);
    expect(isCloudflareAddress("::ffff:172.64.200.155")).toBe(true);
    expect(isCloudflareAddress("2a06:98c1:3120::1")).toBe(true);
    expect(isCloudflareAddress("141.94.30.173")).toBe(false);
    expect(isCloudflareAddress("10.0.1.5")).toBe(false);
    expect(isCloudflareAddress(undefined)).toBe(false);
  });

  it("uses CF-Connecting-IP only for requests that came from Cloudflare", () => {
    expect(cloudflareVisitorIp(req("162.158.103.147", "93.72.10.4"))).toBe("93.72.10.4");
    expect(cloudflareVisitorIp(req("172.64.198.9", "2a02:2378:1000::7"))).toBe("2a02:2378:1000::7");
    // Someone reaching the server directly can't pick an address for the rate limits.
    expect(cloudflareVisitorIp(req("93.72.10.4", "1.2.3.4"))).toBeNull();
    expect(cloudflareVisitorIp(req("162.158.103.147", "not-an-ip"))).toBeNull();
    expect(cloudflareVisitorIp(req("162.158.103.147"))).toBeNull();
  });

  it("sets req.ip for the rest of the request, as the limiters and audit see it", async () => {
    const app = express();
    app.set("trust proxy", 2);
    app.use(useCloudflareVisitorIp);
    app.get("/ip", (request, response) => { response.json({ ip: request.ip }); });
    const viaCloudflare = await request(app).get("/ip").set("X-Forwarded-For", "162.158.103.147, 10.0.1.2").set("CF-Connecting-IP", "93.72.10.4");
    expect(viaCloudflare.body.ip).toBe("93.72.10.4");
    const direct = await request(app).get("/ip").set("X-Forwarded-For", "93.72.10.4, 10.0.1.2").set("CF-Connecting-IP", "1.2.3.4");
    expect(direct.body.ip).toBe("93.72.10.4");
  });
});
