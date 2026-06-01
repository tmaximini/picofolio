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

/**
 * Transient IBKR-side errors worth retrying (on both SendRequest and the
 * GetStatement poll — the statement is still being generated):
 *   1001 — Statement could not be generated at this time
 *   1006 — FlexQueryResponse is not ready
 *   1009 — Statement generation is in progress
 *   1011 — Service unavailable
 *   1018 — Too many requests; try again shortly (rate-limited)
 *   1019 — Statement generation in progress
 *   1021 — Statement could not be retrieved
 * Token / permission errors (1012, 1013, 1015, 1016, 1017, 1020) fail fast.
 */
const TRANSIENT_CODES = new Set([
  "1001",
  "1006",
  "1009",
  "1011",
  "1018",
  "1019",
  "1021",
]);

const SEND_MAX_ATTEMPTS = 4;
const SEND_INITIAL_BACKOFF_MS = 5_000;

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

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < SEND_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) {
      throw new Error(`IBKR SendRequest HTTP ${res.status}`);
    }
    const xml = await res.text();
    const ref = extractTag(xml, "ReferenceCode");
    if (ref) return { referenceCode: ref };

    const code = extractTag(xml, "ErrorCode") ?? "?";
    const msg = extractTag(xml, "ErrorMessage") ?? "No reference code in response";
    const errMsg = `IBKR SendRequest failed (${code}): ${msg}`;
    lastError = new Error(errMsg);

    // Retry on transient codes; bail fast on token/permission errors.
    const isTransient = TRANSIENT_CODES.has(code);
    const isLastAttempt = attempt === SEND_MAX_ATTEMPTS - 1;
    if (!isTransient || isLastAttempt) {
      throw lastError;
    }
    // Exponential backoff: 5s, 10s, 20s
    const backoff = SEND_INITIAL_BACKOFF_MS * 2 ** attempt;
    await delay(backoff, opts.signal);
  }
  throw lastError ?? new Error("IBKR SendRequest exhausted retries");
}

export async function pollFlexStatement(
  token: string,
  referenceCode: string,
  opts: FlexClientOptions = {},
): Promise<string> {
  // Larger queries (Trades + Open Positions + Cash over 365 days) can take
  // IBKR a while to build; give it up to 2 minutes before giving up.
  const pollTimeoutMs = opts.pollTimeoutMs ?? 120_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 4_000;
  const deadline = Date.now() + pollTimeoutMs;

  while (true) {
    const url = `${GET_PATH}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) {
      throw new Error(`IBKR GetStatement HTTP ${res.status}`);
    }
    const xml = await res.text();

    // Is this an error envelope? The real report (<FlexQueryResponse>) has no
    // top-level <Status>, so a Status here means "still generating" or "failed".
    const status = extractTag(xml, "Status")?.toLowerCase();
    const errorCode = extractTag(xml, "ErrorCode");

    // While IBKR is still building the statement it returns Warn/1019 — but
    // also sometimes Fail/1001 ("could not be generated yet, try again
    // shortly"). Both are transient: keep polling within the time budget.
    if ((status === "warn" || status === "fail") && errorCode && TRANSIENT_CODES.has(errorCode)) {
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error(
          `IBKR is still generating the statement (code ${errorCode}). Give it a minute and Sync again.`,
        );
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
