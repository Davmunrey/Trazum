import { PRICING_LAST_REVIEWED } from '@trazum/core';

import { Optimizer } from '../components/Optimizer';

export default function Page() {
  return (
    <main className="shell">
      <header className="masthead">
        <h1>Trazum</h1>
        <span className="tag">optimizador de prompts</span>
      </header>
      <p className="lede">
        Acorta el prompt sin cambiar lo que pide, y te dice cuánto dinero supone al mes. El código,
        las URLs y los marcadores de plantilla se quedan intactos.
      </p>

      <Optimizer />

      <footer className="foot">
        Precios revisados el {PRICING_LAST_REVIEWED}. El recuento de tokens es una estimación
        (±15%); para cifras exactas usa el endpoint oficial de recuento desde la CLI con{' '}
        <code>--exact-tokens</code>. Los ahorros son proyecciones sobre el escenario que indiques,
        no facturación.
      </footer>
    </main>
  );
}
