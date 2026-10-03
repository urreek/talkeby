import { SUPPORTED_PROVIDERS } from "../providers/catalog.mjs";
import { createSubscriptionUsageService } from "../services/subscription-usage.mjs";

const nullable = (type) => ({ type: [type, "null"] });
const windowSchema = {
  type: ["object", "null"], additionalProperties: false,
  properties: { remainingPercent: nullable("number"), windowDurationMins: nullable("number"), resetsAt: nullable("string") },
};

export function registerSubscriptionRoutes(app, config, service = createSubscriptionUsageService({ config })) {
  app.get("/api/subscription-usage", {
    schema: {
      querystring: {
        type: "object", additionalProperties: false, required: ["provider"],
        properties: { provider: { type: "string", enum: SUPPORTED_PROVIDERS }, refresh: { type: "boolean", default: false } },
      },
      response: {
        200: {
          type: "object", additionalProperties: false, required: ["provider", "status", "checkedAt", "message", "limits"],
          properties: {
            provider: { type: "string", enum: SUPPORTED_PROVIDERS }, status: { type: "string", enum: ["available", "unavailable", "unsupported"] },
            checkedAt: nullable("string"), message: { type: "string" },
            limits: { type: "array", items: {
              type: "object", additionalProperties: false,
              properties: { name: { type: "string" }, plan: nullable("string"), primary: windowSchema, secondary: windowSchema },
            } },
          },
        },
      },
    },
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return service.get(request.query.provider, request.query.refresh);
  });
}
