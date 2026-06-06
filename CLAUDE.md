# CLAUDE.md — Picofolio

You are working on **Picofolio**, a minimal, beautiful desktop portfolio tracker that combines a trading journal and long-term portfolio overview into one obsessively-designed tool. Target user: technical retail investor with an IBKR account and multiple sub-accounts (typically one trading + one or more long-term).

## North Star

Picofolio is built with aesthetic obsession. The reference points we calibrate against:

- **Fey** — chiaroscuro lighting, an "expensive" feel, restraint
- **Linear** — keyboard-first speed, motion design, a perfectly-tuned dark interface
- **Raycast** — command-palette UX and density without clutter
- **Bloomberg Terminal** — tabular numerics and information density done right

The bias is always toward restraint: darker, calmer, more typographic.

## Product Decisions (locked)

| Decision         | Choice                                                                        | Why                                                                  |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Distribution     | Tauri desktop app (macOS first, Linux/Windows after)                          | Local-first — your data and credentials stay on your machine; native feel |
| Stack            | Tauri + React + TypeScript + SQLite (via Rust)                                | Native feel, no Electron bloat                                       |
| Styling          | Hand-written CSS using design tokens. **No shadcn, no Material, no DaisyUI.** | Component libraries homogenize. Custom components are the whole point. |
| Data source (v1) | IBKR via Flex Query + Client Portal Web API                                   | One excellent integration > five mediocre ones                       |
| Multi-broker     | Not in v1. Maybe v2 via SnapTrade.                                            | Focus.                                                               |
| Mobile           | No. Companion read-only iOS app in v3 maybe.                                  | Desktop is where serious users live.                                 |

## Scope of v1 (locked — resist creep)

1. **Connect to IBKR**: Flex Query token + optional Web API for live prices
2. **Three-account view** (configurable, but designed for 1 trading + N long-term):
   - Combined portfolio value with weekly/MTD/YTD/All deltas
   - Per-account value with deltas
   - Per-account allocation breakdown (% by symbol, by sector)
3. **Trading journal view**:
   - Weekly absolute $ generated (bar chart, 14-week rolling)
   - Per-week breakdown of realized P&L
   - Trade list with simple tags (no win-rate analytics yet)
4. **Holdings table**: combined, sortable, with day/week/month deltas
5. **Local SQLite store**: all imports cached, snapshots taken on each sync

**Out of scope for v1**, no matter how tempting:

- Dividend forecasting
- Tax-lot accounting
- Multi-currency reporting (use account currency only)
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
5. **No emoji icons.** Use Lucide React or Phosphor (thin weight) for icons. Stroke width 1.5px.
6. **Numbers in tables right-align.** Always. Use `.num` class.

## Keyboard-first UX

Every meaningful action must have a keyboard shortcut. Patterns to follow:

- `⌘K` opens command palette (Raycast-style fuzzy search across symbols, accounts, actions)
- `⌘R` syncs from IBKR
- `1/2/3/4/5` switches time range (1D/1W/1M/YTD/All)
- `g h` go to Holdings, `g t` go to Trading, etc. (Linear-style g-prefix nav)
- `?` opens shortcut help overlay
- `/` focuses any visible filter input

Build a `useHotkey()` hook early. Never let mouse-only flows ship.

## Code conventions

- TypeScript strict mode. No `any`.
- Functional components only. No classes.
- Co-locate component CSS in same directory, kebab-case filenames matching the `.tsx`.
- One component per file. Re-export from `index.ts` per directory.
- All Rust IBKR communication wrapped in typed Tauri commands; never direct fetch from React to broker.
- All money values stored as **integer cents** in SQLite, never floats. Format only at render time.
- All dates stored as ISO 8601 strings UTC, converted to user TZ at render.
- Error states must be designed — no raw stack traces, no "Something went wrong" without context.

## File structure

```
src/
  styles/
    tokens.css         # design tokens — DO NOT modify casually
    primitives.css     # base primitives (card, button, stat, etc.)
    globals.css        # any cross-cutting styles
  components/
    primitives/        # Card, Button, Stat, GlassPanel — pure presentation
    ui/                # composed, app-specific (AccountCard, WeeklyPLChart, AllocationBar)
    layout/            # Sidebar, Topbar, Shell
  features/
    accounts/          # account list, account detail
    holdings/          # holdings table
    trading/           # trade journal, weekly P&L
    sync/              # IBKR connection, Flex Query parser
  lib/
    money.ts           # all currency math (integer cents)
    dates.ts           # date helpers
    hotkeys.ts         # useHotkey hook
  pages/
    Overview.tsx
    Trading.tsx
    Holdings.tsx
    Settings.tsx
src-tauri/
  src/
    ibkr/              # Flex Query parser, Web API client
    db/                # SQLite schema + queries
    commands.rs        # Tauri command handlers
```

## When in doubt

- **Make it darker, calmer, more typographic.** The bias is always toward restraint.
- **Cut features, not polish.** A small product done perfectly beats a big one done okay.
- **If you find yourself reaching for shadcn or a component library — stop.** Build the custom component. It's the whole point.
- **If a design decision feels generic, it is.** Restart from the design tokens.

## Reference: the showcase page

`docs/showcase.html` is the design-system reference page rendered as static HTML. Open it in a browser to see how the tokens compose into the actual portfolio UI. **When designing a new screen, glance at this first to recalibrate.**

## What to build first

In this order (do not skip ahead):

1. Tauri + Vite + React + TS skeleton building and running
2. Port `tokens.css` and `primitives.css` into the React project
3. Build `<Shell>` with Sidebar + Topbar (matching the showcase HTML)
4. Mock data layer (`src/lib/mock.ts`) — let the UI come alive before IBKR exists
5. Overview page wired to mock data
6. SQLite schema + Tauri commands for read/write
7. IBKR Flex Query: token storage in OS keychain, XML parser in Rust, import flow
8. Wire real data through. Mock layer can stay as a fallback / demo mode.
9. Trading Journal page
10. Holdings page
11. Keyboard shortcuts + command palette
12. Settings

Each step ships as a usable artifact. No long branches.

---

This document is the contract. When in doubt, re-read it. When it's wrong, update it deliberately — don't drift.
