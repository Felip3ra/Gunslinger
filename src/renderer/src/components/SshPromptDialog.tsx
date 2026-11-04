import { useEffect, useState } from 'react';
import type { SshAnswer, SshPromptEvent } from '@shared/ssh';
import { answerSshPrompt } from '../ssh';
import { useStore } from '../store';

function where(host: string, port: number): string {
  const h = host.includes(':') ? `[${host}]` : host;
  return port === 22 ? h : `${h}:${port}`;
}

function Fingerprint({ keyType, fingerprint, label }: { keyType: string; fingerprint: string; label?: string }): JSX.Element {
  return (
    <div className="fingerprint">
      {label && <small>{label}</small>}
      <code data-testid="ssh-fingerprint">
        {keyType} {fingerprint}
      </code>
    </div>
  );
}

/** Uma pergunta da conexão SSH por vez; Esc cancela. Nada é gravado sem "Salvar no keychain". */
function PromptBody({ event, secretsAvailable }: { event: SshPromptEvent; secretsAvailable: boolean }): JSX.Element {
  const { prompt, target, promptId } = event;
  const [values, setValues] = useState<string[]>([]);
  const [save, setSave] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const answer = (a: SshAnswer): void => void answerSshPrompt(promptId, a);
  const cancel = (): void => answer({ kind: 'cancel' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId]);

  const saveBox = (canSave: boolean, label = 'Salvar no keychain'): JSX.Element | null =>
    canSave ? (
      <label className="checkline" title={secretsAvailable ? undefined : 'O cofre do sistema não está disponível'}>
        <input type="checkbox" checked={save} disabled={!secretsAvailable} onChange={(e) => setSave(e.target.checked)} data-testid="ssh-save-secret" />
        {label}
      </label>
    ) : null;

  switch (prompt.kind) {
    case 'hostKey-new':
      return (
        <>
          <h2>Host novo: {where(prompt.host, prompt.port)}</h2>
          <p>É a primeira conexão a este servidor. Confira se o fingerprint é o esperado antes de continuar.</p>
          <Fingerprint keyType={prompt.keyType} fingerprint={prompt.fingerprint} />
          <div className="modal-actions">
            <button onClick={cancel}>Cancelar</button>
            <button onClick={() => answer({ kind: 'hostKey', decision: 'once' })}>Conectar só desta vez</button>
            <button className="primary" autoFocus onClick={() => answer({ kind: 'hostKey', decision: 'trust' })}>
              Confiar e conectar
            </button>
          </div>
        </>
      );
    case 'hostKey-changed':
      return (
        <>
          <h2 className="danger-text">⚠ A chave do servidor mudou</h2>
          <p>
            A chave apresentada por <strong>{where(prompt.host, prompt.port)}</strong> é diferente da gravada. Pode ser uma reinstalação do servidor, mas também
            pode ser alguém se passando por ele. Nenhuma credencial foi enviada.
          </p>
          {prompt.previous.map((fp) => (
            <Fingerprint key={fp} keyType={prompt.keyType} fingerprint={fp} label="Gravada" />
          ))}
          <Fingerprint keyType={prompt.keyType} fingerprint={prompt.fingerprint} label="Apresentada agora" />
          {confirmReplace && <p className="warn-text">Só substitua se você sabe por que a chave mudou (por exemplo, confirmou com quem administra o servidor).</p>}
          <div className="modal-actions">
            <button className="primary" autoFocus onClick={cancel}>
              Cancelar
            </button>
            {confirmReplace ? (
              <button className="danger" onClick={() => answer({ kind: 'hostKey', decision: 'replace' })} data-testid="ssh-replace-confirm">
                Substituir e conectar
              </button>
            ) : (
              <button className="danger" onClick={() => setConfirmReplace(true)}>
                Substituir a chave gravada…
              </button>
            )}
          </div>
        </>
      );
    case 'hostKey-revoked':
      return (
        <>
          <h2 className="danger-text">Chave revogada</h2>
          <p>A chave apresentada por {where(prompt.host, prompt.port)} está marcada como revogada. A conexão foi bloqueada.</p>
          <Fingerprint keyType={prompt.keyType} fingerprint={prompt.fingerprint} />
          <div className="modal-actions">
            <button className="primary" autoFocus onClick={cancel}>
              Fechar
            </button>
          </div>
        </>
      );
    case 'username':
    case 'password':
    case 'passphrase': {
      const title = prompt.kind === 'username' ? `Usuário para ${target}` : prompt.kind === 'password' ? `Senha de ${prompt.username}@${target.replace(/^[^@]*@/, '')}` : `Frase-senha da chave "${prompt.keyName}"`;
      const retry = prompt.kind !== 'username' && prompt.retry;
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            answer({ kind: 'text', value: values[0] ?? '', save: prompt.kind !== 'username' && save });
          }}
        >
          <h2>{title}</h2>
          {retry && <p className="warn-text">{prompt.kind === 'password' ? 'Senha recusada. Tente de novo.' : 'Frase-senha incorreta. Tente de novo.'}</p>}
          <label className="field">
            <span>{prompt.kind === 'username' ? 'Usuário' : prompt.kind === 'password' ? 'Senha' : 'Frase-senha'}</span>
            <input
              autoFocus
              type={prompt.kind === 'username' ? 'text' : 'password'}
              autoComplete="off"
              value={values[0] ?? ''}
              onChange={(e) => setValues([e.target.value])}
              data-testid="ssh-prompt-input"
            />
          </label>
          {prompt.kind !== 'username' && saveBox(prompt.canSave, prompt.kind === 'passphrase' ? 'Salvar frase-senha no keychain' : 'Salvar no keychain')}
          <div className="modal-actions">
            <button type="button" onClick={cancel}>
              Cancelar
            </button>
            <button type="submit" className="primary" disabled={prompt.kind === 'username' && !(values[0] ?? '').trim()}>
              Continuar
            </button>
          </div>
        </form>
      );
    }
    case 'keyboard-interactive':
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            answer({ kind: 'responses', values: prompt.prompts.map((_, i) => values[i] ?? ''), save });
          }}
        >
          <h2>{prompt.name || `Autenticação em ${target}`}</h2>
          {prompt.instructions && <p>{prompt.instructions}</p>}
          {prompt.prompts.map((p, i) => (
            <label key={`${i}-${p.prompt}`} className="field">
              <span>{p.prompt.replace(/:\s*$/, '')}</span>
              <input
                autoFocus={i === 0}
                type={p.echo ? 'text' : 'password'}
                autoComplete="off"
                value={values[i] ?? ''}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = e.target.value;
                  setValues(next);
                }}
                data-testid="ssh-prompt-input"
              />
            </label>
          ))}
          {saveBox(prompt.canSave)}
          <div className="modal-actions">
            <button type="button" onClick={cancel}>
              Cancelar
            </button>
            <button type="submit" className="primary">
              Continuar
            </button>
          </div>
        </form>
      );
  }
}

export function SshPromptDialog(): JSX.Element | null {
  const event = useStore((s) => s.sshPrompts[0]);
  const secretsAvailable = useStore((s) => s.keychain?.secretsAvailable ?? false);
  if (!event) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Conexão SSH" data-testid="ssh-prompt" data-kind={event.prompt.kind}>
        {/* key: estado novo (campos vazios) a cada pergunta */}
        <PromptBody key={event.promptId} event={event} secretsAvailable={secretsAvailable} />
      </div>
    </div>
  );
}
