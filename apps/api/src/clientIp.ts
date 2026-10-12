import type { NextFunction, Request, Response } from "express";
import { BlockList, isIP } from "node:net";

/** Cloudflare's published edge ranges (https://www.cloudflare.com/ips-v4 and /ips-v6, 2026-10-12). */
const CLOUDFLARE_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14",
  "172.64.0.0/13", "131.0.72.0/22"];
const CLOUDFLARE_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

const cloudflare = new BlockList();
for (const range of CLOUDFLARE_V4) { const [net, bits] = range.split("/"); cloudflare.addSubnet(net!, Number(bits), "ipv4"); }
for (const range of CLOUDFLARE_V6) { const [net, bits] = range.split("/"); cloudflare.addSubnet(net!, Number(bits), "ipv6"); }

const plain = (ip: string) => ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");

export function isCloudflareAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const address = plain(ip);
  const version = isIP(address);
  return version !== 0 && cloudflare.check(address, version === 4 ? "ipv4" : "ipv6");
}

/**
 * The visitor's address behind Cloudflare: `CF-Connecting-IP`, trusted only when the request itself came from a
 * Cloudflare edge address. Anyone reaching the server directly can't spoof it, because their own address is used.
 */
export function cloudflareVisitorIp(req: Pick<Request, "ip" | "header">): string | null {
  if (!isCloudflareAddress(req.ip)) return null;
  const header = req.header("cf-connecting-ip")?.trim();
  return header && isIP(header) ? header : null;
}

/** Makes `req.ip` the visitor's address for rate limits and the audit log when the request came through Cloudflare. */
export function useCloudflareVisitorIp(req: Request, _res: Response, next: NextFunction): void {
  const visitor = cloudflareVisitorIp(req);
  if (visitor) Object.defineProperty(req, "ip", { value: visitor, configurable: true, enumerable: true });
  next();
}
