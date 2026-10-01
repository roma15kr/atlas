/**
 * Real servers for mail integration tests: an in-process Postgres (PGlite) with the real
 * migrations, an in-memory IMAP server (hoodiecrow) and an SMTP server that records deliveries.
 * Import this module before anything that reads the config.
 */
import { mkdtempSync } from "node:fs";
import type { AddressInfo, Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const port = 50000 + Math.floor(Math.random() * 12000);
Object.assign(process.env, {
  POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: String(port), POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres", POSTGRES_DB: "postgres",
  MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), MAIL_SCHEDULER: "off", SEED_DEMO_DATA: "false",
  STORAGE_DIR: mkdtempSync(path.join(tmpdir(), "atlas-mail-")), PUBLIC_URL: "http://localhost:8080"
});

export interface Delivery { to: string[]; raw: string }

/** RFC 822 text with UTF-8 headers and a base64 body, as real mail clients send it. */
export const rawMessage = (headers: Record<string, string>, body: string): string =>
  Object.entries({ "Content-Type": "text/plain; charset=utf-8", Date: new Date().toUTCString(), ...headers, "Content-Transfer-Encoding": "base64" })
    .map(([key, value]) => `${key}: ${/[^\x00-\x7f]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=` : value}`).join("\r\n")
  + "\r\n\r\n" + Buffer.from(body).toString("base64");

export async function startMailHarness(inbox: string[] = []) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const hoodiecrow = (await import("hoodiecrow-imap")).default;
  const { SMTPServer } = await import("smtp-server");

  const db = await PGlite.create({ extensions: { pgcrypto } });
  const pg = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 50 });
  await pg.start();
  const { runMigrations } = await import("../migrations");
  await runMigrations(path.resolve(__dirname, "../../../../database"));

  const imapPort = port + 1;
  const imap: Server = hoodiecrow({
    plugins: ["ID", "SASL-IR", "AUTH-PLAIN", "NAMESPACE", "ENABLE", "CONDSTORE", "LITERALPLUS", "UNSELECT", "SPECIAL-USE", "UIDPLUS", "MOVE"],
    users: { anna: { password: "app-pass" } },
    storage: {
      INBOX: { messages: inbox.map((raw) => ({ raw, flags: [] })) },
      "": { separator: "/", folders: { Sent: { "special-use": "\\Sent" }, Archive: { "special-use": "\\Archive" }, Trash: { "special-use": "\\Trash" }, Junk: { "special-use": "\\Junk" } } }
    }
  });
  await new Promise<void>((resolve) => imap.listen(imapPort, "127.0.0.1", () => resolve()));

  const delivered: Delivery[] = [];
  const smtp = new SMTPServer({
    authOptional: false, disabledCommands: ["STARTTLS"],
    onAuth: (auth, _session, callback) => auth.username === "anna" && auth.password === "app-pass" ? callback(null, { user: "anna" }) : callback(new Error("Invalid credentials")),
    onData: (stream, session, callback) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => { delivered.push({ to: session.envelope.rcptTo.map((item) => item.address), raw: Buffer.concat(chunks).toString() }); callback(); });
    }
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", () => resolve()));
  const smtpPort = (smtp.server.address() as AddressInfo).port;

  const { setTransportOverrides } = await import("../mail/transport");
  setTransportOverrides({
    imap: () => ({ host: "127.0.0.1", port: imapPort, secure: false, doSTARTTLS: false }),
    smtp: () => ({ host: "127.0.0.1", port: smtpPort, secure: false, ignoreTLS: true })
  });
  const { query, pool } = await import("../db");

  return {
    query, imapPort, delivered,
    async serverClient() {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({ host: "127.0.0.1", port: imapPort, secure: false, doSTARTTLS: false, auth: { user: "anna", pass: "app-pass" }, logger: false });
      await client.connect();
      return client;
    },
    async stop() {
      await pool.end();
      imap.close();
      smtp.close();
      await pg.stop();
    }
  };
}
