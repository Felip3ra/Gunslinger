import type { PackageManager } from './model';

export type NodeCommandKind = 'install' | 'add' | 'addDev' | 'npx';

export const NODE_COMMANDS: { kind: NodeCommandKind; title: string }[] = [
  { kind: 'install', title: 'Instalar dependências' },
  { kind: 'add', title: 'Adicionar pacote' },
  { kind: 'addDev', title: 'Adicionar pacote de desenvolvimento' },
  { kind: 'npx', title: 'Rodar npx' },
];

/** Modelo do comando pronto para o gerenciador (com variáveis {pacote}/{comando}). */
export function buildNodeCommand(kind: NodeCommandKind, pm: PackageManager, yarnBerry = false): string {
  switch (kind) {
    case 'install':
      return `${pm} install`;
    case 'add':
      return pm === 'npm' ? 'npm install {pacote}' : `${pm} add {pacote}`;
    case 'addDev':
      if (pm === 'bun') return 'bun add --dev {pacote}';
      return pm === 'npm' ? 'npm install -D {pacote}' : `${pm} add -D {pacote}`;
    case 'npx':
      if (pm === 'pnpm') return 'pnpm dlx {comando}';
      if (pm === 'bun') return 'bunx {comando}';
      if (pm === 'yarn' && yarnBerry) return 'yarn dlx {comando}';
      return 'npx {comando}';
  }
}

/** Comando que executa um script do package.json (nome entre aspas só quando precisa). */
export function buildRunScript(pm: PackageManager, script: string): string {
  const name = /^[\w:.@/-]+$/.test(script) ? script : `"${script.replace(/"/g, '\\"')}"`;
  return `${pm} run ${name}`;
}
