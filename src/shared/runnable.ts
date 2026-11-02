import type { ToolName } from './ipc-contract';
import type { SavedCommand, VariableDef } from './model';

export type RunnableSource = 'saved' | 'ef' | 'node-script' | 'node-command' | 'launch';

/** Formato único de comando executável: painel, paleta e diálogo de variáveis só conhecem este tipo. */
export interface RunnableCommand {
  id: string;
  source: RunnableSource;
  title: string;
  /** Modelo com variáveis {nome}. */
  text: string;
  description: string;
  /** Categoria (comandos salvos) ou origem (pacote/grupo do projeto). */
  group: string;
  cwd: string | null;
  targetProfileId: string | null;
  projectId: string | null;
  variables: Record<string, VariableDef>;
  /** Pede confirmação com pré-visualização mesmo sem variáveis (ex.: migrations remove). */
  confirm: boolean;
  /** Ferramentas verificadas antes de executar (aviso, nunca bloqueio). */
  preflight: ToolName[];
  /** Comandos gerados que não podem rodar agora (ex.: EF sem projeto .NET ativo). */
  disabledReason?: string;
}

export function fromSavedCommand(c: SavedCommand): RunnableCommand {
  return {
    id: c.id,
    source: 'saved',
    title: c.name,
    text: c.command,
    description: c.description,
    group: c.category,
    cwd: c.cwd,
    targetProfileId: c.targetProfileId,
    projectId: c.projectId,
    variables: c.variables,
    confirm: false,
    preflight: [],
  };
}
