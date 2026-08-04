import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { optimize, refineWithLlm, providerFromEnv } from '../dist/index.js';

/** Proveedor falso: devuelve lo que le digamos, sin salir a la red. */
function fakeProvider(reply) {
  return {
    name: 'fake',
    model: 'fake-1',
    async complete() {
      return typeof reply === 'function' ? reply() : reply;
    },
  };
}

const PROMPT = 'Por favor analiza el fichero {{ruta}} y consulta https://docs.ejemplo.com/guia.';

describe('pasada opcional por LLM', () => {
  it('acepta un candidato más corto que conserva lo protegido', async () => {
    const base = optimize(PROMPT);
    const shorter = 'Analiza {{ruta}} según https://docs.ejemplo.com/guia.';
    const result = await refineWithLlm(base, fakeProvider(shorter));

    assert.equal(result.llm.applied, true);
    assert.equal(result.optimized, shorter);
    assert.ok(result.tokensAfter < base.tokensAfter);
    // El ahorro se recalcula contra el prompt original, no contra el intermedio.
    assert.equal(result.tokensSaved, base.tokensBefore - result.tokensAfter);
  });

  it('descarta el candidato si altera un marcador de plantilla', async () => {
    const base = optimize(PROMPT);
    const broken = 'Analiza {{la_ruta}} según https://docs.ejemplo.com/guia.';
    const result = await refineWithLlm(base, fakeProvider(broken));

    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /protegido/);
    assert.equal(result.optimized, base.optimized);
  });

  it('descarta el candidato si altera una URL', async () => {
    const base = optimize(PROMPT);
    const broken = 'Analiza {{ruta}} según https://docs.ejemplo.com/otra-guia.';
    const result = await refineWithLlm(base, fakeProvider(broken));

    assert.equal(result.llm.applied, false);
    assert.equal(result.optimized, base.optimized);
  });

  it('descarta el candidato si no es más corto', async () => {
    const base = optimize(PROMPT);
    const longer = `${base.optimized} Y además añade una explicación detallada al final del todo.`;
    const result = await refineWithLlm(base, fakeProvider(longer));

    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /no es más corto/);
  });

  it('descarta un resumen disfrazado de compresión', async () => {
    const largo = `Analiza {{ruta}} en https://docs.ejemplo.com/guia. ${'Detalle relevante del requisito. '.repeat(40)}`;
    const base = optimize(largo);
    const resumen = 'Analiza {{ruta}} en https://docs.ejemplo.com/guia.';
    const result = await refineWithLlm(base, fakeProvider(resumen));

    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /resumen/);
  });

  it('descarta respuestas vacías', async () => {
    const base = optimize(PROMPT);
    const result = await refineWithLlm(base, fakeProvider('   '));
    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /vacía/);
  });

  it('quita las vallas de código si el modelo envuelve la respuesta', async () => {
    const base = optimize(PROMPT);
    const wrapped = '```\nAnaliza {{ruta}} según https://docs.ejemplo.com/guia.\n```';
    const result = await refineWithLlm(base, fakeProvider(wrapped));

    assert.equal(result.llm.applied, true);
    assert.ok(!result.optimized.startsWith('```'));
  });
});

describe('configuración por entorno', () => {
  it('devuelve null si falta configuración, sin lanzar', () => {
    assert.equal(providerFromEnv({}), null);
    assert.equal(providerFromEnv({ TRAZUM_LLM_BASE_URL: 'https://x' }), null);
    assert.equal(providerFromEnv({ TRAZUM_LLM_PROVIDER: 'anthropic' }), null);
  });

  it('construye un proveedor compatible con OpenAI', () => {
    const provider = providerFromEnv({
      TRAZUM_LLM_BASE_URL: 'https://llm.interno/v1',
      TRAZUM_LLM_MODEL: 'mi-modelo',
      TRAZUM_LLM_API_KEY: 'k',
    });
    assert.ok(provider);
    assert.equal(provider.model, 'mi-modelo');
  });

  it('construye un proveedor de Anthropic', () => {
    const provider = providerFromEnv({
      TRAZUM_LLM_PROVIDER: 'anthropic',
      TRAZUM_LLM_API_KEY: 'k',
    });
    assert.ok(provider);
    assert.equal(provider.name, 'anthropic');
  });
});
