import { describe, expect, it } from 'vitest';
import { deleteCommand, duplicateCommand, globalCommands, groupByCategory, renameCategory, syncVariableDefs, upsertCommand } from './commands';
import type { SavedCommand } from './model';

const cmd = (id: string, name: string, category: string, extra: Partial<SavedCommand> = {}): SavedCommand => ({
  id,
  name,
  command: 'echo',
  description: '',
  category,
  targetProfileId: null,
  cwd: null,
  projectId: null,
  variables: {},
  ...extra,
});

describe('comandos salvos', () => {
  const file = { version: 1 as const, commands: [cmd('1', 'Status', 'Git'), cmd('2', 'Nova migration', 'EF'), cmd('3', 'Solto', '')] };

  it('insere e atualiza pelo id', () => {
    const added = upsertCommand(file, cmd('4', 'Log', 'Git'));
    expect(added.commands).toHaveLength(4);
    const updated = upsertCommand(added, cmd('4', 'Log curto', 'Git'));
    expect(updated.commands.find((c) => c.id === '4')?.name).toBe('Log curto');
  });

  it('exclui e acusa id inexistente', () => {
    expect(deleteCommand(file, '1').commands.map((c) => c.id)).toEqual(['2', '3']);
    expect(() => deleteCommand(file, 'x')).toThrow();
  });

  it('renomear categoria move todos os comandos e a antiga deixa de existir', () => {
    const renamed = renameCategory({ ...file, commands: [...file.commands, cmd('5', 'Remover', 'EF')] }, 'EF', 'Entity Framework');
    const groups = groupByCategory(renamed.commands);
    expect(groups.map((g) => g.label)).toEqual(['Entity Framework', 'Git', 'Sem categoria']);
    expect(groups[0]!.commands).toHaveLength(2);
  });

  it('comandos de projeto ficam fora da lista global', () => {
    expect(globalCommands([cmd('1', 'a', ''), cmd('2', 'b', '', { projectId: 'p' })]).map((c) => c.id)).toEqual(['1']);
  });

  it('sincroniza definições de variáveis com o texto', () => {
    expect(syncVariableDefs('git checkout {branch} {x}', { branch: { default: 'main', options: [] }, velha: { options: [] } })).toEqual({
      branch: { default: 'main', options: [] },
      x: { options: [] },
    });
  });

  it('duplica com nome único', () => {
    expect(duplicateCommand(cmd('1', 'Status', 'Git'), '9', ['Status (cópia)']).name).toBe('Status (cópia 2)');
  });
});
