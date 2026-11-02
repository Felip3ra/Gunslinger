import type { CommandsFile, SavedCommand, VariableDef } from './model';
import { extractVariables } from './variables';

export const NO_CATEGORY = 'Sem categoria';

export function upsertCommand(file: CommandsFile, command: SavedCommand): CommandsFile {
  const exists = file.commands.some((c) => c.id === command.id);
  return {
    ...file,
    commands: exists ? file.commands.map((c) => (c.id === command.id ? command : c)) : [...file.commands, command],
  };
}

export function deleteCommand(file: CommandsFile, id: string): CommandsFile {
  if (!file.commands.some((c) => c.id === id)) throw new Error('Comando não encontrado');
  return { ...file, commands: file.commands.filter((c) => c.id !== id) };
}

/** Renomeia a categoria em todos os comandos; categorias só existem enquanto têm comandos. */
export function renameCategory(file: CommandsFile, from: string, to: string): CommandsFile {
  const target = to.trim();
  return { ...file, commands: file.commands.map((c) => (c.category === from ? { ...c, category: target } : c)) };
}

/** Comandos de um projeto ficam fora da lista global (aparecem na seção do projeto). */
export function globalCommands(commands: SavedCommand[]): SavedCommand[] {
  return commands.filter((c) => c.projectId === null);
}

export interface CategoryGroup {
  category: string;
  label: string;
  commands: SavedCommand[];
}

/** Agrupa por categoria em ordem alfabética, com "Sem categoria" por último. */
export function groupByCategory(commands: SavedCommand[]): CategoryGroup[] {
  const groups = new Map<string, SavedCommand[]>();
  for (const c of commands) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR')))
    .map(([category, list]) => ({
      category,
      label: category || NO_CATEGORY,
      commands: [...list].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
    }));
}

/** Mantém as definições das variáveis presentes no texto e cria as que faltam. */
export function syncVariableDefs(command: string, defs: Record<string, VariableDef>): Record<string, VariableDef> {
  const result: Record<string, VariableDef> = {};
  for (const name of extractVariables(command)) result[name] = defs[name] ?? { options: [] };
  return result;
}

export function duplicateCommand(command: SavedCommand, newId: string, existingNames: string[]): SavedCommand {
  let name = `${command.name} (cópia)`;
  for (let n = 2; existingNames.includes(name); n++) name = `${command.name} (cópia ${n})`;
  return { ...command, id: newId, name };
}
