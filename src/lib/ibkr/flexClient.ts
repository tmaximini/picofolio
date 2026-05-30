/**
 * IBKR Flex Web Service client. Two-step protocol:
 *
 *   1. SendRequest(token, queryId)  -> { referenceCode }
 *   2. GetStatement(token, referenceCode) -> XML (or "statement not ready" → retry)
 *
 * Endpoints are CORS-locked, so we route through a dev proxy in development
 * (see vite.config.ts). For deployed web builds a stateless edge proxy
 * needs to mirror the same `/api/ibkr/flex/*` path — TBD per env.
 *
 * Reference: IBKR Flex Web Service v3
 *   SendRequest:  /FlexStatementService.SendRequest?t=...&q=...&v=3
 *   GetStatement: /FlexStatementService.GetStatement?t=...&q=...&v=3
 */

const FLEX_BASE = "/api/ibkr/flex";

const SEND_PATH = `${FLEX_BASE}/FlexStatementService.SendRequest`;
const GET_PATH = `${FLEX_BASE}/FlexStatementService.GetStatement`;

/** IBKR's "statement not ready yet" warning code — we treat it as retry-able. */
const NOT_READY_CODE = "1019";

export type FlexClientOptions = {
  /** Total poll budget in ms. Default 60s. */
  pollTimeoutMs?: number;
  /** Delay between polls in ms. Default 4s. */
  pollIntervalMs?: number;
  /** AbortSignal to cancel an in-flight sync. */
  signal?: AbortSignal;
};

/**
 * Run the full request → poll → return-XML flow. The returned string is
 * the raw Flex Query XML, ready to pass to parseFlexXml().
 */
export async function fetchFlexStatement(
  token: string,
  queryId: string,
  opts: FlexClientOptions = {},
): Promise<string> {
  const { referenceCode } = await sendFlexRequest(token, queryId, opts);
  return pollFlexStatement(token, referenceCode, opts);
}

export async function sendFlexRequest(
  token: string,
  queryId: string,
  opts: FlexClientOptions = {},
): Promise<{ referenceCode: string }> {
  const url = `${SEND_PATH}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`IBKR SendRequest HTTP ${res.status}`);
  }
  const xml = await res.text();
  const ref = extractTag(xml, "ReferenceCode");
  if (!ref) {
    const code = extractTag(xml, "ErrorCode") ?? "?";
    const msg = extractTag(xml, "ErrorMessage") ?? "No reference code in response";
    throw new Error(`IBKR SendRequest failed (${code}): ${msg}`);
  }
  return { referenceCode: ref };
}

export async function pollFlexStatement(
  token: string,
  referenceCode: string,
  opts: FlexClientOptions = {},
): Promise<string> {
  const pollTimeoutMs = opts.pollTimeoutMs ?? 60_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 4_000;
  const deadline = Date.now() + pollTimeoutMs;

  while (true) {
    const url = `${GET_PATH}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) {
      throw new Error(`IBKR GetStatement HTTP ${res.status}`);
    }
    const xml = await res.text();

    // Is this an error envelope?
    const status = extractTag(xml, "Status")?.toLowerCase();
    const errorCode = extractTag(xml, "ErrorCode");
    if (status === "warn" && errorCode === NOT_READY_CODE) {
      // Not ready; sleep and retry within budget.
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error("IBKR GetStatement timed out waiting for statement");
      }
      await delay(pollIntervalMs, opts.signal);
      continue;
    }
    if (status === "fail") {
      const msg = extractTag(xml, "ErrorMessage") ?? "Unknown failure";
      throw new Error(`IBKR GetStatement failed (${errorCode ?? "?"}): ${msg}`);
    }

    // Anything else: assume it's the actual report.
    return xml;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Minimal XML "get text content of first tag" — sufficient for the envelope responses. */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1]!.trim() : null;
}
