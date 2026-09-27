import type { ReactNode } from "react";

/** Step-by-step: from IBKR Client Portal to a working Flex token + Query ID. */
export function IbkrSetupGuide() {
  return (
    <ol className="ibkrHelp">
      <Step n={1} title="Sign in to Client Portal">
        Open{" "}
        <a
          href="https://www.interactivebrokers.com/sso/Login"
          target="_blank"
          rel="noopener noreferrer"
        >
          interactivebrokers.com/sso/Login
        </a>
        . For a <strong>paper account</strong>, log in with your paper
        credentials. Paper accounts work identically with Flex; their IDs start
        with <code>DU</code> instead of <code>U</code>.
      </Step>
      <Step n={2} title="Open the Flex Queries page">
        Menu → <strong>Performance &amp; Reports</strong> →{" "}
        <strong>Flex Queries</strong>.
      </Step>
      <Step n={3} title="Enable the Flex Web Service + generate a token">
        In the <strong>Flex Web Service Configuration</strong> panel, set Status
        to <strong>Enabled</strong>, save, then <strong>Generate token</strong>.
        Copy the long alphanumeric string — that's your <strong>Flex Token</strong>.
      </Step>
      <Step n={4} title="Create an Activity Flex Query">
        Under <strong>Activity Flex Query</strong>, hit <strong>+</strong> and
        name it anything (e.g. <code>picofolio</code>). Set Format{" "}
        <strong>XML</strong> and Period{" "}
        <strong>Last 365 Calendar Days</strong> — the full year backfills your
        account-value chart on the first sync.
      </Step>
      <Step n={5} title="Tick exactly four sections">
        In each section's popup, tick the topmost box to select all fields.
        Leave every other section off and all date/time formats at their
        defaults.
        <ul>
          <li>
            <strong>Trades</strong> — fills the Activity journal.
          </li>
          <li>
            <strong>Open Positions</strong> — Holdings &amp; live account
            value. Without it the account shows $0.
          </li>
          <li>
            <strong>Cash Report</strong> — your cash balance.
          </li>
          <li>
            <strong>Net Asset Value (NAV) in Base</strong> — IBKR's official
            daily account value. This is what makes the performance chart
            match IBKR exactly.
          </li>
        </ul>
        Already have a query? Edit it, tick the missing sections, save — the
        next sync picks them up.
      </Step>
      <Step n={6} title="Find the Query ID, paste, sync">
        Save the query — it appears in the list with a numeric{" "}
        <strong>Query ID</strong>. Paste the token + Query ID into the
        fields above, save, then <strong>Sync now</strong>.
      </Step>
    </ol>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
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

