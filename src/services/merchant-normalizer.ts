/**
 * Dynamic merchant normalization — no hardcoded merchant lists.
 * Strips payment noise, clusters similar raw strings during ingest.
 */

const GENERIC_TOKENS = new Set([
  'ORDER',
  'PAYMENT',
  'PAY',
  'ONLINE',
  'APP',
  'LTD',
  'LIMITED',
  'PVT',
  'PRIVATE',
  'SERVICES',
  'SOLUTIONS',
  'TECHNOLOGIES',
  'TECH',
  'INDIA',
  'INDIAN',
  'STORE',
  'SHOP',
  'MART',
  'INSTAMART',
  'EXPRESS',
  'DIGITAL',
  'UPI',
  'NEFT',
  'IMPS',
  'RTGS',
  'BANK',
  'HDFC',
  'ICICI',
  'SBI',
  'AXIS',
  'KOTAK',
  'YES',
  'YBL',
  'BOOKING',
  'RECHARGE',
  'BILL',
  'TXN',
  'REF',
  'NO',
  'THE',
  'AND',
  'OF',
  'FOR',
]);

function tokenize(raw: string): string[] {
  let s = raw.trim().toUpperCase();
  const starIdx = s.indexOf('*');
  if (starIdx >= 0) {
    s = s.slice(0, starIdx);
  }
  s = s.replace(/[^A-Z0-9\s]/g, ' ');
  return s
    .split(/\s+/)
    .map((t) => t.replace(/^0+/, ''))
    .filter((t) => t.length > 0 && !/^\d+$/.test(t));
}

/** Base signature from a single merchant string (before cross-dataset clustering). */
export function normalizeMerchant(raw: string): string {
  const tokens = tokenize(raw);
  if (tokens.length === 0) {
    return 'UNKNOWN';
  }

  const brandTokens = tokens.filter((t) => !GENERIC_TOKENS.has(t));
  const core = brandTokens.length > 0 ? brandTokens : tokens;

  if (core.length === 1) {
    return core[0];
  }

  const first = core[0];
  const second = core[1];
  if (second && second.length >= 4 && !GENERIC_TOKENS.has(second)) {
    return `${first} ${second}`;
  }

  return first;
}

function prefixScore(a: string, b: string): number {
  const ta = a.split(/\s+/);
  const tb = b.split(/\s+/);
  if (ta[0] === tb[0]) {
    return 1;
  }
  const shorter = ta[0].length <= tb[0].length ? ta[0] : tb[0];
  const longer = ta[0].length > tb[0].length ? ta[0] : tb[0];
  if (longer.startsWith(shorter) && shorter.length >= 4) {
    return shorter.length / longer.length;
  }
  return 0;
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const a = s1.replace(/\s+/g, '');
  const b = s2.replace(/\s+/g, '');
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }

  const jaro =
    (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Merge per-string signatures into dataset-wide canonical labels via union-find.
 */
export function buildCanonicalMap(rawMerchants: string[]): Map<string, string> {
  const signatures = new Map<string, string>();
  for (const raw of rawMerchants) {
    signatures.set(raw, normalizeMerchant(raw));
  }

  const uniqueSigs = [...new Set(signatures.values())];
  const parent = new Map<string, string>();
  for (const sig of uniqueSigs) {
    parent.set(sig, sig);
  }

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function unite(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const pick =
      ra.length <= rb.length || ra.split(' ').length <= rb.split(' ').length
        ? ra
        : rb;
    const drop = pick === ra ? rb : ra;
    parent.set(drop, pick);
    parent.set(find(drop), pick);
  }

  for (let i = 0; i < uniqueSigs.length; i++) {
    for (let j = i + 1; j < uniqueSigs.length; j++) {
      const a = uniqueSigs[i];
      const b = uniqueSigs[j];
      if (prefixScore(a, b) >= 0.85 || jaroWinkler(a, b) >= 0.92) {
        unite(a, b);
      }
    }
  }

  const sigToCanonical = new Map<string, string>();
  for (const sig of uniqueSigs) {
    sigToCanonical.set(sig, find(sig));
  }

  const result = new Map<string, string>();
  for (const [raw, sig] of signatures) {
    result.set(raw, sigToCanonical.get(sig) ?? sig);
  }
  return result;
}
