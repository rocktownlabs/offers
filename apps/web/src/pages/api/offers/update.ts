import type { APIRoute } from "astro";
import { z } from "zod";

import { hasValidAgentSecret } from "../../../lib/agent-secret";
import { json, parseJson } from "../../../lib/http";
import { findOfferBySlug, updateOffer } from "../../../lib/offers";
import { getDb } from "../../../services";
import { env } from "../../../env.server";

const secureUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:");

const updateOfferSchema = z.object({
  demoUrl: secureUrl,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
});

const getBearerSecret = (request: Request) => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const secret = authorization.slice("Bearer ".length).trim();
  return secret || null;
};

export const POST: APIRoute = async ({ request }) => {
  if (
    !(await hasValidAgentSecret(
      getDb(),
      getBearerSecret(request),
      env.OFFERS_API_SECRET
    ))
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const input = updateOfferSchema.safeParse(await parseJson(request));
  if (!input.success) {
    return json({ error: "Invalid offer data" }, 400);
  }

  const found = await findOfferBySlug(getDb(), input.data.slug);
  if (!found) {
    return json({ error: "Offer not found" }, 404);
  }

  const updated = await updateOffer(getDb(), found.id, {
    demoUrl: input.data.demoUrl,
    updatedAt: new Date(),
  });

  if (!updated) {
    return json({ error: "Offer update failed" }, 500);
  }

  return json({
    ok: true,
    url: new URL(`/${updated.slug}`, env.OFFERS_BASE_URL).toString(),
  });
};
