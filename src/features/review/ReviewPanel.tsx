import { forwardRef } from "react";
import { ArrowUpRight, CheckCircle2, RotateCcw } from "lucide-react";
import { Button, Kbd } from "@/components/primitives";
import { formatMoney, formatPct, toneOf } from "@/lib/money";
import { formatOptionLabel, parseOccSymbol } from "@/lib/optionSymbol";
import { isReviewed, type TradeReview } from "@/lib/review";
import { deriveTotals, formatHold, tradeDateKey, tradeOpenedKey } from "@/lib/tradeMath";
import type { Trade } from "@/lib/trades";
import { LabelPicker } from "./LabelPicker";

type ReviewPanelProps = {
  trade: Trade;
  review: TradeReview | undefined;
  position: { index: number; total: number };
  onToggleLabel: (id: string) => void;
  onNote: (note: string) => void;
  onMarkReviewed: () => void;
  onUnmark: () => void;
  onOpenTrade: () => void;
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDay = (key: string) => (key ? dateFmt.format(new Date(`${key}T00:00:00Z`)) : "—");

/** One closed trade under review: what happened, what it was, what you think. */
export const ReviewPanel = forwardRef<HTMLTextAreaElement, ReviewPanelProps>(function ReviewPanel(
  { trade, review, position, onToggleLabel, onNote, onMarkReviewed, onUnmark, onOpenTrade },
  noteRef,
) {
  const tot = deriveTotals(trade);
  const opt = parseOccSymbol(trade.symbol);
  const currency = trade.currency ?? "USD";
  const tone = toneOf(tot.returnCents);
  const done = isReviewed(review);
  // Size traded: the opening side's quantity (for a closed trade it equals
  // what was sold/covered). Options count contracts, everything else shares.
  const openAction = trade.side === "LONG" ? "BUY" : "SELL";
  const qty = trade.executions.filter((e) => e.action === openAction).reduce((n, e) => n + e.qty, 0);
  const unit = opt ? (qty === 1 ? "contract" : "contracts") : qty === 1 ? "share" : "shares";

  return (
    <section className="reviewPanel">
      <header className="reviewPanel__head">
        <div className="reviewPanel__id">
          <span className="reviewPanel__sym">{opt ? opt.underlying : trade.symbol}</span>
          {opt && <span className={`tradeTable__marketBadge tradeTable__marketBadge--${opt.type === "CALL" ? "call" : "put"}`}>{opt.type}</span>}
          <span className="reviewPanel__side">{trade.side === "LONG" ? "Long" : "Short"}</span>
          {opt && <span className="reviewPanel__opt">{formatOptionLabel(opt, { includeType: false })}</span>}
        </div>
        <span className="reviewPanel__pos num">
          {position.index + 1} / {position.total}
        </span>
      </header>

      <div className="reviewPanel__result">
        <span className={`reviewPanel__pnl num tone-${tone}`}>{formatMoney(tot.returnCents, currency)}</span>
        {tot.returnPct != null && <span className={`num tone-${tone}`}>{formatPct(tot.returnPct)}</span>}
        {tot.rMultiple != null && (
          <span className="num reviewPanel__r">
            {tot.rMultiple > 0 ? "+" : ""}
            {tot.rMultiple.toFixed(2)}R
          </span>
        )}
      </div>

      <dl className="reviewPanel__facts">
        <div>
          <dt>Opened</dt>
          <dd className="num">{fmtDay(tradeOpenedKey(trade))}</dd>
        </div>
        <div>
          <dt>Closed</dt>
          <dd className="num">{fmtDay(tradeDateKey(trade))}</dd>
        </div>
        <div>
          <dt>Held</dt>
          <dd className="num">{formatHold(tot.holdMs).toLowerCase()}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd className="num">
            {qty.toLocaleString("en-US")} {unit}
            <span className="reviewPanel__sub">{formatMoney(tot.entryTotalCents, currency, true)} in</span>
          </dd>
        </div>
        <div>
          <dt>Entry → exit</dt>
          <dd className="num">
            {tot.avgEntryCents != null ? formatMoney(tot.avgEntryCents, currency) : "—"} →{" "}
            {tot.avgExitCents != null ? formatMoney(tot.avgExitCents, currency) : "—"}
          </dd>
        </div>
        <div>
          <dt>Setup</dt>
          <dd>{trade.tags.length ? trade.tags.map((t) => `#${t}`).join(" ") : "—"}</dd>
        </div>
      </dl>

      <LabelPicker selected={review?.labelIds ?? []} onToggle={onToggleLabel} />

      <label className="reviewPanel__noteLabel" htmlFor="review-note">
        Thoughts <span>— what would you repeat, what would you do differently?</span>
      </label>
      <textarea
        id="review-note"
        ref={noteRef}
        className="reviewPanel__note"
        value={review?.note ?? ""}
        onChange={(e) => onNote(e.target.value)}
        placeholder="e.g. Entered before confirmation because it was running — sized normally, but no stop."
        rows={3}
      />

      <footer className="reviewPanel__foot">
        <Button variant="ghost" onClick={onOpenTrade}>
          <ArrowUpRight size={13} strokeWidth={1.75} />
          <span>Trade details</span>
          <Kbd>o</Kbd>
        </Button>
        <div className="reviewPanel__footRight">
          {done ? (
            <>
              <span className="reviewPanel__done">
                <CheckCircle2 size={14} strokeWidth={1.75} /> Reviewed
              </span>
              <Button variant="ghost" onClick={onUnmark}>
                <RotateCcw size={12} strokeWidth={1.75} />
                <span>Undo</span>
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={onMarkReviewed}>
              <span>Mark reviewed &amp; next</span>
              <Kbd>↵</Kbd>
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
});
