import { LOCATIONS } from "./locations";
import { statement } from "./ledger";

// Each site's own balance in SSP: its profit minus the SSP it changed into dollars.
export function siteBalances(ledger, inPeriod = () => true) {
  const pick = (rows, id) => rows.filter((r) => r.location === id && inPeriod(r));
  const rows = LOCATIONS.map((l) => ({
    ...l, s: statement({ daily: pick(ledger.daily, l.id), purchases: pick(ledger.purchases, l.id), usd: pick(ledger.usd, l.id) }),
  }));
  const total = statement({ daily: ledger.daily.filter(inPeriod), purchases: ledger.purchases.filter(inPeriod), usd: ledger.usd.filter(inPeriod) });
  return { rows, total };
}
