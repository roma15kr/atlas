import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config";
import { ApiError } from "../errors";

export const IMAP_PORTS = [993, 143] as const;
export const SMTP_PORTS = [465, 587, 25] as const;

/** Loopback, private, link-local, CGNAT, multicast, unspecified and metadata ranges, IPv4 and IPv6. */
export function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(mapped) === 4) {
    const [a, b] = mapped.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const value = mapped.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8")
    || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || value.startsWith("ff");
}

export interface ResolvedHost { host: string; address: string; port: number }

/**
 * Resolves a user-supplied mail host and refuses private destinations and non-mail ports, so the
 * connection test can't be used to probe the internal network. Callers connect to `address` with
 * SNI set to `host`, which also defeats DNS rebinding between this check and the connection.
 */
export async function resolveMailHost(host: string, port: number, kind: "IMAP" | "SMTP", allowPrivate = config.MAIL_ALLOW_PRIVATE_HOSTS === "true"): Promise<ResolvedHost> {
  const ports: readonly number[] = kind === "IMAP" ? IMAP_PORTS : SMTP_PORTS;
  if (!ports.includes(port)) throw new ApiError(400, "MAIL_PORT_NOT_ALLOWED", `Port ${port} is not a standard ${kind} port`);
  const name = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(name) && !isIP(name)) throw new ApiError(400, "MAIL_HOST_NOT_ALLOWED", "Invalid mail server host");
  let address: string;
  try {
    address = isIP(name) ? name : (await lookup(name)).address;
  } catch {
    throw new ApiError(400, "MAIL_CONNECTION_FAILED", "Mail server host not found", { reason: "HOST_NOT_FOUND", kind });
  }
  if (!allowPrivate && isPrivateAddress(address)) throw new ApiError(400, "MAIL_HOST_NOT_ALLOWED", "Mail server address is not allowed");
  return { host: name, address, port };
}
