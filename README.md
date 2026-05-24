# Chiaroscuro

A desktop portfolio tracker for serious retail investors with IBKR.

Combines a **trading journal** and **long-term portfolio overview** in one obsessively-designed tool. Local-first. Pay once.

> Read `CLAUDE.md` before doing anything. It's the contract.

## Reference design

Open `src/index.html` in a browser. That's the visual north star — the design system applied to the actual use case (three IBKR sub-accounts, weekly P&L on trading, allocation views).

## What's here

```
CLAUDE.md                    # The contract. Read first.
src/
  index.html                 # Design system reference page (static HTML)
  styles/
    tokens.css               # Design tokens — single source of truth
    primitives.css           # Base primitives (card, button, stat, table, …)
  components/                # (empty — to be built)
```

## Next step

Hand `CLAUDE.md` to Claude Code and have it scaffold the Tauri + React + TS app, then port the tokens and primitives into the real project.
