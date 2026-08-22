import { NextResponse } from "next/server";
import { HttpError } from "./auth";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Wraps a route handler so thrown errors become clean JSON responses. */
export function handler<T extends (...args: any[]) => Promise<Response>>(fn: T): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (err: any) {
      if (err instanceof HttpError) return fail(err.message, err.status);
      if (err instanceof ZodError) {
        const first = err.errors[0];
        return fail(`${first.path.join(".") || "Field"}: ${first.message}`, 422, { issues: err.errors });
      }
      if (err?.code === 11000) return fail("That record already exists.", 409);

      // MongoDB's BSON limit is 16 MB. Give the browser a useful message
      // instead of hiding a large-document failure behind a random ref code.
      if (err?.code === 10334 || /BSONObj size|document is larger than the maximum/i.test(String(err?.message || ""))) {
        return fail("That file or record is too large for the database. Use a smaller resume (3 MB or less) and try again.", 413);
      }

      if (/request body.*too large|body.*exceed.*limit|FUNCTION_PAYLOAD_TOO_LARGE/i.test(String(err?.message || ""))) {
        return fail("That upload is too large for this serverless deployment. Please use a smaller resume and try again.", 413);
      }

      // Mongoose shape failures are the caller's problem, not a server fault —
      // report the offending field instead of a blank 500.
      if (err?.name === "ValidationError" || err?.name === "CastError") {
        const path = err.errors ? Object.keys(err.errors)[0] : err.path;
        return fail(`"${String(path ?? "field").split(".")[0]}" wasn't in the expected format.`, 422);
      }

      // Anything genuinely unexpected: log it with a reference the user can
      // quote, so a production 500 is traceable in the Vercel logs.
      const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
      console.error(`[api:${ref}]`, err);
      return fail(`Something went wrong on our end (ref ${ref}). Try again.`, 500, { ref });
    }
  }) as T;
}

export const cors = () =>
  new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
