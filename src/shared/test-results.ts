export type TestOutcome = 'passed' | 'failed' | 'skipped';

export interface TestCaseResult {
  /** Nome completo (FullyQualifiedName no .NET, "describe > teste" no Node). */
  name: string;
  /** Nome usado para filtrar a reexecução. */
  filterName: string;
  outcome: TestOutcome;
  durationMs: number;
  message: string | null;
  stack: string | null;
}

export interface TestRunResult {
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestCaseResult[];
}

export type TestTarget = { kind: 'dotnet'; project: string } | { kind: 'node'; dir: string; framework: 'vitest' | 'jest' };

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : null;
}

/** "00:00:01.5000000" → 1500 ms. */
function parseTimeSpan(value: string | null): number {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value ?? '');
  if (!m) return 0;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
}

const OUTCOMES: Record<string, TestOutcome> = { Passed: 'passed', Failed: 'failed', NotExecuted: 'skipped', Skipped: 'skipped' };

function summarize(tests: TestCaseResult[]): TestRunResult {
  return {
    passed: tests.filter((t) => t.outcome === 'passed').length,
    failed: tests.filter((t) => t.outcome === 'failed').length,
    skipped: tests.filter((t) => t.outcome === 'skipped').length,
    durationMs: tests.reduce((sum, t) => sum + t.durationMs, 0),
    tests,
  };
}

/** Lê um arquivo .trx do `dotnet test --logger trx`. */
export function parseTrx(xml: string): TestRunResult {
  const tests: TestCaseResult[] = [];
  const re = /<UnitTestResult\b([^>]*?)(\/>|>([\s\S]*?)<\/UnitTestResult>)/g;
  for (const m of xml.matchAll(re)) {
    const tag = m[1]!;
    const body = m[3] ?? '';
    const name = attr(tag, 'testName') ?? '(sem nome)';
    const message = /<Message>([\s\S]*?)<\/Message>/.exec(body)?.[1];
    const stack = /<StackTrace>([\s\S]*?)<\/StackTrace>/.exec(body)?.[1];
    tests.push({
      name,
      filterName: name,
      outcome: OUTCOMES[attr(tag, 'outcome') ?? ''] ?? 'skipped',
      durationMs: parseTimeSpan(attr(tag, 'duration')),
      message: message ? decodeXml(message) : null,
      stack: stack ? decodeXml(stack) : null,
    });
  }
  return summarize(tests);
}

interface JestAssertion {
  fullName?: string;
  title?: string;
  status?: string;
  duration?: number | null;
  failureMessages?: string[];
}

/** Lê o JSON do Jest (`--json`) ou do Vitest (`--reporter=json`), que usam o mesmo formato. */
export function parseJestJson(json: string): TestRunResult {
  const data = JSON.parse(json) as { testResults?: { assertionResults?: JestAssertion[] }[] };
  const tests: TestCaseResult[] = [];
  for (const file of data.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      const failure = a.failureMessages?.join('\n').trim() || null;
      const [message, ...stack] = (failure ?? '').split('\n');
      tests.push({
        name: a.fullName ?? a.title ?? '(sem nome)',
        filterName: a.title ?? a.fullName ?? '',
        outcome: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped',
        durationMs: Math.round(a.duration ?? 0),
        message: failure ? (message ?? null) : null,
        stack: failure && stack.length > 0 ? stack.join('\n') : null,
      });
    }
  }
  return summarize(tests);
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Argumento de filtro para reexecutar só os testes informados. */
export function filterArgs(target: TestTarget, names: string[]): string[] {
  if (names.length === 0) return [];
  if (target.kind === 'dotnet') return ['--filter', names.map((n) => `FullyQualifiedName=${n}`).join('|')];
  return ['-t', `^(${names.map(escapeRegex).join('|')})$`];
}
