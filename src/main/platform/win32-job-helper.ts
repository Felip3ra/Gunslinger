import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { getVar, type Env } from '../env/env-utils';
import type { HelperProcess } from './job-tracker';

/**
 * Auxiliar em PowerShell que cria um Job Object por aba e atribui o shell a ele: tudo o que o
 * shell iniciar herda o job, inclusive processos que saem da árvore. Sem KILL_ON_JOB_CLOSE:
 * o Gunslinger decide o que encerrar. O C# é compilado pelo Add-Type do PowerShell 5.1.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class GunslingerJobs {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool QueryInformationJobObject(IntPtr job, int infoClass, IntPtr info, int length, IntPtr returned);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr handle);
  static readonly Dictionary<string, IntPtr> jobs = new Dictionary<string, IntPtr>();

  public static string Track(string key, int pid) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) return "err create " + Marshal.GetLastWin32Error();
    // PROCESS_SET_QUOTA | PROCESS_TERMINATE
    IntPtr process = OpenProcess(0x0100 | 0x0001, false, pid);
    if (process == IntPtr.Zero) { CloseHandle(job); return "err open " + Marshal.GetLastWin32Error(); }
    bool ok = AssignProcessToJobObject(job, process);
    int error = Marshal.GetLastWin32Error();
    CloseHandle(process);
    if (!ok) { CloseHandle(job); return "err assign " + error; }
    jobs[key] = job;
    return "ok";
  }

  public static string Release(string key) {
    IntPtr job;
    if (!jobs.TryGetValue(key, out job)) return "";
    jobs.Remove(key);
    const int max = 4096;
    int size = 8 + max * IntPtr.Size;
    IntPtr buffer = Marshal.AllocHGlobal(size);
    List<string> parts = new List<string>();
    try {
      // JobObjectBasicProcessIdList: dois DWORD e depois um ULONG_PTR por processo vivo.
      if (QueryInformationJobObject(job, 3, buffer, size, IntPtr.Zero)) {
        int count = Marshal.ReadInt32(buffer, 4);
        for (int i = 0; i < count; i++) {
          long pid = IntPtr.Size == 8 ? Marshal.ReadInt64(buffer, 8 + i * 8) : Marshal.ReadInt32(buffer, 8 + i * 4);
          string name = "";
          try { name = Process.GetProcessById((int)pid).ProcessName; } catch { continue; }
          parts.Add(pid + ":" + name);
        }
      }
    } finally {
      Marshal.FreeHGlobal(buffer);
      CloseHandle(job);
    }
    return string.Join("\t", parts.ToArray());
  }
}
'@
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split(' ')
  $result = ''
  try {
    if ($parts[0] -eq 'track') { $result = [GunslingerJobs]::Track($parts[2], [int]$parts[3]) }
    elseif ($parts[0] -eq 'release') { $result = [GunslingerJobs]::Release($parts[2]) }
  } catch { $result = 'err ' + $_.Exception.Message }
  [Console]::Out.WriteLine($parts[1] + ' ' + $result)
  [Console]::Out.Flush()
}
`;

/** Inicia o auxiliar; ele termina sozinho quando o Gunslinger fecha (stdin encerrado). */
export function startJobHelper(env: Env): HelperProcess {
  const powershell = join(getVar(env, 'SystemRoot') ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const lines = createInterface({ input: child.stdout });
  return {
    write: (line) => {
      if (child.stdin.writable) child.stdin.write(line + '\n');
    },
    onLine: (listener) => void lines.on('line', listener),
    onExit: (listener) => {
      child.on('exit', listener);
      child.on('error', listener);
    },
    kill: () => {
      child.stdin.end();
      child.kill();
    },
  };
}
