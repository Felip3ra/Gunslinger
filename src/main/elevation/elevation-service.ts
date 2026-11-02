import { ENABLE_SUDO_HINT, externalElevationScript, sudoSupportsInline, type CommandLine, type ElevationInfo, type ElevationMechanism } from '@shared/elevation';
import type { OpenResult } from '@shared/model';

export const SUDO_REGISTRY_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Sudo';

/** Lê o DWORD `Enabled` de um `reg export` da chave do sudo (null se ausente). */
export function parseSudoEnabled(exported: string | null): number | null {
  if (!exported) return null;
  const m = /^"Enabled"=dword:([0-9a-f]{8})/im.exec(exported);
  return m ? parseInt(m[1]!, 16) : null;
}

export interface ElevationDeps {
  /** `reg export` da chave do sudo, ou null. */
  readSudoRegistry(): Promise<string | null>;
  resolveExecutable(name: string): Promise<string | null>;
  /** Inicia um processo desacoplado (sem console do app). */
  launchDetached(file: string, args: string[]): Promise<OpenResult>;
  powershellPath: string;
}

/** Descobre como elevar shells nesta máquina; o resultado fica em cache até `refresh()`. */
export class ElevationService {
  private cached: Promise<ElevationMechanism> | null = null;

  constructor(private readonly deps: ElevationDeps) {}

  refresh(): void {
    this.cached = null;
  }

  mechanism(): Promise<ElevationMechanism> {
    this.cached ??= this.detect();
    return this.cached;
  }

  async info(): Promise<ElevationInfo> {
    const m = await this.mechanism();
    return { mechanism: m.kind, hint: m.kind === 'external' ? ENABLE_SUDO_HINT : null };
  }

  /** Abre o shell elevado numa janela separada (Start-Process -Verb RunAs: o UAC é do Windows). */
  openExternal(shell: CommandLine, cwd: string): Promise<OpenResult> {
    const script = externalElevationScript(shell, cwd);
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return this.deps.launchDetached(this.deps.powershellPath, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded]);
  }

  private async detect(): Promise<ElevationMechanism> {
    if (sudoSupportsInline(parseSudoEnabled(await this.deps.readSudoRegistry()))) {
      const sudo = await this.deps.resolveExecutable('sudo.exe');
      if (sudo) return { kind: 'sudo-inline', path: sudo };
    }
    const gsudo = await this.deps.resolveExecutable('gsudo.exe');
    return gsudo ? { kind: 'gsudo', path: gsudo } : { kind: 'external' };
  }
}
