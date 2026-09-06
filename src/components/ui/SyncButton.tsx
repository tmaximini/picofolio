import { RefreshCw } from "lucide-react";
import { Button, Kbd } from "@/components/primitives";
import { ALL_ACCOUNTS } from "@/store";
import {
  useSelectedAccountId,
  useSyncAll,
  useSyncing,
  useSyncingAll,
} from "@/store/selectors";

type SyncButtonProps = {
  /** Account to sync. Defaults to the account switcher's current scope
   *  (every linked account at "All accounts"). */
  accountId?: string;
};

/**
 * The one Sync action, everywhere it appears: pulls trades / positions / cash
 * from the IBKR connections in scope and refreshes prices — the same thing the
 * `R` hotkey and the command palette do. Same label, same icon, same state.
 */
export function SyncButton({ accountId }: SyncButtonProps) {
  const scope = useSelectedAccountId();
  const syncAll = useSyncAll();
  const syncingAll = useSyncingAll();
  const pricesSyncing = useSyncing();
  const busy = syncingAll || pricesSyncing;
  const target = accountId ?? (scope === ALL_ACCOUNTS ? undefined : scope);

  return (
    <Button onClick={() => void syncAll({ accountId: target })} disabled={busy}>
      <RefreshCw size={13} strokeWidth={1.75} className={busy ? "spin" : undefined} />
      <span>{busy ? "Syncing…" : "Sync"}</span>
      <Kbd>R</Kbd>
    </Button>
  );
}
