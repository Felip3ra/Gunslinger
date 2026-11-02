import type { StateCreator } from 'zustand';
import type { TestRunResult, TestTarget } from '@shared/test-results';

export interface TestRunState {
  runId: string | null;
  projectId: string;
  target: TestTarget;
  running: boolean;
  output: string;
  result: TestRunResult | null;
  error: string | null;
  cancelled: boolean;
}

/** Executor de testes: painel aberto e a execução atual. */
export interface TestsSlice {
  testsOpen: boolean;
  testRun: TestRunState | null;
}

export const createTestsSlice: StateCreator<TestsSlice, [], [], TestsSlice> = () => ({
  testsOpen: false,
  testRun: null,
});

/** Saída bruta guardada no painel: só as últimas linhas. */
export const MAX_OUTPUT_LINES = 2000;

export function appendOutput(current: string, data: string): string {
  const next = current + data;
  const lines = next.split('\n');
  return lines.length > MAX_OUTPUT_LINES ? lines.slice(-MAX_OUTPUT_LINES).join('\n') : next;
}
