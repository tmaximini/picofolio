# AGENTS.md — Picofolio

You are working on **Picofolio**, a minimal, beautiful portfolio tracker that combines a trading journal and long-term portfolio overview into one obsessively-designed tool. Target user: technical retail investor with an IBKR account and multiple sub-accounts (typically one trading + one or more long-term).

## North Star

Picofolio is built with aesthetic obsession. The reference points to calibrate against:

- **Fey** — chiaroscuro lighting, an "expensive" feel, restraint
- **Linear** — keyboard-first speed, motion design, a perfectly-tuned dark interface
- **Raycast** — command-palette UX and density without clutter
- **Bloomberg Terminal** — tabular numerics and information density done right

The bias is always toward restraint: darker, calmer, more typographic.

## Product Decisions

| Decision         | Choice                                                                        | Why                                                                  |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Distribution     | Local-first web app (Vite) today; native desktop (Tauri) is planned, not yet scaffolded | Local-first — your data and credentials stay on your machine         |
| Stack            | React + TypeScript + Vite + Zustand (persisted to browser local storage)      | Native feel, no Electron bloat. SQLite-via-Rust is planned with Tauri. |
| Styling          | Hand-written CSS using design tokens. **No shadcn, no Material, no DaisyUI.**  | Component libraries homogenize. Custom components are the whole point. |
| Data source      | IBKR via Flex Query (BYOK); MarketData.app for option marks (BYOK); public equity feed | One excellent integration > five mediocre ones                       |
| Multi-broker     | Not now. Maybe later via SnapTrade.                                           | Focus.                                                               |
| Mobile           | No. A read-only companion app is a maybe, far out.                            | Desktop is where serious users live.                                 |

## Product scope (resist creep)

1. **Connect to IBKR**: Flex Query token + Query ID for positions, cash, and trade fills
2. **Multi-account view** (configurable, designed for 1 trading + N long-term):
   - Combined portfolio value with weekly/MTD/YTD/All deltas
   - Per-account value with deltas
   - Per-account allocation breakdown (% by symbol, by sector)
3. **Trading journal view**:
   - Weekly absolute $ generated (bar chart, rolling)
   - Per-week breakdown of realized P&L
   - Calendar of realized P&L by day
   - Trade list with setups/tags
4. **Holdings table**: combined, sortable, with day/unrealized deltas and expandable charts
5. **Local persistence**: everything lives in browser local storage today; snapshots on each sync

**Out of scope**, no matter how tempting:

