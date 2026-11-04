import { useState } from 'react';
import type { PublicIdentity, PublicSshKey, SecretState } from '@shared/model';
import { api } from '../api';
import { askDialog, confirmDialog, useStore } from '../store';

const SECRET_TEXT: Record<SecretState, string> = { none: 'não salva', saved: 'salva', unavailable: 'indisponível neste computador' };

function notify(result: { ok: true } | { ok: false; error: string } | null, success?: string): boolean {
  if (!result) return false;
  if (!result.ok) useStore.getState().pushNotice('error', result.error);
  else if (success) useStore.getState().pushNotice('info', success);
  return result.ok;
}

/** Pergunta de exclusão com a lista de quem usa a chave ou identidade. */
async function confirmDelete(kind: 'key' | 'identity', id: string, name: string): Promise<void> {
  const usage = await api.invoke('keychain:usage', { kind, id });
  const users = [...usage.hosts.map((h) => `host ${h}`), ...usage.groups.map((g) => `grupo ${g}`), ...usage.identities.map((i) => `identidade ${i}`)];
  const ok =
    users.length === 0
      ? await confirmDialog(kind === 'key' ? 'Excluir chave' : 'Excluir identidade', `Excluir "${name}"?`, 'Excluir')
      : (await askDialog({
          title: kind === 'key' ? 'Excluir chave em uso' : 'Excluir identidade em uso',
          message: `"${name}" é usada por ${users.length} item(ns). Eles vão passar a herdar do grupo ou pedir a credencial ao conectar.`,
          detail: users.join('\n'),
          buttons: [
            { label: 'Cancelar', value: 'cancel' },
            { label: 'Excluir', value: 'ok', primary: true },
          ],
        })) === 'ok';
  if (ok) notify(await api.invoke('keychain:delete', { kind, id }));
}

function KeyRow({ k }: { k: PublicSshKey }): JSX.Element {
  return (
    <li data-testid="keychain-key">
      <div>
        <strong>{k.name}</strong>
        <small>
          {k.type.toUpperCase()} · {k.fingerprint}
        </small>
        <small>
          {k.source === 'file' ? `Arquivo: ${k.filePath}` : `Guardada no keychain (${SECRET_TEXT[k.privateKey]})`}
          {k.encrypted && ` · frase-senha ${SECRET_TEXT[k.passphrase]}`}
        </small>
      </div>
      <div className="row-actions">
        <button onClick={async () => notify(await api.invoke('keychain:copyPublicKey', { keyId: k.id }), 'Chave pública copiada.')}>Copiar pública</button>
        <button onClick={async () => notify(await api.invoke('keychain:exportKey', { keyId: k.id, which: 'public' }), 'Chave pública exportada.')}>Exportar pública</button>
        <button onClick={async () => notify(await api.invoke('keychain:exportKey', { keyId: k.id, which: 'private' }), 'Chave privada exportada.')}>Exportar privada</button>
        {k.encrypted && k.passphrase !== 'none' && (
          <button onClick={async () => notify(await api.invoke('keychain:setKeyPassphrase', { keyId: k.id, passphrase: null }), 'Frase-senha apagada.')}>Apagar frase-senha</button>
        )}
        <button onClick={() => void confirmDelete('key', k.id, k.name)}>Excluir</button>
      </div>
    </li>
  );
}

