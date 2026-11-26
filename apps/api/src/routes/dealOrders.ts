import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { bpiManagerOf, bpiStaff, matchStaff } from "../catalogue/bpiManagers";
import { catalogueProduct, searchCatalogue } from "../catalogue/bpi";
import { query, transaction } from "../db";
import { createDealOrder, ORDER_COLUMNS, orderView, retryFailedOrder } from "../erp/orders";
import { ApiError, asyncHandler } from "../errors";
import { scopedDeal } from "./deals";

const idSchema = z.string().uuid();

/** The b2b catalogue, for every signed-in user. */
export const catalogueRouter = Router();
catalogueRouter.get("/products", asyncHandler(async (req, res) => {
  requireAuth(req);
  const input = z.object({ query: z.string().max(100).default(""), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
  res.json({ data: await searchCatalogue(input.query, input.limit) });
}));

interface LineRow { id: string; bpiProductId: number; name: string; code: string; byBox: boolean; quantity: number; cataloguePrice: number; unitPrice: number; lineTotal: number }
const LINE_COLUMNS = `id, bpi_product_id AS "bpiProductId", name, code, by_box AS "byBox", quantity, catalogue_price::float8 AS "cataloguePrice",
  unit_price::float8 AS "unitPrice", (unit_price * quantity)::float8 AS "lineTotal"`;
const linesOf = async (dealId: string) => (await query<LineRow>(`SELECT ${LINE_COLUMNS} FROM deal_products WHERE deal_id = $1 ORDER BY position`, [dealId])).rows;

/**
 * Products and orders of a deal. Anyone who can see a deal (its scope: own deals, a manager's departments, a director
 * all) may change its products and create its order; outside the scope the deal answers 404.
 */
export const dealOrdersRouter = Router();

dealOrdersRouter.get("/:id/products", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const deal = await scopedDeal(auth, id) as { productsLocked: boolean; value: number };
  res.json({ data: { lines: await linesOf(id), locked: deal.productsLocked, value: deal.value } });
}));

const lineInput = z.object({
  bpiProductId: z.number().int().positive(),
  byBox: z.boolean().default(false),
  quantity: z.number().int().min(1).max(100_000),
  unitPrice: z.number().min(0).max(1_000_000_000).optional(),
  discountPercent: z.number().min(0).max(100).optional()
}).strict();

