export interface ListeningPort {
  address: string;
  port: number;
  pid: number;
  processName: string | null;
  /** Aba do Gunslinger cujo shell iniciou o processo (sessão), se houver. */
  sessionId: string | null;
}

/** Linhas `TCP  0.0.0.0:5173  0.0.0.0:0  LISTENING  1234` do `netstat -ano` (IPv4 e IPv6). */
export function parseNetstat(output: string): { address: string; port: number; pid: number }[] {
  const seen = new Set<string>();
  const result: { address: string; port: number; pid: number }[] = [];
  for (const line of output.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || cols[0]!.toUpperCase() !== 'TCP' || !/^(LISTENING|ESCUTANDO)$/i.test(cols[3]!)) continue;
    const local = cols[1]!;
    const sep = local.lastIndexOf(':');
    const port = Number(local.slice(sep + 1));
    const pid = Number(cols[4]);
    if (!Number.isInteger(port) || !Number.isInteger(pid)) continue;
    const address = local.slice(0, sep).replace(/^\[|\]$/g, '');
    const key = `${address}|${port}|${pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ address, port, pid });
  }
  // Por porta; na mesma porta, IPv4 antes de IPv6.
  const v6 = (a: string): number => (a.includes(':') ? 1 : 0);
  return result.sort((a, b) => a.port - b.port || v6(a.address) - v6(b.address) || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
}

/** `tasklist /FO CSV /NH` → PID → nome da imagem. */
export function parseTasklist(output: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of output.split(/\r?\n/)) {
    const m = /^"([^"]*)","(\d+)"/.exec(line.trim());
    if (m) map.set(Number(m[2]), m[1]!);
  }
  return map;
}
