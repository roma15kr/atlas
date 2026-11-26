/**
 * b2b.rdim.ua's back office (BPI): the product catalogue, staff accounts and order creation. BPI takes no credentials,
 * exactly as b2b uses it. The transport is replaceable in tests.
 */
import { config } from "../config";
import { ApiError } from "../errors";

export interface CatalogueProduct { id: number; name: string; code: string; codebox: string; price: number; pricebox: number; stock: number }
export interface BpiUser { id: number; name: string; user_type: string }
export interface BpiOrder { id: number; comment?: string | null }

export type BpiTransport = (method: "GET" | "POST", path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;

let transport: BpiTransport = async (method, path, body) => {
  const response = await fetch(`${config.BPI_URL.replace(/\/$/, "")}${path}`, {
    method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(method === "GET" ? 10_000 : 20_000)
  });
  const text = await response.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
};
export function setBpiTransport(next: BpiTransport): void { transport = next; catalogueCache = null; }

async function bpiGet<T>(path: string): Promise<T> {
  const result = await transport("GET", path);
  if (result.status < 200 || result.status >= 300) throw new Error(`BPI ${path} answered ${result.status}`);
  return result.body as T;
}

const CATALOGUE_TTL_MS = 60 * 60 * 1000;
let catalogueCache: { at: number; products: CatalogueProduct[] } | null = null;

interface RawProduct { id: number; name: string; code: string; codebox: string; price: number; pricebox: number; number: number }

/** The catalogue, cached for an hour; when BPI fails, the last good copy is served. */
export async function fetchCatalogue(): Promise<CatalogueProduct[]> {
  if (catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_TTL_MS) return catalogueCache.products;
  try {
    const raw = await bpiGet<RawProduct[]>("/prods/price");
    if (!Array.isArray(raw)) throw new Error("BPI catalogue is not a list");
    const products = raw.filter((item) => Number.isInteger(item?.id) && typeof item.name === "string").map((item) => ({
      id: item.id, name: item.name.trim(), code: String(item.code ?? ""), codebox: String(item.codebox ?? ""),
      price: Number(item.price) || 0, pricebox: Number(item.pricebox) || 0, stock: Number(item.number) || 0
    }));
    catalogueCache = { at: Date.now(), products };
    return products;
  } catch (error) {
    if (catalogueCache) return catalogueCache.products;
    console.error("BPI catalogue unavailable", (error as Error).message);
    throw new ApiError(503, "CATALOGUE_UNAVAILABLE", "The product catalogue is temporarily unavailable");
  }
}

const fold = (value: string) => value.toLowerCase().replace(/ё/g, "е").replace(/[\s\-_/.,]+/g, " ").trim();

/** Products whose name or 1C code contains every word of the query. */
export async function searchCatalogue(query: string, limit = 20): Promise<CatalogueProduct[]> {
  const words = fold(query).split(" ").filter(Boolean);
  const products = await fetchCatalogue();
  if (!words.length) return products.slice(0, limit);
  return products.filter((product) => {
    const haystack = fold(`${product.name} ${product.code} ${product.codebox}`);
    return words.every((word) => haystack.includes(word));
  }).slice(0, limit);
}

export async function catalogueProduct(id: number): Promise<CatalogueProduct | undefined> {
  return (await fetchCatalogue()).find((product) => product.id === id);
}

export async function bpiUser(id: number): Promise<BpiUser | null> {
  try {
    const user = await bpiGet<BpiUser | { detail?: string }>(`/user-id/${id}`);
    return user && typeof user === "object" && "id" in user && typeof user.name === "string" ? user as BpiUser : null;
  } catch { return null; }
}

/** Creates an order like b2b's checkout does; answers BPI's order number, or throws when BPI doesn't confirm one. */
export async function createBpiOrder(body: Record<string, unknown>): Promise<number> {
  const result = await transport("POST", "/add-order", body);
  const id = Number((result.body as { id?: unknown } | null)?.id);
  if (result.status < 200 || result.status >= 300 || !Number.isInteger(id) || id <= 0) {
    throw new Error(`BPI add-order answered ${result.status}`);
  }
  return id;
}

/** The newest orders with their comments, to find one a timed-out call already created. */
export async function recentBpiOrders(): Promise<BpiOrder[]> {
  const latest = await bpiGet<BpiOrder[]>("/last-order").catch(() => []);
  const all = await bpiGet<BpiOrder[]>("/orders/1/type/admin").catch(() => []);
  return [...(Array.isArray(latest) ? latest : []), ...(Array.isArray(all) ? all.slice(0, 200) : [])];
}
