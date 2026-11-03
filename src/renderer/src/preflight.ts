import type { ToolName } from '@shared/ipc-contract';
import type { ShellProfile } from '@shared/model';
import type { RunnableCommand } from '@shared/runnable';
import { reloadEnvironment } from './actions';
import { api } from './api';
import { askDialog, useStore } from './store';

const TOOL_LABEL: Record<ToolName, string> = {
  dotnet: '.NET SDK',
  'dotnet-ef': 'dotnet-ef',
  node: 'Node.js',
  npm: 'npm',
  yarn: 'yarn',
  pnpm: 'pnpm',
  bun: 'Bun',
};

const HINTS: Partial<Record<ToolName, string>> = {
  yarn: 'Sugestão: corepack enable  ou  npm install -g yarn',
  pnpm: 'Sugestão: corepack enable  ou  npm install -g pnpm',
  bun: 'Sugestão: winget install Oven-sh.Bun  ou  npm install -g bun',
};

/** Comando instalado pelo botão "Instalar" (só roda depois do clique). */
export const DOTNET_EF_INSTALL = 'dotnet tool install --global dotnet-ef';

/** Positivos ficam em cache por geração do ambiente; negativos são verificados de novo a cada vez. */
const found = new Map<string, true>();

async function check(tool: ToolName, cwd: string): Promise<boolean> {
  const generation = useStore.getState().envGeneration;
  const cacheKey = `${generation}|${tool}|${tool === 'dotnet-ef' ? cwd : ''}`;
  if (found.has(cacheKey)) return true;
  try {
    const status = await api.invoke('tools:check', { tool, cwd });
    if (status.found) found.set(cacheKey, true);
    return status.found;
  } catch {
    return true; // verificação indisponível: não atrapalha a execução
  }
}

/**
 * Verifica as ferramentas do comando. Nunca bloqueia: se algo faltar, o usuário escolhe entre
 * executar mesmo assim, recarregar o ambiente, instalar (dotnet-ef) ou cancelar.
 * Devolve true quando o comando deve seguir.
 */
export async function runPreflight(command: RunnableCommand, _profile: ShellProfile, onInstallDotnetEf?: () => void): Promise<boolean> {
  const cwd = command.cwd ?? useStore.getState().config?.dataDir ?? '.';
  const missing: ToolName[] = [];
  for (const tool of command.preflight) {
    // Sem SDK, nem adianta checar o dotnet-ef.
    if (tool === 'dotnet-ef' && missing.includes('dotnet')) continue;
    if (!(await check(tool, cwd))) missing.push(tool);
  }
  if (missing.length === 0) return true;

  const sdkMissing = missing.includes('dotnet');
  const efMissing = missing.includes('dotnet-ef') && !sdkMissing;
  const lines = missing.map((t) => `${TOOL_LABEL[t]} não encontrado${t === 'node' ? ' no PATH' : ''}.`);
  const hints = missing.map((t) => HINTS[t]).filter(Boolean);
  const choice = await askDialog({
    title: 'Ferramenta não encontrada',
    message: lines.join(' '),
    ...(hints.length || efMissing ? { detail: [...hints, ...(efMissing ? [`Instalar com: ${DOTNET_EF_INSTALL}`] : [])].join('\n') } : {}),
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Recarregar ambiente', value: 'reload' },
      ...(efMissing && onInstallDotnetEf ? [{ label: 'Instalar', value: 'install' }] : []),
      { label: 'Executar mesmo assim', value: 'run', primary: true },
    ],
  });
  if (choice === 'reload') {
    await reloadEnvironment();
    return false;
  }
  if (choice === 'install') {
    onInstallDotnetEf?.();
    return false;
  }
  return choice === 'run';
}
