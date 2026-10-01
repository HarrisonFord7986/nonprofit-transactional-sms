import { createServer } from "node:http";
import { z } from "zod";
import { alertRequestSchema, decideAlert } from "./alert_policy.js";
import { InfraiError, infrai } from "./infrai_sms.js";

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/alerts") {
    response.writeHead(404).end();
    return;
  }

  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 16_384) throw new RequestError(413, "Request body is too large");
      chunks.push(bytes);
    }
    const input = alertRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const decision = decideAlert(input);
    if (decision.action === "skip") {
      json(response, 200, decision);
      return;
    }

    const delivery = await infrai.sms.batch.send(
      [{ to: decision.to, text: decision.text }],
      `nonprofit-alert-${decision.alertId}`,
    );
    json(response, 202, { action: "sent", alertId: decision.alertId, delivery });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "Invalid alert request" });
    } else if (error instanceof RequestError) {
      json(response, error.status, { error: error.message });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
    } else {
      json(response, 502, { error: "Delivery transport failed" });
    }
  }
});

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Nonprofit SMS service listening on http://localhost:${process.env.PORT ?? 3000}`);
});
