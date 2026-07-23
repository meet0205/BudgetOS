import { useMemo, useState } from 'react';
import { buildTree, type CategoryNode, type CategoryLayer } from '@budgetos/core';
import type { BudgetData } from '../App.js';

export function Categories({ data }: { data: BudgetData }) {
  const [layer, setLayer] = useState<CategoryLayer>('transaction');
  const roots = useMemo(
    () => buildTree(data.categories.filter((c) => c.layer === layer)),
    [data.categories, layer],
  );

  return (
    <div className="view">
      <header className="view-head">
        <h1>Categories</h1>
        <p className="muted">
          Two layers: <strong>transaction</strong> (receipt-level) and <strong>product</strong> (line-level).
        </p>
      </header>

      <div className="segmented">
        <button className={layer === 'transaction' ? 'active' : ''} onClick={() => setLayer('transaction')}>
          Transaction
        </button>
        <button className={layer === 'product' ? 'active' : ''} onClick={() => setLayer('product')}>
          Product
        </button>
      </div>

      <section className="panel">
        <ul className="tree">
          {roots.map((n) => (
            <TreeNode key={n.id} node={n} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function TreeNode({ node }: { node: CategoryNode }) {
  return (
    <li>
      <div className="tree-row">
        <span className="tree-name">{node.display_name}</span>
        {node.is_system && <span className="tag subtle">system</span>}
        {node.business_expense_kind && <span className="tag cra">{node.business_expense_kind}</span>}
      </div>
      {node.children.length > 0 && (
        <ul className="tree">
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}
