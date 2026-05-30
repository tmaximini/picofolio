import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/store/index";
import { useAccounts } from "@/store/selectors";

const ALLOCATION_COLORS: Record<string, string> = {
  Trading: "#C44536",
  "Long-Term": "#6BCB97",
};
const FALLBACK_COLORS = ["#D9A86C", "#7D77C3", "#6E7480"];

export function AllocationBar() {
  const accounts = useAccounts();
  // Compose the per-account value via the store directly so we only
  // subscribe once for all rows (instead of one hook per account).
  // useShallow stabilizes the object reference: the selector runs every
  // store change, but if the per-account values are unchanged shallowly,
  // Zustand returns the previous result and React skips the render.
  const valueByAccount = useStore(
    useShallow((s) => {
      const map: Record<string, number | null> = {};
      for (const a of s.accounts) {
        const rows = s.holdings.filter((h) => h.account === a.name);
        let total = a.cashCents;
        let ok = true;
        for (const h of rows) {
          const pts = s.prices[h.symbol]?.points;
          const last =
            pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
          if (last == null) {
            ok = false;
            break;
          }
          total += Math.round(h.qty * last * 100);
        }
        map[a.name] = ok ? total : null;
      }
      return map;
    }),
  );

  const ready = accounts.every((a) => valueByAccount[a.name] != null);
  if (!ready) {
    return (
      <ul className="allocList">
        {accounts.map((a, i) => (
          <li key={a.id} className="allocRow">
            <span
              className="allocItem__dot"
              style={{ background: colorFor(a.name, i) }}
            />
            <span className="allocRow__name">{a.name}</span>
            <span className="allocRow__pct" style={{ color: "var(--text-tertiary)" }}>
              —
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const total =
    accounts.reduce((acc, a) => acc + (valueByAccount[a.name] ?? 0), 0) || 1;
  const items = accounts
    .map((a, i) => ({
      id: a.id,
      name: a.name,
      color: colorFor(a.name, i),
      pct: (valueByAccount[a.name] ?? 0) / total,
    }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <ul className="allocList">
      {items.map((s) => (
        <li key={s.id} className="allocRow">
          <span className="allocItem__dot" style={{ background: s.color }} />
          <span className="allocRow__name">{s.name}</span>
          <span className="allocRow__pct">{(s.pct * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}

function colorFor(name: string, index: number): string {
  return ALLOCATION_COLORS[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]!;
}
