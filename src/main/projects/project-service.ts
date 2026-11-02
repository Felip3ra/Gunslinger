import { watch, type FSWatcher } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventMap } from '@shared/ipc-contract';
import type { NodePackage, PackageManager, ProjectAnalysis } from '@shared/model';
import { analyzeDotnet } from './dotnet';
import { analyzePackage } from './node';
import { scanProject } from './scan';

const WATCHED_FILES = new Set(['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.yarnrc.yml']);

interface Watched {
  root: string;
  overrides: Record<string, PackageManager>;
  packages: NodePackage[];
  watchers: FSWatcher[];
  timers: Map<string, NodeJS.Timeout>;
}

export class ProjectService {
  private readonly watched = new Map<string, Watched>();

  constructor(
    private readonly send: <K extends keyof EventMap>(channel: K, payload: EventMap[K]) => void,
    private readonly debounceMs = 300,
  ) {}

  async analyze(root: string, projectId?: string, overrides: Record<string, PackageManager> = {}): Promise<ProjectAnalysis> {
    try {
      await access(root);
    } catch {
      throw new Error(`Pasta não encontrada: ${root}`);
    }
    const scan = await scanProject(root);
    const [dotnet, nodePackages] = await Promise.all([
      analyzeDotnet(root, scan.csprojs, scan.solutions),
      Promise.all(scan.packageJsonDirs.map((dir) => analyzePackage(root, dir, overrides[dir]))),
    ]);
    if (projectId) this.watchPackages(projectId, root, overrides, nodePackages);
    return {
      rootPath: root,
      suggestedTypes: { dotnet: scan.csprojs.length > 0 || scan.solutions.length > 0, node: nodePackages.length > 0 },
      dotnet,
      nodePackages,
    };
  }

  /** Observa as pastas dos pacotes (não a raiz inteira: node_modules inundaria o watcher). */
  private watchPackages(projectId: string, root: string, overrides: Record<string, PackageManager>, packages: NodePackage[]): void {
    this.unwatch(projectId);
    const state: Watched = { root, overrides, packages, watchers: [], timers: new Map() };
    this.watched.set(projectId, state);
    for (const pkg of packages) {
      try {
        // Editores salvam via rename: observar a pasta é mais confiável que o arquivo.
        const watcher = watch(join(root, pkg.dir), (_event, filename) => {
          if (!filename || !WATCHED_FILES.has(filename.toString().toLowerCase())) return;
          clearTimeout(state.timers.get(pkg.dir));
          state.timers.set(pkg.dir, setTimeout(() => void this.refreshPackage(projectId, pkg.dir), this.debounceMs));
        });
        state.watchers.push(watcher);
      } catch {
        // pasta removida entre a varredura e o watch
      }
    }
  }

  private async refreshPackage(projectId: string, dir: string): Promise<void> {
    const state = this.watched.get(projectId);
    if (!state) return;
    const previous = state.packages.find((p) => p.dir === dir);
    const updated = await analyzePackage(state.root, dir, state.overrides[dir], previous?.error ? undefined : previous);
    // Se a versão anterior já era inválida, preserva a última lista válida que ela carregava.
    const merged = updated.error && previous?.error ? { ...updated, scripts: previous.scripts, stale: previous.stale } : updated;
    state.packages = state.packages.map((p) => (p.dir === dir ? merged : p));
    this.send('project:packagesChanged', { projectId, packages: state.packages });
  }

  unwatch(projectId: string): void {
    const state = this.watched.get(projectId);
    if (!state) return;
    for (const w of state.watchers) w.close();
    for (const t of state.timers.values()) clearTimeout(t);
    this.watched.delete(projectId);
  }

  closeAll(): void {
    for (const id of [...this.watched.keys()]) this.unwatch(id);
  }
}
