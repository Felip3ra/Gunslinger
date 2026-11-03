import { execFile } from 'node:child_process';
import type { CustomProfile, ProfileOverride, SaveResult, ShellProfile } from '@shared/model';
import type { ConfigStore } from '../config/config-store';
import type { EnvironmentService } from '../env/environment-service';
import type { DetectedShell, PlatformAdapter } from '../platform/types';
import { isIconFile, loadIconData } from './profile-icons';
import { pickDefaultProfile, resolveProfiles, type DefaultProfileResult } from './profiles';

function isDetectedShell(v: unknown): v is DetectedShell {
  const o = v as Partial<DetectedShell>;
  return typeof o?.id === 'string' && typeof o.executable === 'string' && Array.isArray(o.args) && typeof o.shellType === 'string';
}

/** Descobre se o shell padrão da distribuição é bash (a integração só existe para bash). */
function wslDefaultShellIsBash(wslExe: string, distro: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      wslExe,
      ['-d', distro, '--', 'sh', '-c', 'getent passwd "$(id -un)" | cut -d: -f7'],
      { windowsHide: true, timeout: 15_000 },
      (err, stdout) => resolve(!err && /\/bash\s*$/.test(stdout.toString())),
    );
  });
}

export class ShellService {
  private detected: DetectedShell[] = [];
  private readonly customAvailability = new Map<string, boolean>();
  private pluginProfiles: CustomProfile[] = [];
  /** Imagens dos ícones por arquivo, por caminho. */
  private readonly icons = new Map<string, string | null>();
  private readonly listeners = new Set<(profiles: ShellProfile[]) => void>();

  constructor(
    private readonly platform: PlatformAdapter,
    private readonly env: EnvironmentService,
    private readonly config: ConfigStore,
  ) {}

  /** Carrega o cache da última detecção (abertura rápida) e dispara a detecção nova em segundo plano. */
  init(): void {
    const cached = this.config.getState().detectedProfiles.filter(isDetectedShell);
    this.detected = cached.length > 0 ? cached : [this.platform.fallbackShell(this.env.current().env)];
    void this.redetect();
    this.config.onChange(() => void this.refreshCustomAvailability().then(() => this.emit()));
    this.env.onChange(() => void this.redetect());
  }

  async redetect(): Promise<ShellProfile[]> {
    const env = this.env.current().env;
    const fresh = await this.platform.detectShells(env);
    if (fresh.length > 0) {
      // A consulta do shell padrão do WSL liga a VM; só é feita para distribuições ainda não vistas.
      const previous = new Map(this.detected.map((d) => [d.id, d]));
      await Promise.all(
        fresh
          .filter((d) => d.shellType === 'wsl' && d.wslDistro)
          .map(async (d) => {
            const known = previous.get(d.id);
            d.supportsIntegration = known ? known.supportsIntegration : await wslDefaultShellIsBash(d.executable, d.wslDistro!);
          }),
      );
      this.detected = fresh;
      await this.config.patchState({ detectedProfiles: fresh });
    }
    await this.refreshCustomAvailability();
    this.emit();
    return this.list();
  }

  private async refreshCustomAvailability(): Promise<void> {
    const env = this.env.current().env;
    const custom = [...this.config.snapshot().settings.profiles.custom, ...this.pluginProfiles];
    await Promise.all(
      custom.map(async (c) => this.customAvailability.set(c.id, (await this.platform.resolveExecutable(c.executable, env)) !== null)),
    );
    await this.refreshIcons();
  }

  /** Relê as imagens dos ícones por arquivo (a mudança nas configurações pode ter trocado o arquivo). */
  private async refreshIcons(): Promise<void> {
    const paths = new Set(this.resolved().map((p) => p.icon).filter(isIconFile));
    this.icons.clear();
    await Promise.all([...paths].map(async (path) => this.icons.set(path, await loadIconData(path))));
  }

  list(): ShellProfile[] {
    return this.resolved().map((p) => {
      const data = this.icons.get(p.icon);
      return data ? { ...p, iconData: data } : p;
    });
  }

  private resolved(): ShellProfile[] {
    const { overrides, custom } = this.config.snapshot().settings.profiles;
    return resolveProfiles(this.detected, overrides, custom, this.customAvailability, this.pluginProfiles);
  }

  /** Perfis contribuídos por plugins ativos (o executável é verificado aqui, no main). */
  async setPluginProfiles(profiles: CustomProfile[]): Promise<void> {
    this.pluginProfiles = profiles;
    await this.refreshCustomAvailability();
    this.emit();
  }

  get(id: string): ShellProfile | undefined {
    return this.list().find((p) => p.id === id);
  }

  defaultProfile(): DefaultProfileResult {
    return pickDefaultProfile(this.list(), this.config.snapshot().settings.defaultProfile);
  }

  onChange(listener: (profiles: ShellProfile[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const profiles = this.list();
    for (const l of this.listeners) l(profiles);
  }

  // ---------- edição (settings.json) ----------

  async saveCustom(profile: CustomProfile): Promise<SaveResult> {
    const resolved = await this.platform.resolveExecutable(profile.executable, this.env.current().env);
    if (!resolved) return { ok: false, error: 'Executável não encontrado' };
    if (profile.id.startsWith('builtin.')) return { ok: false, error: 'IDs "builtin." são reservados para perfis detectados' };
    const custom = this.config.snapshot().settings.profiles.custom;
    const index = custom.findIndex((c) => c.id === profile.id);
    const next = index >= 0 ? custom.map((c, i) => (i === index ? profile : c)) : [...custom, profile];
    const result = await this.config.updateSettings(['profiles', 'custom'], next);
    if (result.ok) this.customAvailability.set(profile.id, true);
    return result;
  }

  async deleteCustom(id: string): Promise<SaveResult> {
    const custom = this.config.snapshot().settings.profiles.custom;
    if (!custom.some((c) => c.id === id)) return { ok: false, error: 'Perfil não encontrado' };
    return this.config.updateSettings(['profiles', 'custom'], custom.filter((c) => c.id !== id));
  }

  async setOverride(id: string, override: ProfileOverride): Promise<SaveResult> {
    return this.config.updateSettings(['profiles', 'overrides', id], override);
  }
}
