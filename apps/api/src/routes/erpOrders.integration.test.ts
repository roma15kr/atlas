/** Products in deals from the BPI catalogue, and the deal's order created in BPI (only BPI, never twice). */
import { startDbHarness, type TestUser } from "../test/dbHarness";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let harness: Awaited<ReturnType<typeof startDbHarness>>;
let app: Express;
let babenko: TestUser, trubylo: TestUser, head: TestUser, boss: TestUser, stranger: TestUser;
let funnel: string, stage: string, client: string, trubyloClient: string;

const CATALOGUE = [
  { id: 1, name: "TXLP/2R 200W 1.2-1.5 м²", code: "000006669", codebox: "000007078", price: 5010, pricebox: 5181, number: 4 },
  { id: 2, name: "Терморегулятор «Тепло & Ко» <Pro>", code: "000001111", codebox: "", price: 1200, pricebox: 0, number: 10 }
];
const STAFF: Record<number, { id: number; name: string; user_type: string }> = {
  1: { id: 1, name: "Superadmin", user_type: "admin" }, 2: { id: 2, name: "Денисюк Наталія", user_type: "admin" },
  8: { id: 8, name: "Бабенко Станіслав", user_type: "manager" }, 30: { id: 30, name: "Клієнт ТОВ", user_type: "b2b" }
};
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let bpiDown = false;
const createdOrders: Array<{ id: number; comment: string }> = [];
let nextOrderId = 10452;
let timeoutAfterCreate = false;

