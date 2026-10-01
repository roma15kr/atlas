declare module "hoodiecrow-imap" {
  import type { Server } from "node:net";
  function hoodiecrow(options: Record<string, unknown>): Server;
  export = hoodiecrow;
}
