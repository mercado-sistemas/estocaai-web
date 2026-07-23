import { createRoot } from 'react-dom/client';
import HistoricoModal from './HistoricoModal.jsx';

// Ponte main.js (vanilla) → React, mesmo padrão das outras telas migradas.
let raizAtual = null;
let containerAtual = null;

export function abrirModalHistorico(ctx) {
  fecharModalHistorico();

  const container = document.createElement('div');
  container.id = 'react-historico';
  document.getElementById('mesa').appendChild(container);

  const raiz = createRoot(container);
  raizAtual = raiz;
  containerAtual = container;

  raiz.render(<HistoricoModal ctx={ctx} onClose={fecharModalHistorico} />);
}

export function fecharModalHistorico() {
  if (raizAtual) { raizAtual.unmount(); raizAtual = null; }
  if (containerAtual) { containerAtual.remove(); containerAtual = null; }
}
