import type { WorkspaceLayout } from '@shared/model';

/**
 * Guarda as abas abertas para a próxima abertura. Durante o fechamento do app as abas vão sendo
 * encerradas e o renderer manda listas cada vez menores; `freeze` preserva a última antes disso.
 */
export class LastSession {
  private frozen = false;

  constructor(private readonly write: (tabs: WorkspaceLayout[]) => Promise<void>) {}

  async save(tabs: WorkspaceLayout[]): Promise<void> {
    if (!this.frozen) await this.write(tabs);
  }

  freeze(): void {
    this.frozen = true;
  }
}