function ImportKeyForm({ onDone }: { onDone(): void }): JSX.Element {
  const [mode, setMode] = useState<'file-copy' | 'file-reference' | 'text'>('file-copy');
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [text, setText] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [savePassphrase, setSavePassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const source = mode === 'text' ? ({ kind: 'text', text } as const) : ({ kind: 'file', path, mode: mode === 'file-copy' ? 'copy' : 'reference' } as const);
    const keyName = name.trim() || (mode === 'text' ? 'Chave colada' : path.split(/[\\/]/).pop() || 'Chave');
    const result = await api.invoke('keychain:importKey', { name: keyName, source, ...(passphrase ? { passphrase } : {}), savePassphrase });
    if (result.ok) return onDone();
    setError(result.error);
    if (result.needsPassphrase) setNeedsPassphrase(true);
  };

  return (
    <form
      className="keychain-form"
      data-testid="import-key-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="field">
        <span>Origem</span>
        <select aria-label="Origem da chave" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="file-copy">Arquivo (guardar uma cópia cifrada no keychain)</option>
          <option value="file-reference">Arquivo (usar o arquivo do disco a cada conexão)</option>
          <option value="text">Colar o texto da chave</option>
        </select>
      </label>
      {mode === 'text' ? (
        <label className="field">
          <span>Chave privada</span>
          <textarea aria-label="Chave privada" rows={6} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
        </label>
      ) : (
        <label className="field">
          <span>Arquivo</span>
          <div className="input-with-button">
            <input aria-label="Arquivo da chave" value={path} onChange={(e) => setPath(e.target.value)} />
            <button
              type="button"
              onClick={async () => {
                const picked = await api.invoke('keychain:pickKeyFile');
                if (picked) setPath(picked);
              }}
            >
              Escolher…
            </button>
          </div>
        </label>
      )}
      <div className="field-row">
        <label className="field">
          <span>Nome</span>
          <input aria-label="Nome da chave" value={name} onChange={(e) => setName(e.target.value)} placeholder="deploy-ed25519" />
        </label>
        {needsPassphrase && (
          <label className="field">
            <span>Frase-senha</span>
            <input autoFocus type="password" aria-label="Frase-senha" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
        )}
      </div>
      {needsPassphrase && (
        <label className="checkline">
          <input type="checkbox" checked={savePassphrase} onChange={(e) => setSavePassphrase(e.target.checked)} />
          Salvar frase-senha
        </label>
      )}
      {error && <p className="field-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={mode === 'text' ? !text.trim() : !path.trim()}>
          Importar
        </button>
      </div>
    </form>
  );
}

function GenerateKeyForm({ onDone }: { onDone(): void }): JSX.Element {
  const [name, setName] = useState('');
  const [type, setType] = useState<'ed25519' | 'rsa'>('ed25519');
  const [passphrase, setPassphrase] = useState('');
  const [savePassphrase, setSavePassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="keychain-form"
      data-testid="generate-key-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const result = await api.invoke('keychain:generateKey', { name: name.trim(), type, ...(passphrase ? { passphrase } : {}), savePassphrase: !!passphrase && savePassphrase });
        setBusy(false);
        if (result.ok) onDone();
        else setError(result.error);
      }}
    >
      <div className="field-row">
        <label className="field">
          <span>Nome *</span>
          <input autoFocus aria-label="Nome da chave" value={name} onChange={(e) => setName(e.target.value)} placeholder="laptop" />
        </label>
        <label className="field">
          <span>Tipo</span>
          <select aria-label="Tipo da chave" value={type} onChange={(e) => setType(e.target.value as 'ed25519' | 'rsa')}>
            <option value="ed25519">Ed25519 (recomendado)</option>
            <option value="rsa">RSA 4096</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Frase-senha (opcional)</span>
        <input type="password" aria-label="Frase-senha" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
      </label>
      {passphrase && (
        <label className="checkline">
          <input type="checkbox" checked={savePassphrase} onChange={(e) => setSavePassphrase(e.target.checked)} />
          Salvar frase-senha
        </label>
      )}
      {error && <p className="field-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={!name.trim() || busy}>
          {busy ? 'Gerando…' : 'Gerar'}
        </button>
      </div>
    </form>
  );
}