const as = (who: TestUser) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`),
  post: (path: string, body: object = {}) => request(app).post(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  put: (path: string, body: object) => request(app).put(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body),
  patch: (path: string, body: object) => request(app).patch(`/api/v1${path}`).set("Authorization", `Bearer ${who.token}`).send(body)
});
const newDeal = async (owner = babenko, title = "Поставка «Тепла підлога ТОВ»") =>
  (await as(owner).post("/deals", { clientId: owner === trubylo ? trubyloClient : client, funnelId: funnel, stageId: stage, title, value: 20000, probability: 50 })).body.data.id as string;
const audits = async (action: string) => (await harness.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action = $1 ORDER BY created_at", [action])).rows;

beforeAll(async () => {
  harness = await startDbHarness();
  const { memoryPresenceStore, setPresenceStore } = await import("../presence");
  setPresenceStore(memoryPresenceStore());
  (await import("../catalogue/bpi")).setBpiTransport(async (method, path, body) => {
    calls.push({ method, path, body });
    if (bpiDown) throw new Error("connect ETIMEDOUT");
    if (path === "/prods/price") return { status: 200, body: CATALOGUE };
    const user = path.match(/^\/user-id\/(\d+)$/);
    if (user) return STAFF[Number(user[1])] ? { status: 200, body: { ...STAFF[Number(user[1])], email: "", phone: "" } } : { status: 200, body: { detail: "Not Found" } };
    if (path === "/add-order" && method === "POST") {
      const order = { id: nextOrderId++, comment: String((body as { comment: string }).comment) };
      createdOrders.push(order);
      if (timeoutAfterCreate) { timeoutAfterCreate = false; throw new Error("socket hang up"); }
      return { status: 200, body: { id: order.id, manager_id: 8 } };
    }
    if (path === "/last-order") return { status: 200, body: createdOrders.slice(-1) };
    if (path === "/orders/1/type/admin") return { status: 200, body: [...createdOrders].reverse() };
    return { status: 404, body: { detail: "Not Found" } };
  });
  app = (await import("../app")).app;
  babenko = await harness.user("babenko", "EMPLOYEE", "Отдел продаж", { consent: true });
  trubylo = await harness.user("trubylo", "EMPLOYEE", "Отдел продаж", { consent: true });
  head = await harness.user("denysiuk", "MANAGER", "Отдел продаж", { consent: true });
  boss = await harness.user("nikonov", "DIRECTOR", "Руководство", { consent: true });
  stranger = await harness.user("kosian", "EMPLOYEE", "Склад", { consent: true });
  await harness.query("UPDATE users SET full_name = 'Станіслав Бабенко' WHERE id = $1", [babenko.id]);
  await harness.query("UPDATE users SET full_name = 'Наталья Денисюк' WHERE id = $1", [head.id]);
  funnel = (await harness.query<{ id: string }>("INSERT INTO deal_funnels (company_id, name) VALUES ($1, 'Опт') RETURNING id", [harness.company])).rows[0]!.id;
  stage = (await harness.query<{ id: string }>("INSERT INTO deal_stages (company_id, funnel_id, name, color, sort_order, outcome) VALUES ($1, $2, 'Замовлення', '#2563EB', 10, 'OPEN') RETURNING id", [harness.company, funnel])).rows[0]!.id;
  client = (await harness.query<{ id: string }>(
    "INSERT INTO clients (company_id, department_id, owner_id, name, company_name, phone) VALUES ($1, $2, $3, 'Олег Тепленко', 'Тепла підлога & Ко', '+380501112233') RETURNING id",
    [harness.company, babenko.departmentId, babenko.id])).rows[0]!.id;
  trubyloClient = (await harness.query<{ id: string }>(
    "INSERT INTO clients (company_id, department_id, owner_id, name, company_name) VALUES ($1, $2, $3, 'Ірина Склад', 'Склад-Сервіс') RETURNING id",
    [harness.company, trubylo.departmentId, trubylo.id])).rows[0]!.id;
}, 60_000);

beforeEach(() => { calls.length = 0; bpiDown = false; timeoutAfterCreate = false; });
afterAll(async () => { await harness?.stop(); });

describe("products in deals", () => {
  it("adds catalogue products with server-side names, codes and prices, and the deal value follows", async () => {
    const deal = await newDeal();
    const saved = await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, quantity: 3 }, { bpiProductId: 2, quantity: 1 }] });
    expect(saved.status).toBe(200);
    expect(saved.body.data.lines).toEqual([
      expect.objectContaining({ name: "TXLP/2R 200W 1.2-1.5 м²", code: "000006669", quantity: 3, unitPrice: 5010, lineTotal: 15030 }),
      expect.objectContaining({ code: "000001111", unitPrice: 1200, lineTotal: 1200 })
    ]);
    expect(saved.body.data.value).toBe(16230);
    expect((await as(babenko).get(`/deals/${deal}`)).body.data).toMatchObject({ value: 16230, productCount: 2 });
    expect((await as(babenko).patch(`/deals/${deal}`, { value: 1 })).body.error.code).toBe("DEAL_VALUE_FROM_PRODUCTS");
    expect((await audits("DEAL_PRODUCTS_UPDATED")).at(-1)!.metadata).toEqual({ lines: 2 });
  });

  it("uses the box code and price for a box line, with a discount, and refuses decimals and unknown products", async () => {
    const deal = await newDeal();
    const saved = await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, byBox: true, quantity: 2, discountPercent: 10 }] });
    expect(saved.body.data.lines[0]).toMatchObject({ code: "000007078", byBox: true, cataloguePrice: 5181, unitPrice: 4662.9, lineTotal: 9325.8 });
    expect((await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, quantity: 1.5 }] })).status).toBe(400);
    expect((await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 999, quantity: 1 }] })).body.error.code).toBe("CATALOGUE_PRODUCT_NOT_FOUND");
  });

  it("answers 404 outside the deal's scope", async () => {
    const deal = await newDeal();
    expect((await as(stranger).get(`/deals/${deal}/products`)).status).toBe(404);
    expect((await as(trubylo).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, quantity: 1 }] })).status).toBe(404);
    expect((await as(stranger).post(`/deals/${deal}/orders`)).status).toBe(404);
  });

  it("searches the catalogue by name or code", async () => {
    expect((await as(trubylo).get("/catalogue/products?query=txlp 200")).body.data.map((item: { id: number }) => item.id)).toEqual([1]);
    expect((await as(trubylo).get("/catalogue/products?query=000001111")).body.data.map((item: { id: number }) => item.id)).toEqual([2]);
  });
});

describe("orders in BPI", () => {
  it("creates the order with the client, the lines and the sender as manager, makes one BPI order call, and locks the deal", async () => {
    const deal = await newDeal();
    await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, quantity: 3 }, { bpiProductId: 1, byBox: true, quantity: 1, discountPercent: 10 }] });
    calls.length = 0;
    const created = await as(babenko).post(`/deals/${deal}/orders`);
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({ status: "SENT", bpiOrderId: expect.any(Number) });
    const orderCalls = calls.filter((call) => call.method === "POST");
    expect(orderCalls).toHaveLength(1);
    expect(orderCalls[0]!.path).toBe("/add-order");
    expect(orderCalls[0]!.body).toMatchObject({
      user_id: 8, manager_id: 8, organization: "Тепла підлога & Ко", name: "Олег Тепленко", phone: "+380501112233",
      payment_status: "Не оплачено", execution_status: "Нове замовлення", sum_total: 19693,
      goods: [{ id: 1, art: "000006669", number: 3, price: 5010, box: false }, { id: 1, art: "000007078", number: 1, price: 4663, box: true }].map((item) => expect.objectContaining(item)),
      date: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/), comment: expect.stringContaining("atlas:")
    });
    expect((await as(babenko).get(`/deals/${deal}`)).body.data.productsLocked).toBe(true);
    expect((await as(babenko).put(`/deals/${deal}/products`, { lines: [] })).body.error.code).toBe("DEAL_ORDER_LOCKED");
    expect((await audits("DEAL_ORDER_SENT")).at(-1)!.metadata).toMatchObject({ bpiOrderId: created.body.data.bpiOrderId });
  });

  it("matches a manager written the Russian way to their BPI staff account", async () => {
    const deal = await newDeal(head, "Угода керівника");
    await as(head).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 2, quantity: 1 }] });
    const created = await as(head).post(`/deals/${deal}/orders`);
    expect(created.status).toBe(200);
    expect(calls.find((call) => call.path === "/add-order")!.body).toMatchObject({ manager_id: 2 });
    expect((await harness.query("SELECT bpi_manager_id, bpi_manager_source FROM users WHERE id = $1", [head.id])).rows[0]).toEqual({ bpi_manager_id: 2, bpi_manager_source: "AUTO" });
  });

  it("refuses without products, and without a BPI manager", async () => {
    const empty = await newDeal();
    expect((await as(babenko).post(`/deals/${empty}/orders`)).body.error.code).toBe("DEAL_PRODUCTS_REQUIRED");
    const deal = await newDeal(trubylo, "Без менеджера");
    await as(trubylo).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 2, quantity: 1 }] });
    const refused = await as(trubylo).post(`/deals/${deal}/orders`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("BPI_MANAGER_REQUIRED");
    expect(calls.some((call) => call.path === "/add-order")).toBe(false);
    expect((await audits("DEAL_ORDER_DENIED")).length).toBeGreaterThanOrEqual(2);
  });

  it("lets a director link an employee to a BPI manager, and keeps that over the name match", async () => {
    expect((await as(head).get("/bpi-managers")).status).toBe(403);
    const overview = (await as(boss).get("/bpi-managers")).body.data;
    expect(overview.staff.map((member: { name: string }) => member.name)).toEqual(["Денисюк Наталія", "Бабенко Станіслав"]);
    expect(overview.links.find((link: { userId: string }) => link.userId === babenko.id)).toMatchObject({ bpiManagerId: 8, source: "AUTO" });
    expect((await as(boss).put(`/bpi-managers/${trubylo.id}`, { bpiManagerId: 8 })).body.data).toMatchObject({ bpiManagerId: 8, source: "DIRECTOR" });
    const deal = await newDeal(trubylo, "Тепер з менеджером");
    await as(trubylo).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 2, quantity: 1 }] });
    expect((await as(trubylo).post(`/deals/${deal}/orders`)).status).toBe(200);
  });

  it("queues the order when BPI is down and creates it once later", async () => {
    const deal = await newDeal();
    await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 2, quantity: 2 }] });
    bpiDown = true;
    const queued = await as(babenko).post(`/deals/${deal}/orders`);
    expect(queued.status).toBe(202);
    expect(queued.body.data.status).toBe("CREATING");
    bpiDown = false;
    const before = createdOrders.length;
    await harness.query("UPDATE deal_orders SET next_attempt_at = now() WHERE deal_id = $1", [deal]);
    const { retryDealOrders } = await import("../erp/orders");
    expect(await retryDealOrders()).toEqual({ sent: 1, failed: 0 });
    expect(createdOrders.length).toBe(before + 1);
    expect((await as(babenko).get(`/deals/${deal}/orders`)).body.data[0]).toMatchObject({ status: "SENT", bpiOrderId: expect.any(Number) });
  });

  it("adopts the order a timed-out call already created instead of creating a second one", async () => {
    const deal = await newDeal();
    await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 2, quantity: 1 }] });
    timeoutAfterCreate = true;
    expect((await as(babenko).post(`/deals/${deal}/orders`)).status).toBe(202);
    const before = createdOrders.length;
    const adopted = createdOrders.at(-1)!.id;
    await harness.query("UPDATE deal_orders SET next_attempt_at = now() WHERE deal_id = $1", [deal]);
    const { retryDealOrders } = await import("../erp/orders");
    await retryDealOrders();
    expect(createdOrders.length).toBe(before);
    expect((await as(babenko).get(`/deals/${deal}/orders`)).body.data[0]).toMatchObject({ status: "SENT", bpiOrderId: adopted });
  });

  it("marks it failed after 24 hours and notifies the sender; «Спробувати ще» tries again", async () => {
    const deal = await newDeal();
    await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 2, quantity: 1 }] });
    bpiDown = true;
    await as(babenko).post(`/deals/${deal}/orders`);
    await harness.query("UPDATE deal_orders SET created_at = now() - interval '25 hours', next_attempt_at = now() WHERE deal_id = $1", [deal]);
    const { retryDealOrders } = await import("../erp/orders");
    expect((await retryDealOrders()).failed).toBe(1);
    const inbox = (await as(babenko).get("/notifications")).body.data as Array<{ kind: string; title: string; link: string }>;
    expect(inbox[0]).toMatchObject({ kind: "DEAL_ORDER_FAILED", title: "Замовлення не створено в BPI", link: `/sales?deal=${deal}` });
    bpiDown = false;
    const order = (await as(babenko).get(`/deals/${deal}/orders`)).body.data[0];
    expect(order.status).toBe("FAILED");
    expect((await as(babenko).post(`/deals/${deal}/orders/${order.id}/retry`)).body.data).toMatchObject({ status: "SENT" });
  });

  it("unlocks and creates a new order that names the one it replaces", async () => {
    const deal = await newDeal();
    await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, quantity: 1 }] });
    const first = (await as(babenko).post(`/deals/${deal}/orders`)).body.data.bpiOrderId as number;
    expect((await as(babenko).post(`/deals/${deal}/orders/unlock`)).body.data).toEqual({ locked: false });
    await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, quantity: 2 }] });
    const second = await as(babenko).post(`/deals/${deal}/orders`);
    expect(second.body.data).toMatchObject({ replacesOrderId: first, status: "SENT" });
    expect(String((calls.filter((call) => call.path === "/add-order").at(-1)!.body as { comment: string }).comment)).toContain(`замінює № ${first}`);
    expect((await as(babenko).get(`/deals/${deal}/orders`)).body.data.map((item: { bpiOrderId: number }) => item.bpiOrderId)).toEqual([second.body.data.bpiOrderId, first]);
  });

  it("says when the catalogue is unavailable, and keeps the deal's lines", async () => {
    const { setBpiTransport } = await import("../catalogue/bpi");
    const deal = await newDeal();
    await as(babenko).put(`/deals/${deal}/products`, { lines: [{ bpiProductId: 1, quantity: 1 }] });
    const original = vi.fn(async () => { throw new Error("down"); });
    setBpiTransport(original);
    const search = await as(babenko).get("/catalogue/products?query=txlp");
    expect(search.status).toBe(503);
    expect(search.body.error.code).toBe("CATALOGUE_UNAVAILABLE");
    expect((await as(babenko).get(`/deals/${deal}/products`)).body.data.lines).toHaveLength(1);
  });
});