- Dividend forecasting
- Tax-lot accounting
- Per-currency P&L breakdowns (values report in the account's base currency; foreign positions show native prices and convert at daily FX rates — see `src/lib/fx.ts`)
- Benchmarking vs S&P
- News feeds
- AI features
- Social / sharing
- Mobile

## Design System

Single source of truth: `src/styles/tokens.css`. Read it before writing any UI code.

### Non-negotiable rules

1. **Never use pure white (`#FFF`) on dark backgrounds.** Use `--text-primary` (`#E8E8EA`). Pure white burns eyes on near-black.
2. **Never use pure black (`#000`).** Use `--surface-void` (`#07080A`). Pure black is dead; near-black has soul.
3. **Tabular numerics everywhere numeric.** All prices, percentages, quantities, dates use `--font-mono` with `font-variant-numeric: tabular-nums`. Non-negotiable. This is THE financial-UI tell.
4. **One accent color.** `--accent` (`#C44536`, Caravaggio red) is reserved for: focus rings, primary CTAs, the trading-account identity color, and brand moments. **Never** decoration.
5. **Gain/loss colors are muted.** `--gain` is sage (`#6BCB97`), not neon. `--loss` is terracotta (`#E5746B`), not crimson. Saturated greens look like crypto-bro apps.
6. **Three layers of glass.** When you need translucency, stack `--glass-thin / medium / thick` over different surface layers. Don't apply heavy `backdrop-filter` on every panel — it's expensive and looks the same regardless.
7. **Top-edge highlight on raised surfaces.** Every card uses `box-shadow: var(--highlight-top), var(--shadow-md)`. The 1px inset highlight is the chiaroscuro move — it makes panels feel like physical objects catching light from above.
8. **Easing is never `ease`.** Use the named `--ease-out` or `--ease-in-out` tokens. The default browser easing is the #1 indicator of a thrown-together UI.
9. **Motion is fast.** 140ms for hovers, 220ms for state changes. Slow animations on financial data feel cheap and unresponsive.
10. **Density is OK.** Financial users _want_ information density. Don't pad rows like a consumer app. Refer to Bloomberg or Linear, not Notion.

### Typography rules

- Display font: **Fraunces** (variable serif) for page titles, hero headlines, brand. Italic optical-size variant has personality without being precious.
- UI font: **Geist** for buttons, labels, body. **Never Inter** — it screams "AI-generated SaaS dashboard."
- Mono font: **Berkeley Mono** if licensed, else **JetBrains Mono**. Used for ALL numbers, all the time.
- Small caps with letter-spacing for category labels (`--tracking-caps`). Bloomberg-terminal energy.

### Component construction

When building a new component:

1. **Compose from primitives** in `src/styles/primitives.css`. Don't reinvent.
2. **Only use tokens**, never hardcoded colors/sizes/timings.
3. **Hover states are mandatory** on anything interactive — but subtle (border darkens, background lifts slightly, never bouncy scale animations).
4. **Focus-visible states are mandatory** for keyboard users. Use `--border-focus`.
5. **No emoji icons.** Use Lucide React (thin weight) for icons. Stroke width 1.5px.
6. **Numbers in tables right-align.** Always. Use `.num` class.

## Keyboard-first UX

Every meaningful action must have a keyboard shortcut. Patterns to follow:

- `⌘K` / `Ctrl K` opens the command palette (Raycast-style fuzzy search across symbols, accounts, actions)
- `n` new trade
- `g`-prefix navigation (Linear-style): `g o` Overview, `g a` Activity/journal, `g c` Calendar, `g h` Holdings, `g s` Settings
- `?` opens the shortcut help overlay
- `/` focuses any visible filter input

Use the `useHotkey()` hook in `src/lib/hotkeys.ts`. Never let mouse-only flows ship.

## Code conventions

- TypeScript strict mode. No `any`.
- Functional components only. No classes.
- Co-locate component CSS in same directory, kebab-case filenames matching the `.tsx`.
- One component per file. Re-export from `index.ts` per directory.
- IBKR Flex access lives in `src/lib/ibkr` (typed client + parser); external calls (IBKR, MarketData.app, equity prices) go through the Vite dev proxy. Never scatter raw broker fetches through React components.
- All money values handled as **integer cents**, never floats. Format only at render time (`src/lib/money.ts`).
- All dates handled as ISO 8601 strings UTC, converted to user TZ at render (`src/lib/dateRange.ts`).
- Error states must be designed — no raw stack traces, no "Something went wrong" without context.

## File structure

```
src/
  styles/
    tokens.css         # design tokens — DO NOT modify casually
    primitives.css     # base primitives (card, button, stat, etc.)
    globals.css        # cross-cutting styles
  components/
    primitives/        # Card, Button, Stat, GlassPanel — pure presentation
    ui/                # composed, app-specific (AccountCard, charts, AllocationBar)
    layout/            # Sidebar, Topbar, Shell
  features/
    trades/            # trade journal, weekly P&L
    setups/            # trade setups/tags
    notes/             # per-trade / per-day notes
  lib/
    ibkr/              # Flex Query client + parser
    options/           # option pricing (MarketData.app)
    money.ts           # currency math (integer cents)
    dateRange.ts       # date helpers
    hotkeys.ts         # useHotkey hook
    yahoo.ts           # public equity price feed
    mock.ts            # demo data — keeps the UI alive without a broker
  store/               # Zustand store + selectors (persisted to local storage)
  pages/
    Overview.tsx
    Trading.tsx
    Calendar.tsx
    Holdings.tsx
    Performance.tsx
    Settings.tsx
```

## When in doubt

- **Make it darker, calmer, more typographic.** The bias is always toward restraint.
- **Cut features, not polish.** A small product done perfectly beats a big one done okay.
- **If you find yourself reaching for shadcn or a component library — stop.** Build the custom component. It's the whole point.
- **If a design decision feels generic, it is.** Restart from the design tokens.

## Reference: the showcase page

`docs/showcase.html` is the design-system reference page rendered as static HTML. Open it in a browser to see how the tokens compose into the actual portfolio UI. **When designing a new screen, glance at this first to recalibrate.**

## Running it

See `README.md` for setup. In short: `pnpm install && pnpm dev`. The app ships with demo data, so every view is alive on first launch; add an IBKR Flex connection in **Settings** to use real data.

---

This document is the contract. When in doubt, re-read it. When it's wrong, update it deliberately — don't drift.
