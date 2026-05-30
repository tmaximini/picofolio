import { formatCents, formatPct, toneOf } from "@/lib/money";
import { useTradeStats } from "@/store/selectors";
import { JournalSpark } from "./JournalSpark";
import { WinRateDonut } from "./WinRateDonut";

const TIPS = {
  wins: "Closed trades with positive realized P/L.",
  losses: "Closed trades with negative realized P/L.",
  open: "Positions still open — at least one execution leg without a matching close.",
  avgWin: "Average realized profit across winning trades.",
  avgLoss: "Average realized loss across losing trades.",
  pnl: "Sum of realized P/L across all closed trades in the selected range.",
} as const;

export function JournalStats() {
  const stats = useTradeStats();
  const pnlTone = toneOf(stats.pnlCents);
  const closedCount = stats.wins + stats.losses;
  const lossRate = closedCount > 0 ? stats.losses / closedCount : 0;
  const openShare = stats.open + closedCount > 0
    ? stats.open / (stats.open + closedCount)
    : 0;

  return (
    <div className="journalStats">
      <div className="journalStats__chart">
        <JournalSpark series={stats.cumulativeSeries} />
      </div>

      <div className="journalStats__grid">
        <Cell
          label="Wins"
          tip={TIPS.wins}
          value={stats.wins}
          aux={<WinRateDonut ratio={stats.winRate} tone="gain" />}
        />
        <Cell
          label="Losses"
          tip={TIPS.losses}
          value={stats.losses}
          aux={<WinRateDonut ratio={lossRate} tone="loss" />}
        />
        <Cell
          label="Open"
          tip={TIPS.open}
          value={stats.open}
          aux={
            <WinRateDonut
              ratio={openShare}
              tone="neutral"
              label={`${stats.open}`}
            />
          }
        />
        <Cell
          label="Avg W"
          tip={TIPS.avgWin}
          value={stats.avgWinCents > 0 ? formatCents(stats.avgWinCents, true) : "—"}
          valueTone="gain"
          subValue={
            stats.avgWinPct !== 0 ? (
              <span className="journalStats__cellSub journalStats__cellSub--gain">
                {formatPct(stats.avgWinPct)}
              </span>
            ) : null
          }
        />
        <Cell
          label="Avg L"
          tip={TIPS.avgLoss}
          value={stats.avgLossCents < 0 ? formatCents(stats.avgLossCents, true) : "—"}
          valueTone="loss"
          subValue={
            stats.avgLossPct !== 0 ? (
              <span className="journalStats__cellSub journalStats__cellSub--loss">
                {formatPct(stats.avgLossPct)}
              </span>
            ) : null
          }
        />
        <Cell
          label="PnL"
          tip={TIPS.pnl}
          value={stats.pnlCents !== 0 ? formatCents(stats.pnlCents, true) : "—"}
          valueTone={pnlTone === "neutral" ? undefined : pnlTone}
          subValue={
            stats.returnPct !== 0 ? (
              <span
                className={`journalStats__cellSub journalStats__cellSub--${pnlTone === "neutral" ? "neutral" : pnlTone}`}
              >
                {formatPct(stats.returnPct)}
              </span>
            ) : null
          }
        />
      </div>
    </div>
  );
}

type CellProps = {
  label: string;
  value: React.ReactNode;
  valueTone?: "gain" | "loss";
  aux?: React.ReactNode;
  subValue?: React.ReactNode;
  tip?: string;
};

function Cell({ label, value, valueTone, aux, subValue, tip }: CellProps) {
  const valueClass = [
    "journalStats__cellValue",
    valueTone && `journalStats__cellValue--${valueTone}`,
  ]
    .filter(Boolean)
    .join(" ");
  const cellClass = aux
    ? "journalStats__cell"
    : "journalStats__cell journalStats__cell--noAux";
  return (
    <div className={cellClass} title={tip}>
      {aux}
      <div className="journalStats__cellBody">
        <div className="journalStats__cellLabel">{label}</div>
        <div className={valueClass}>{value}</div>
        {subValue}
      </div>
    </div>
  );
}
