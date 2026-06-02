import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout";
import { formatCents, formatPct, toneOf } from "@/lib/money";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import {
  useCalendarMonth,
  useDayTrades,
  useMonthStats,
  useSelectedAccountId,
  useSetCalendarMonth,
  useTradesByDay,
} from "@/store/selectors";
import { TradeViewModal } from "@/features/trades";
import type { Trade } from "@/lib/trades";
import { deriveTotals } from "@/lib/tradeMath";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function isoDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey(): string {
  return isoDateKey(new Date());
}

type WeekRow = {
  days: { date: Date; dateKey: string; inMonth: boolean }[];
  /** dateKey of Sunday */
  sunKey: string;
};

function buildWeeks(monthIso: string): WeekRow[] {
  const first = new Date(`${monthIso}T00:00:00`);
  const year = first.getFullYear();
  const month = first.getMonth();

  const gridStart = new Date(year, month, 1);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // back to Sunday

  const gridEnd = new Date(year, month + 1, 0);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay())); // forward to Saturday

  const weeks: WeekRow[] = [];
  const cursor = new Date(gridStart);
  while (cursor.getTime() <= gridEnd.getTime()) {
    const days: WeekRow["days"] = [];
    let sunKey = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      const key = isoDateKey(d);
      if (i === 0) sunKey = key;
      days.push({
        date: d,
        dateKey: key,
        inMonth: d.getMonth() === month,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ days, sunKey });
  }
  return weeks;
}

export function Calendar() {
  const scope = useSelectedAccountId();
  const monthIso = useCalendarMonth();
  const setMonthIso = useSetCalendarMonth();
  const tradesByDay = useTradesByDay(scope);
  const monthStats = useMonthStats(monthIso, scope);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);

  const weeks = useMemo(() => buildWeeks(monthIso), [monthIso]);
  const cur = new Date(`${monthIso}T00:00:00`);
  const monthIdx = cur.getMonth();
  const year = cur.getFullYear();
  const today = todayKey();

  const shiftMonth = (delta: number) => {
    const d = new Date(year, monthIdx + delta, 1);
    setMonthIso(isoDateKey(d));
  };

  const setMonth = (m: number) =>
    setMonthIso(isoDateKey(new Date(year, m, 1)));

  const setYear = (y: number) =>
    setMonthIso(isoDateKey(new Date(y, monthIdx, 1)));

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    return [now - 2, now - 1, now, now + 1];
  }, []);

  return (
    <>
      <Topbar
        title="Calendar"
        subtitle={`${MONTHS[monthIdx]} ${year}`}
      />

      <div className="calendarHead">
        <button
          type="button"
          className="calendarHead__navBtn"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <div className="calendarHead__monthSelectors">
          <select
            className="calendarHead__select"
            value={monthIdx}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            className="calendarHead__select"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="calendarHead__navBtn"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>

      <MonthSummary stats={monthStats} />

      <div className="calendarGrid">
        {WEEKDAYS.map((w) => (
          <div className="calendarWeekday" key={w}>{w}</div>
        ))}
        <div className="calendarRailLabel">
          Weekly<br />Summary
        </div>

        {weeks.map((week) => (
          <WeekRow
            key={week.sunKey}
            week={week}
            tradesByDay={tradesByDay}
            today={today}
            onDayClick={setOpenDayKey}
          />
        ))}
      </div>

      <MonthExtremes best={monthStats.best} worst={monthStats.worst} />

      {openDayKey && (
        <DayPanel dateKey={openDayKey} onClose={() => setOpenDayKey(null)} />
      )}
    </>
  );
}

/** Friendly symbol: options as "MSFT $480 Call", stocks plain. */
function symLabel(symbol: string): string {
  const opt = parseOccSymbol(symbol);
  if (!opt) return symbol;
  const strike = (opt.strikeCents / 100).toLocaleString("en-US");
  return `${opt.underlying} $${strike} ${opt.type === "CALL" ? "Call" : "Put"}`;
}

function MonthExtremes({
  best,
  worst,
}: {
  best: import("@/store/selectors").MonthExtreme;
  worst: import("@/store/selectors").MonthExtreme;
}) {
  if (!best && !worst) return null;
  return (
    <div className="monthExtremes">
      <ExtremeCard label="Best Trade" extreme={best} />
      <ExtremeCard label="Worst Trade" extreme={worst} />
    </div>
  );
}

