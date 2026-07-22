import { createRoot } from 'react-dom/client';
import ProdutoModal from './ProdutoModal.jsx';

/*
 * Ponte entre o main.js (vanilla, dono do estado) e o componente React.
 *
 * O main.js chama abrirModalProduto(ctx, produto): criamos um container no #mesa,
 * montamos o React ali e devolvemos o controle de fechar. Só esta tela é React;
 * o resto do app segue igual.
 */
let raizAtual = null;
let containerAtual = null;

export function abrirModalProduto(ctx, produtoInicial) {
  fecharModalProduto();

  const container = document.createElement('div');
  container.id = 'react-produto';
  document.getElementById('mesa').appendChild(container);

  const raiz = createRoot(container);
  raizAtual = raiz;
  containerAtual = container;

  raiz.render(<ProdutoModal ctx={ctx} produtoInicial={produtoInicial} onClose={fecharModalProduto} />);
}

export function fecharModalProduto() {
  if (raizAtual) { raizAtual.unmount(); raizAtual = null; }
  if (containerAtual) { containerAtual.remove(); containerAtual = null; }
}
