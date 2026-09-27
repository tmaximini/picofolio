import { HardDrive, Landmark, Waypoints } from "lucide-react";
import { useInView } from "@/lib/useInView";

const NODES = [
  { icon: HardDrive, title: "Your browser", body: "Accounts, trades, tokens, snapshots — all in local storage." },
  { icon: Waypoints, title: "Stateless relay", body: "Forwards the calls brokers refuse from a browser. No database, no accounts." },
  { icon: Landmark, title: "IBKR · prices", body: "Flex Query, public quotes, MarketData.app — with your own keys." },
];

/** Where your data goes: request packets out, data packets home, no database in between. */
export function DataFlow() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.35 });
  return (
    <div className={inView ? "flow flow--on" : "flow"} ref={ref}>
      {NODES.map(({ icon: Icon, title, body }, i) => (
        <div className="flow__cell" key={title}>
          <div className={i === 0 ? "flow__node flow__node--home" : "flow__node"}>
            <span className="flow__icon">
              <Icon size={18} strokeWidth={1.5} />
            </span>
            <span className="flow__title">{title}</span>
            <span className="flow__body">{body}</span>
          </div>
          {i < NODES.length - 1 && (
            <div className="flow__wire" aria-hidden>
              <i className="flow__pkt flow__pkt--out" />
              <i className="flow__pkt flow__pkt--in" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