function ExtremeCard({
  label,
  extreme,
}: {
  label: string;
  extreme: import("@/store/selectors").MonthExtreme;
}) {
  if (!extreme) {
    return (
      <div className="monthExtreme">
        <span className="monthExtreme__label">{label}</span>
        <span className="monthExtreme__value monthExtreme__value--neutral">—</span>
      </div>
    );
  }
  const tone = toneOf(extreme.returnCents);
  return (
    <div className="monthExtreme">
      <span className="monthExtreme__label">{label}</span>
      <span className="monthExtreme__sym">{symLabel(extreme.symbol)}</span>
      <span className={`monthExtreme__value monthExtreme__value--${tone}`}>
        {formatCents(extreme.returnCents)}
        {extreme.returnPct != null && (
          <span className="monthExtreme__pct">{formatPct(extreme.returnPct)}</span>
        )}
      </span>
    </div>
  );
}

function MonthSummary({ stats }: { stats: import("@/store/selectors").MonthStats }) {
  const pnlTone = toneOf(stats.pnlCents);
  const closed = stats.wins + stats.losses;

  return (
    <div className="monthSummary">
      <div className="monthSummary__cell">
        <span className="monthSummary__label">Month P/L</span>
        <span className={`monthSummary__value monthSummary__value--${pnlTone}`}>
          {stats.trades > 0 ? formatCents(stats.pnlCents) : "—"}
        </span>
      </div>
      <div className="monthSummary__cell">
        <span className="monthSummary__label">Return %</span>
        <span className={`monthSummary__value monthSummary__value--${pnlTone}`}>
          {closed > 0 ? formatPct(stats.returnPct) : "—"}
        </span>
      </div>
      <div className="monthSummary__cell">
        <span className="monthSummary__label">Wins / Losses</span>
        <span className="monthSummary__wl">
          <span className="monthSummary__wl--w">{stats.wins}</span>
          <span className="monthSummary__wl--sep">/</span>
          <span className="monthSummary__wl--l">{stats.losses}</span>
        </span>
      </div>
      <div className="monthSummary__cell">
        <span className="monthSummary__label">Open</span>
        <span className="monthSummary__value monthSummary__value--neutral">
          {stats.open}
        </span>
      </div>
      <div className="monthSummary__cell">
        <span className="monthSummary__label">Trades</span>
        <span className="monthSummary__value monthSummary__value--neutral">
          {stats.trades}
        </span>
      </div>
    </div>
  );
}

