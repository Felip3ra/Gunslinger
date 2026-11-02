import { describe, expect, it } from 'vitest';
import { filterArgs, parseJestJson, parseTrx } from './test-results';

const trx = `<?xml version="1.0" encoding="utf-8"?>
<TestRun><Results>
<UnitTestResult executionId="1" testName="t.UnitTest1.Falha" duration="00:00:00.0024828" outcome="Failed"><Output><ErrorInfo><Message>Assert.Equal() Failure: Values differ&#xD;
Expected: 1&#xD;
Actual:   2</Message><StackTrace>   at t.UnitTest1.Falha() in C:\\src\\UnitTest1.cs:line 5&#xD;
   at System.Reflection.MethodBaseInvoker</StackTrace></ErrorInfo></Output></UnitTestResult>
<UnitTestResult executionId="2" testName="t.UnitTest1.Passa" duration="00:00:00.1058509" outcome="Passed" />
<UnitTestResult executionId="3" testName="t.UnitTest1.Pula &amp; volta" duration="00:00:00" outcome="NotExecuted" />
</Results></TestRun>`;

describe('parseTrx', () => {
  it('lê resultados, mensagens e stack', () => {
    const r = parseTrx(trx);
    expect([r.passed, r.failed, r.skipped]).toEqual([1, 1, 1]);
    const fail = r.tests[0]!;
    expect(fail).toMatchObject({ name: 't.UnitTest1.Falha', outcome: 'failed', durationMs: 2 });
    expect(fail.message).toBe('Assert.Equal() Failure: Values differ\nExpected: 1\nActual:   2');
    expect(fail.stack).toContain('UnitTest1.cs:line 5');
    expect(r.tests[2]!.name).toBe('t.UnitTest1.Pula & volta');
  });
});

describe('parseJestJson', () => {
  it('lê o formato do Jest/Vitest', () => {
    const json = JSON.stringify({
      testResults: [
        {
          assertionResults: [
            { fullName: 'soma > dois mais dois', title: 'dois mais dois', status: 'passed', duration: 3.2 },
            { fullName: 'soma > quebra', title: 'quebra', status: 'failed', duration: 1, failureMessages: ['AssertionError: expected 1 to be 2\n    at src/soma.test.ts:8:13'] },
            { fullName: 'soma > depois', title: 'depois', status: 'skipped' },
          ],
        },
      ],
    });
    const r = parseJestJson(json);
    expect([r.passed, r.failed, r.skipped]).toEqual([1, 1, 1]);
    expect(r.tests[1]).toMatchObject({ filterName: 'quebra', message: 'AssertionError: expected 1 to be 2', stack: '    at src/soma.test.ts:8:13' });
  });
});

describe('filterArgs', () => {
  it('filtra por nome no .NET e por regex exata no Node', () => {
    expect(filterArgs({ kind: 'dotnet', project: 'a.csproj' }, ['t.A.B', 't.A.C'])).toEqual(['--filter', 'FullyQualifiedName=t.A.B|FullyQualifiedName=t.A.C']);
    expect(filterArgs({ kind: 'node', dir: '', framework: 'vitest' }, ['soma (2)'])).toEqual(['-t', '^(soma \\(2\\))$']);
    expect(filterArgs({ kind: 'node', dir: '', framework: 'jest' }, [])).toEqual([]);
  });
});
