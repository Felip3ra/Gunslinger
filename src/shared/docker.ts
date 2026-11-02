export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  /** running, exited, created, paused... */
  state: string;
  status: string;
  ports: string;
}

export type DockerAction = 'start' | 'stop' | 'restart' | 'rm';

export type DockerListResult = { available: true; containers: DockerContainer[] } | { available: false; reason: string };

/** Uma linha JSON por container (`docker ps -a --format "{{json .}}"`). */
export function parseDockerPs(output: string): DockerContainer[] {
  const containers: DockerContainer[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const c = JSON.parse(line) as Record<string, string>;
      containers.push({
        id: c['ID'] ?? '',
        name: c['Names'] ?? '',
        image: c['Image'] ?? '',
        state: (c['State'] ?? '').toLowerCase(),
        status: c['Status'] ?? '',
        ports: c['Ports'] ?? '',
      });
    } catch {
      // linha inesperada: ignora
    }
  }
  return containers;
}

/** Mensagem amigável para falhas do CLI do Docker. */
export function dockerErrorReason(stderr: string): string {
  if (/pipe|daemon|connect|error during connect/i.test(stderr)) return 'O daemon do Docker não está rodando (abra o Docker Desktop).';
  return stderr.trim().split(/\r?\n/)[0] || 'O Docker não respondeu.';
}