function WeekRow({
  week,
  tradesByDay,
  today,
  onDayClick,
}: {
  week: WeekRow;
  tradesByDay: Map<string, import("@/store/selectors").DaySummary>;
  today: string;
  onDayClick: (key: string) => void;
}) {
  let pnlCents = 0;
  let wins = 0;
  let losses = 0;
  let entryWeightedPctSum = 0;
  let countsWithPct = 0;
  for (const d of week.days) {
    const s = tradesByDay.get(d.dateKey);
    if (s) {
      pnlCents += s.pnlCents;
      wins += s.wins;
      losses += s.losses;
      entryWeightedPctSum += s.returnPct;
      countsWithPct += s.count;
    }
  }

  const hasTrades = wins + losses > 0;
  const tone = pnlCents > 0 ? "gain" : pnlCents < 0 ? "loss" : null;

  return (
    <>
      {week.days.map((d) => (
        <DayCell
          key={d.dateKey}
          date={d.date}
          dateKey={d.dateKey}
          inMonth={d.inMonth}
          isToday={d.dateKey === today}
          summary={tradesByDay.get(d.dateKey)}
          onClick={onDayClick}
        />
      ))}
      <div
        className={
          hasTrades
            ? "calendarWeekSummary calendarWeekSummary--has-trades"
            : "calendarWeekSummary"
        }
      >
        {hasTrades && (
          <>
            <div className={`calendarWeekSummary__pnl calendarWeekSummary__pnl--${tone ?? "gain"}`}>
              {formatCents(pnlCents, true)}
            </div>
            <div className="calendarWeekSummary__return">
              {countsWithPct > 0
                ? formatPct(entryWeightedPctSum / countsWithPct)
                : "—"}
            </div>
            <div className="calendarWeekSummary__counts">
              <span className="calendarWeekSummary__count--win">{wins}</span>
              <span className="calendarWeekSummary__count--loss">{losses}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function DayCell({
  date,
  dateKey,
  inMonth,
  isToday,
  summary,
  onClick,
}: {
  date: Date;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  summary: import("@/store/selectors").DaySummary | undefined;
  onClick: (key: string) => void;
}) {
  const tone = summary
    ? summary.pnlCents > 0
      ? "gain"
      : summary.pnlCents < 0
        ? "loss"
        : null
    : null;

  const classes = [
    "calendarDay",
    !inMonth && "calendarDay--outside",
    isToday && "calendarDay--today",
    summary && "calendarDay--has-trades",
    tone && `calendarDay--${tone}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onClick={summary ? () => onClick(dateKey) : undefined}
    >
      <span className="calendarDay__num">{date.getDate()}</span>
      {summary && (
        <>
          <span className={`calendarDay__pnl calendarDay__pnl--${tone ?? "gain"}`}>
            {formatCents(summary.pnlCents, true)}
          </span>
          <span className="calendarDay__count">
            {summary.count} {summary.count === 1 ? "Trade" : "Trades"}
          </span>
        </>
      )}
    </div>
  );
}

function DayPanel({ dateKey, onClose }: { dateKey: string; onClose: () => void }) {
  const scope = useSelectedAccountId();
  const trades = useDayTrades(dateKey, scope);
  const [viewTradeId, setViewTradeId] = useState<string | null>(null);

  // Close on Escape (unless a trade modal is open over the drawer).
  // Outside-click is handled by the backdrop below.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !viewTradeId) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, viewTradeId]);

  const date = new Date(`${dateKey}T00:00:00`);
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  let pnlCents = 0;
  let wins = 0;
  let losses = 0;
  for (const t of trades) {
    const tot = deriveTotals(t);
    if (tot.status === "WIN") wins++;
    else if (tot.status === "LOSS") losses++;
    pnlCents += tot.status === "OPEN" ? 0 : tot.returnCents;
  }
  const tone = pnlCents > 0 ? "gain" : pnlCents < 0 ? "loss" : null;

  return (
    <>
      <div className="dayPanel__backdrop" onClick={onClose} aria-hidden />
      <div className="dayPanel dayPanel--open" role="dialog" aria-modal="true">
        <div className="dayPanel__head">
          <div>
            <div className="dayPanel__title">{dateLabel}</div>
            <div className="dayPanel__sub">
              {wins}W · {losses}L ·{" "}
              <span
                style={{
                  color: tone ? `var(--${tone})` : "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatCents(pnlCents, true)}
              </span>
            </div>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <span style={{ fontSize: 20 }}>×</span>
          </button>
        </div>

        <div className="dayPanel__body">
          {trades.map((t) => (
            <DayTradeCard key={t.id} trade={t} onClick={() => setViewTradeId(t.id)} />
          ))}
        </div>
      </div>

      {viewTradeId && (
        <TradeViewModal
          tradeId={viewTradeId}
          onClose={() => setViewTradeId(null)}
        />
      )}
    </>
  );
}

function DayTradeCard({ trade, onClick }: { trade: Trade; onClick: () => void }) {
  const tot = deriveTotals(trade);
  const tone = tot.returnCents > 0 ? "gain" : tot.returnCents < 0 ? "loss" : null;
  const opt = parseOccSymbol(trade.symbol);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        marginBottom: "var(--space-2)",
        padding: "var(--space-3)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--highlight-top)",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "var(--space-3)",
        alignItems: "center",
        color: "var(--text-primary)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span style={{ color: "var(--accent)", fontWeight: 500 }}>
          {opt ? opt.underlying : trade.symbol}
        </span>
        {opt && (
          <span
            className={`tradeTable__marketBadge tradeTable__marketBadge--${
              opt.type === "CALL" ? "call" : "put"
            }`}
          >
            {opt.type}
          </span>
        )}
      </span>
      <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)" }}>
        {opt ? `${formatOptionLabel(opt, { includeType: false })} · ` : ""}
        {trade.side} · {tot.status}
      </span>
      <span
        className="num"
        style={{
          color: tone ? `var(--${tone})` : "var(--text-secondary)",
          fontWeight: 500,
        }}
      >
        {tot.status === "OPEN" ? "—" : formatCents(tot.returnCents)}
      </span>
    </button>
  );
}
