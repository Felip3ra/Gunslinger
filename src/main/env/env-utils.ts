export type Env = Record<string, string>;

/** Procura uma variável sem diferenciar maiúsculas (no Windows, "Path" e "PATH" são a mesma). */
export function findKey(env: Env, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(env).find((k) => k.toLowerCase() === lower);
}

export function getVar(env: Env, name: string): string | undefined {
  const key = findKey(env, name);
  return key === undefined ? undefined : env[key];
}

/** Define a variável preservando a grafia já existente da chave. */
export function setVar(env: Env, name: string, value: string): void {
  const key = findKey(env, name) ?? name;
  env[key] = value;
}

/** Expande %VAR% (estilo Windows); variáveis desconhecidas ficam como estão. */
export function expandWindowsVars(value: string, env: Env): string {
  return value.replace(/%([^%;=]+)%/g, (whole, name: string) => getVar(env, name) ?? whole);
}

export function fromProcessEnv(source: NodeJS.ProcessEnv): Env {
  const env: Env = {};
  for (const [k, v] of Object.entries(source)) if (v !== undefined) env[k] = v;
  return env;
}
