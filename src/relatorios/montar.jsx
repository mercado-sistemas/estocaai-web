import { createRoot } from 'react-dom/client';
import { ReposicaoModal, RelEstoqueModal } from './RelatoriosModal.jsx';

// Ponte main.js (vanilla) → React, mesmo padrão das outras telas migradas.
let raizAtual = null;
let containerAtual = null;

function montar(elemento) {
  fecharModalRelatorio();
  const container = document.createElement('div');
  container.id = 'react-relatorio';
  document.getElementById('mesa').appendChild(container);
  raizAtual = createRoot(container);
  containerAtual = container;
  raizAtual.render(elemento);
}

export function fecharModalRelatorio() {
  if (raizAtual) { raizAtual.unmount(); raizAtual = null; }
  if (containerAtual) { containerAtual.remove(); containerAtual = null; }
}

export function abrirReposicaoReact(ctx) {
  montar(<ReposicaoModal ctx={ctx} onClose={fecharModalRelatorio} />);
}

export function abrirRelEstoqueReact(ctx) {
  montar(<RelEstoqueModal ctx={ctx} onClose={fecharModalRelatorio} />);
}
