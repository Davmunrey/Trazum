import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeSavings,
  costOfCall,
  effectivePricing,
  getModel,
  listModels,
  optimize,
  recommendTier,
} from '../dist/index.js';

describe('catálogo de precios', () => {
  it('todos los modelos tienen precios y límites coherentes', () => {
    for (const model of listModels()) {
      assert.ok(model.inputPerMTok > 0, `${model.id} sin precio de entrada`);
      assert.ok(
        model.outputPerMTok > model.inputPerMTok,
        `${model.id}: la salida debería costar más que la entrada`,
      );
      assert.ok(model.contextWindow >= 200_000, `${model.id} con ventana sospechosamente pequeña`);
      assert.ok(model.cacheMinTokens > 0, `${model.id} sin mínimo de caché`);
    }
  });

  it('aplica el precio promocional solo dentro de su vigencia', () => {
    const sonnet = getModel('claude-sonnet-5');
    assert.ok(sonnet.promo, 'Sonnet 5 debería tener precio de lanzamiento');

    const dentro = effectivePricing(sonnet, new Date('2026-08-01T00:00:00Z'));
    assert.equal(dentro.promoApplied, true);
    assert.equal(dentro.inputPerMTok, sonnet.promo.inputPerMTok);

    const fuera = effectivePricing(sonnet, new Date('2026-09-01T00:00:00Z'));
    assert.equal(fuera.promoApplied, false);
    assert.equal(fuera.inputPerMTok, sonnet.inputPerMTok);
  });

  it('rechaza modelos desconocidos con un mensaje útil', () => {
    assert.throws(() => getModel('gpt-inventado'), /Modelo desconocido/);
  });
});

describe('cálculo de coste', () => {
  it('calcula el coste por llamada a partir de los precios por millón', () => {
    // 1M de entrada a $5 y 1M de salida a $25.
    const cost = costOfCall(1_000_000, 1_000_000, 5, 25, false);
    assert.equal(cost.inputUsd, 5);
    assert.equal(cost.outputUsd, 25);
    assert.equal(cost.totalUsd, 30);
  });

  it('la Batch API deja el coste a la mitad', () => {
    const normal = costOfCall(1_000_000, 1_000_000, 5, 25, false);
    const batch = costOfCall(1_000_000, 1_000_000, 5, 25, true);
    assert.equal(batch.totalUsd, normal.totalUsd / 2);
  });

  it('el ahorro mensual sale solo de los tokens de entrada', () => {
    const usage = {
      model: 'claude-opus-5',
      callsPerMonth: 1000,
      avgOutputTokens: 500,
      cacheHitRate: 0.9,
      batchEligible: false,
    };
    const report = computeSavings(2000, 1000, usage, new Date('2026-08-04T00:00:00Z'));

    // 1000 tokens ahorrados x 1000 llamadas x $5/1M = $5
    assert.ok(Math.abs(report.monthlySavingsUsd - 5) < 1e-9);
    assert.equal(report.perMonth.before.outputUsd, report.perMonth.after.outputUsd);
    assert.ok(report.monthlySavingsPct > 0 && report.monthlySavingsPct < 100);
  });
});

describe('avisos', () => {
  const baseUsage = {
    model: 'claude-opus-5',
    callsPerMonth: 10_000,
    avgOutputTokens: 200,
    cacheHitRate: 0.9,
    batchEligible: false,
  };

  it('propone prompt caching cuando se supera el mínimo cacheable', () => {
    const prompt = 'Analiza este contrato con criterio jurídico. '.repeat(200);
    const result = optimize(prompt, { usage: baseUsage });
    const caching = result.advisories.find((a) => a.id === 'prompt-caching');
    assert.ok(caching, 'debería proponer caching');
    assert.ok(caching.estimatedMonthlyUsd > 0);
  });

  it('avisa cuando el prompt no llega al mínimo cacheable', () => {
    const result = optimize('Resume este texto.', { usage: baseUsage });
    assert.ok(result.advisories.some((a) => a.id === 'below-cache-minimum'));
  });

  it('no propone la caché si la tasa de acierto no compensa', () => {
    const prompt = 'Analiza este contrato con criterio jurídico. '.repeat(200);
    const result = optimize(prompt, { usage: { ...baseUsage, cacheHitRate: 0.1 } });
    assert.ok(result.advisories.some((a) => a.id === 'prompt-caching-not-worth-it'));
    assert.ok(!result.advisories.some((a) => a.id === 'prompt-caching'));
  });

  it('propone la Batch API solo si no se está usando ya', () => {
    const conBatch = optimize('Clasifica esto.', {
      usage: { ...baseUsage, batchEligible: true },
    });
    const sinBatch = optimize('Clasifica esto.', { usage: baseUsage });
    assert.ok(!conBatch.advisories.some((a) => a.id === 'batch-api'));
    assert.ok(sinBatch.advisories.some((a) => a.id === 'batch-api'));
  });

  it('sugiere bajar de modelo en tareas simples', () => {
    const result = optimize('Clasifica el sentimiento de esta frase: sí o no.', {
      usage: baseUsage,
    });
    const downgrade = result.advisories.find((a) => a.id === 'model-downgrade');
    assert.ok(downgrade, 'una clasificación debería poder bajar de modelo');
    assert.ok(downgrade.estimatedMonthlyUsd > 0);
  });

  it('avisa si el prompt no cabe en la ventana de contexto', () => {
    const result = optimize('palabra '.repeat(200_000), {
      usage: { ...baseUsage, model: 'claude-haiku-4-5' },
    });
    assert.ok(result.advisories.some((a) => a.id === 'context-overflow'));
  });

  it('la heurística de complejidad distingue tareas simples de complejas', () => {
    assert.equal(recommendTier('Traduce esta frase al inglés.', 20), 'haiku');
    assert.equal(
      recommendTier(
        'Analiza la arquitectura, diseña una migración y depura el agente paso a paso.',
        6000,
      ),
      'opus',
    );
  });
});
