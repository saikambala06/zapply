import { clearSessionCookie } from "@/lib/auth";
import { ok, handler } from "@/lib/api";

export const POST = handler(async () => {
  clearSessionCookie();
  return ok({ signedOut: true });
});