function IdentityForm({ initial, onDone }: { initial: PublicIdentity | null; onDone(): void }): JSX.Element {
  const keys = useStore((s) => s.keychain?.keys ?? []);
  const [name, setName] = useState(initial?.name ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [keyId, setKeyId] = useState(initial?.keyId ?? '');
  const [password, setPassword] = useState<{ action: 'keep' } | { action: 'set'; value: string } | { action: 'clear' }>({ action: 'keep' });
  const [error, setError] = useState<string | null>(null);
  const hasSaved = initial?.password === 'saved' || initial?.password === 'unavailable';

  return (
    <form
      className="keychain-form"
      data-testid="identity-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await api.invoke('keychain:saveIdentity', {
          ...(initial ? { id: initial.id } : {}),
          name: name.trim() || username.trim(),
          username: username.trim(),
          keyId: keyId || null,
          password: password.action === 'set' && !password.value ? { action: 'keep' } : password,
        });
        if (result.ok) onDone();
        else setError(result.error);
      }}
    >
      <div className="field-row">
        <label className="field">
          <span>Nome</span>
          <input autoFocus aria-label="Nome da identidade" value={name} onChange={(e) => setName(e.target.value)} placeholder="deploy" />
        </label>
        <label className="field">
          <span>Usuário *</span>
          <input aria-label="Usuário da identidade" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Chave</span>
        <select aria-label="Chave da identidade" value={keyId} onChange={(e) => setKeyId(e.target.value)}>
          <option value="">Nenhuma</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Senha</span>
        {hasSaved && password.action === 'keep' ? (
          <div className="row-actions" data-testid="saved-password">
            <span>{initial?.password === 'saved' ? 'Senha salva' : 'Senha indisponível neste computador'}</span>
            <button type="button" onClick={() => setPassword({ action: 'set', value: '' })}>
              Substituir
            </button>
            <button type="button" onClick={() => setPassword({ action: 'clear' })}>
              Apagar
            </button>
          </div>
        ) : password.action === 'clear' ? (
          <div className="row-actions">
            <span>A senha será apagada ao salvar.</span>
            <button type="button" onClick={() => setPassword({ action: 'keep' })}>
              Desfazer
            </button>
          </div>
        ) : (
          <input
            type="password"
            aria-label="Senha da identidade"
            autoComplete="off"
            placeholder={hasSaved ? 'Nova senha' : 'Opcional: será pedida ao conectar se ficar vazia'}
            value={password.action === 'set' ? password.value : ''}
            onChange={(e) => setPassword({ action: 'set', value: e.target.value })}
          />
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={!username.trim()}>
          Salvar
        </button>
      </div>
    </form>
  );
}

/** Chaves e identidades. Nada aqui mostra segredos: só se eles existem. */
export function KeychainDialog(): JSX.Element | null {
  const open = useStore((s) => s.keychainOpen);
  const keychain = useStore((s) => s.keychain);
  const [form, setForm] = useState<'import' | 'generate' | 'identity' | PublicIdentity | null>(null);
  if (!open || !keychain) return null;
  const close = (): void => {
    setForm(null);
    useStore.setState({ keychainOpen: false });
  };
  const done = (): void => setForm(null);

  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="keychain-title" data-testid="keychain">
        <h2 id="keychain-title">Keychain</h2>
        {!keychain.secretsAvailable && <p className="warn-text">O cofre do sistema não está disponível: senhas, frases-senha e chaves não podem ser salvas.</p>}
        <section>
          <header className="group-header">
            <strong>Chaves</strong>
            <span className="row-actions">
              <button onClick={() => setForm('import')}>Importar</button>
              <button onClick={() => setForm('generate')}>Gerar</button>
            </span>
          </header>
          {form === 'import' && <ImportKeyForm onDone={done} />}
          {form === 'generate' && <GenerateKeyForm onDone={done} />}
          {keychain.keys.length === 0 && !form && <p className="empty">Nenhuma chave.</p>}
          <ul className="project-list">
            {keychain.keys.map((k) => (
              <KeyRow key={k.id} k={k} />
            ))}
          </ul>
        </section>
        <section>
          <header className="group-header">
            <strong>Identidades</strong>
            <button onClick={() => setForm('identity')}>Nova identidade</button>
          </header>
          {form === 'identity' && <IdentityForm initial={null} onDone={done} />}
          {keychain.identities.length === 0 && form !== 'identity' && <p className="empty">Nenhuma identidade.</p>}
          <ul className="project-list">
            {keychain.identities.map((i) =>
              typeof form === 'object' && form?.id === i.id ? (
                <li key={i.id}>
                  <IdentityForm initial={i} onDone={done} />
                </li>
              ) : (
                <li key={i.id} data-testid="keychain-identity">
                  <div>
                    <strong>{i.name}</strong>
                    <small>
                      {i.username}
                      {i.keyId && ` · chave ${keychain.keys.find((k) => k.id === i.keyId)?.name ?? '?'}`} · senha {SECRET_TEXT[i.password]}
                    </small>
                  </div>
                  <div className="row-actions">
                    <button onClick={() => setForm(i)}>Editar</button>
                    <button onClick={() => void confirmDelete('identity', i.id, i.name)}>Excluir</button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
        <div className="modal-actions">
          <button className="primary" onClick={close}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