dealOrdersRouter.put("/:id/products", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const deal = await scopedDeal(auth, id) as { productsLocked: boolean };
  if (deal.productsLocked) throw new ApiError(409, "DEAL_ORDER_LOCKED", "The order is created; unlock it to change the products");
  const { lines } = z.object({ lines: z.array(lineInput).max(100) }).strict().parse(req.body);
  // Names, codes and catalogue prices always come from the catalogue, never from the client.
  const resolved: Array<z.infer<typeof lineInput> & { name: string; code: string; cataloguePrice: number; unitPrice: number }> = [];
  for (const line of lines) {
    const product = await catalogueProduct(line.bpiProductId);
    if (!product) throw new ApiError(400, "CATALOGUE_PRODUCT_NOT_FOUND", "A product is no longer in the catalogue");
    const cataloguePrice = line.byBox ? product.pricebox || product.price : product.price;
    const unitPrice = line.unitPrice ?? cataloguePrice * (1 - (line.discountPercent ?? 0) / 100);
    resolved.push({ ...line, name: product.name, code: line.byBox ? product.codebox || product.code : product.code, cataloguePrice, unitPrice: Math.round(unitPrice * 100) / 100 });
  }
  await transaction(async (client) => {
    await client.query("DELETE FROM deal_products WHERE deal_id = $1", [id]);
    for (const [position, line] of resolved.entries()) {
      await client.query(
        `INSERT INTO deal_products (deal_id, position, bpi_product_id, name, code, by_box, quantity, catalogue_price, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, position, line.bpiProductId, line.name, line.code, line.byBox, line.quantity, line.cataloguePrice, line.unitPrice]);
    }
    // With products the amount is their sum; without them the amount stays as it was and is editable again.
    if (resolved.length) await client.query("UPDATE deals SET value = (SELECT COALESCE(sum(unit_price * quantity), 0) FROM deal_products WHERE deal_id = $1), updated_at = now() WHERE id = $1", [id]);
  });
  await writeAudit(req, { auth, action: "DEAL_PRODUCTS_UPDATED", entityType: "deal", entityId: id, metadata: { lines: resolved.length } });
  const updated = await scopedDeal(auth, id) as { productsLocked: boolean; value: number };
  res.json({ data: { lines: await linesOf(id), locked: updated.productsLocked, value: updated.value } });
}));

dealOrdersRouter.get("/:id/orders", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedDeal(auth, id);
  const orders = await query(`SELECT ${ORDER_COLUMNS} FROM deal_orders o LEFT JOIN users u ON u.id = o.sent_by WHERE o.deal_id = $1 ORDER BY o.created_at DESC`, [id]);
  res.json({ data: orders.rows });
}));

dealOrdersRouter.post("/:id/orders", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedDeal(auth, id);
  const result = await createDealOrder(req, auth, id);
  res.status(result.status).json({ data: result.order });
}));

dealOrdersRouter.post("/:id/orders/unlock", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  await scopedDeal(auth, id);
  const pending = await query("SELECT 1 FROM deal_orders WHERE deal_id = $1 AND status = 'CREATING'", [id]);
  if (pending.rowCount) throw new ApiError(409, "DEAL_ORDER_PENDING", "The order is still being created in BPI");
  await query("UPDATE deals SET products_locked = false WHERE id = $1", [id]);
  await writeAudit(req, { auth, action: "DEAL_ORDER_UNLOCKED", entityType: "deal", entityId: id });
  res.json({ data: { locked: false } });
}));

dealOrdersRouter.post("/:id/orders/:orderId/retry", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const id = idSchema.parse(req.params.id);
  const orderId = idSchema.parse(req.params.orderId);
  await scopedDeal(auth, id);
  const exists = await query("SELECT 1 FROM deal_orders WHERE id = $1 AND deal_id = $2 AND status = 'FAILED'", [orderId, id]);
  if (!exists.rowCount) throw new ApiError(404, "DEAL_ORDER_NOT_FOUND", "Order not found");
  const outcome = await retryFailedOrder(orderId);
  await writeAudit(req, { auth, action: "DEAL_ORDER_RETRIED", entityType: "deal", entityId: id, metadata: { orderId } });
  res.status(outcome === "SENT" ? 200 : 202).json({ data: await orderView(orderId) });
}));

/** BPI staff and who in the team is linked to whom: directors see and correct the matches. */
export const bpiManagersRouter = Router();

bpiManagersRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role !== "DIRECTOR") throw new ApiError(403, "DIRECTOR_ONLY", "Only a director manages BPI links");
  const staff = await bpiStaff(req.query.refresh === "true");
  const users = await query<{ id: string; full_name: string; bpi_manager_id: number | null; bpi_manager_source: string | null }>(
    "SELECT id, full_name, bpi_manager_id, bpi_manager_source FROM users WHERE company_id = $1 AND status = 'ACTIVE' ORDER BY full_name", [auth.companyId]);
  res.json({ data: {
    staff: staff.map((member) => ({ id: member.id, name: member.name })),
    links: users.rows.map((user) => ({
      userId: user.id, fullName: user.full_name,
      bpiManagerId: user.bpi_manager_source === "DIRECTOR" ? user.bpi_manager_id : matchStaff(user.full_name, staff)?.id ?? null,
      source: user.bpi_manager_source === "DIRECTOR" ? "DIRECTOR" : "AUTO"
    }))
  } });
}));

/** A director links an employee to a BPI manager (or, with null, goes back to the automatic match). */
bpiManagersRouter.put("/:userId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const userId = idSchema.parse(req.params.userId);
  if (auth.role !== "DIRECTOR") {
    await writeAudit(req, { auth, action: "BPI_MANAGER_LINK_DENIED", entityType: "user", entityId: userId });
    throw new ApiError(403, "DIRECTOR_ONLY", "Only a director manages BPI links");
  }
  const { bpiManagerId } = z.object({ bpiManagerId: z.number().int().positive().nullable() }).strict().parse(req.body);
  const updated = await query(
    "UPDATE users SET bpi_manager_id = $3, bpi_manager_source = CASE WHEN $3::int IS NULL THEN NULL ELSE 'DIRECTOR' END WHERE id = $1 AND company_id = $2",
    [userId, auth.companyId, bpiManagerId]);
  if (!updated.rowCount) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  await writeAudit(req, { auth, action: "BPI_MANAGER_LINKED", entityType: "user", entityId: userId, metadata: { bpiManagerId } });
  res.json({ data: { userId, bpiManagerId: bpiManagerId ?? await bpiManagerOf(userId), source: bpiManagerId ? "DIRECTOR" : "AUTO" } });
}));
