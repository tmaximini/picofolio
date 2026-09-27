import type { ReactNode } from "react";
import { FLEX_SECTIONS, type FlexSectionLabel } from "@/lib/ibkr/flexParser";

/** What each Flex section powers in Picofolio — shown in the guide and in the
 *  sync card's "missing sections" callout. */
export const SECTION_PURPOSE: Record<FlexSectionLabel, string> = {
  Trades: "your fills — the journal, calendar and realized P&L",
  "Open Positions": "holdings and account value (without it the account shows 0)",
  "Cash Report": "your cash balance",
  "Net Asset Value (NAV) in Base": "IBKR's daily account value — the performance chart and returns",
  "Cash Transactions": "deposits and withdrawals, so they don't count as gains or losses",
  Transfers: "money and positions moved between your sub-accounts, same reason",
};

/** Step-by-step: from IBKR Client Portal to a working Flex token + Query ID. */
export function IbkrSetupGuide() {
  return (
    <div className="ibkrGuide">
      <p className="ibkrGuide__intro">
        About five minutes, on the IBKR <strong>website</strong> (Client Portal) — the
        IBKR mobile app and TWS can't create or edit Flex queries. Paper accounts
        work the same way; their IDs start with <code>DU</code>.
      </p>

      <div className="ibkrGuide__update">
        <div className="ibkrGuide__updateTitle">Already connected? Update your query</div>
        Client Portal → <strong>Performance &amp; Reports → Flex Queries</strong> → click the
        pencil next to your query (its Query ID matches the one above) → tick any
        section from step 4 that's missing → <strong>Save</strong> → <strong>Sync now</strong> here.
        The Query ID and token stay the same.
      </div>

      <ol className="ibkrHelp">
        <Step n={1} title="Open Flex Queries in Client Portal">
          Sign in at{" "}
          <a href="https://www.interactivebrokers.com/sso/Login" target="_blank" rel="noopener noreferrer">
            interactivebrokers.com
          </a>
          , then in the top menu choose <strong>Performance &amp; Reports → Flex Queries</strong>.
        </Step>
        <Step n={2} title="Get a Flex Web Service token">
          In the <strong>Flex Web Service Configuration</strong> panel, turn the service on,
          then <strong>Generate token</strong> and copy it.
          <ul>
            <li>Pick the longest validity offered — when it runs out, sync says the token expired and you generate a new one here.</li>
            <li>Leave any <strong>IP restriction</strong> empty: requests come from Picofolio's relay, not your computer.</li>
          </ul>
        </Step>
        <Step n={3} title="Create an Activity Flex Query">
          Under <strong>Activity Flex Query</strong>, press <strong>+</strong> and name it
          (e.g. <code>picofolio</code>). In the delivery settings choose Format{" "}
          <strong>XML</strong> and Period <strong>Last 365 Calendar Days</strong> — a full year
          backfills your charts on the first sync. Leave date and time formats at their defaults.
        </Step>
        <Step n={4} title="Tick these six sections">
          In each section's popup, tick the box at the top to select all its fields. Leave
          the other sections off.
          <ul className="ibkrGuide__sections">
            {FLEX_SECTIONS.map((s) => (
              <li key={s.tag}>
                <strong>{s.label}</strong> — {SECTION_PURPOSE[s.label]}
              </li>
            ))}
          </ul>
        </Step>
        <Step n={5} title="Save and copy the Query ID">
          Save the query. It appears in the list with a number next to it — that's the{" "}
          <strong>Query ID</strong>.
        </Step>
        <Step n={6} title="Paste both here and sync">
          Paste the token and Query ID into the fields above and press <strong>Sync now</strong>.
          The first sync can take a minute while IBKR builds the statement; Picofolio waits
          and retries on its own.
        </Step>
      </ol>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="ibkrHelp__step">
      <span className="ibkrHelp__num">{n}</span>
      <div>
        <div className="ibkrHelp__title">{title}</div>
        <div className="ibkrHelp__body">{children}</div>
      </div>
    </li>
  );
}
