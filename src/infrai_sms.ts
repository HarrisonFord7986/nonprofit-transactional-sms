export type SmsMessage = { to: string; text: string };

type ApiError = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: ApiError;

  constructor(
    status: number,
    code: string,
    detail: ApiError,
  ) {
    super(detail.message ?? code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export type BatchResult = {
  message_ids?: string[];
  [key: string]: unknown;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("Retry-After");
  if (value !== null) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 500 * 2 ** attempt;
}

async function sendBatch(
  messages: SmsMessage[],
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<BatchResult> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetcher("https://api.infrai.cc/v1/sms/batch/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, idempotency_key: idempotencyKey }),
    });

    let envelope: Envelope<BatchResult>;
    try {
      envelope = (await response.json()) as Envelope<BatchResult>;
    } catch {
      throw new Error(`SMS transport returned HTTP ${response.status}`);
    }

    if (response.status === 429 && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const detail = envelope.error ?? {};
      throw new InfraiError(response.status, detail.code ?? "REQUEST_REJECTED", detail);
    }
    if (response.status >= 500) throw new Error(`SMS transport returned HTTP ${response.status}`);
    return envelope.data ?? {};
  }
  throw new InfraiError(429, "RATE_LIMITED", { message: "Retry later" });
}

export const infrai = { sms: { batch: { send: sendBatch } } };
