import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { optimize, segment, estimateTokens } from '../dist/index.js';

describe('protección de contenido', () => {
  it('no toca los bloques de código con vallas', () => {
    const prompt = [
      'Por favor, analiza con el fin de encontrar el error.',
      '',
      '```python',
      'def   suma(a,  b):   # espacios    a propósito',
      '    return a + b',
      '```',
      '',
      'Muchas gracias.',
    ].join('\n');

    const { optimized } = optimize(prompt);
    assert.ok(optimized.includes('def   suma(a,  b):   # espacios    a propósito'));
    assert.ok(optimized.includes('    return a + b'));
  });

  it('conserva URLs, marcadores de plantilla y etiquetas XML intactos', () => {
    const prompt =
      'Por favor consulta https://ejemplo.com/a__b?x=1&y=2 y usa {{nombre_usuario}} dentro de <contexto attr="v  v"> con el fin de responder.';

    const { optimized } = optimize(prompt);
    assert.ok(optimized.includes('https://ejemplo.com/a__b?x=1&y=2'));
    assert.ok(optimized.includes('{{nombre_usuario}}'));
    assert.ok(optimized.includes('<contexto attr="v  v">'));
  });

  it('no se traga el punto final de la frase dentro de la URL', () => {
    const segs = segment('Consulta https://ejemplo.com/guia. Y luego responde.');
    const url = segs.find((s) => s.protection === 'url');
    assert.equal(url.text, 'https://ejemplo.com/guia');

    // Y el punto sigue estando una sola vez en el resultado.
    const { optimized } = optimize('Por favor consulta https://ejemplo.com/guia. Gracias.');
    assert.ok(optimized.includes('https://ejemplo.com/guia.'));
    assert.ok(!optimized.includes('..'));
  });

  it('conserva la puntuación que sí forma parte de la URL', () => {
    const segs = segment('Mira https://ejemplo.com/a.b.c/ruta?x=1 ahora');
    const url = segs.find((s) => s.protection === 'url');
    assert.equal(url.text, 'https://ejemplo.com/a.b.c/ruta?x=1');
  });

  it('el segmentador marca cada tipo de contenido protegido', () => {
    const segs = segment('texto `código` https://a.b {{x}} <tag> fin');
    const kinds = segs.filter((s) => s.kind === 'protected').map((s) => s.protection);
    assert.ok(kinds.includes('inline-code'));
    assert.ok(kinds.includes('url'));
    assert.ok(kinds.includes('placeholder'));
    assert.ok(kinds.includes('xml-tag'));
  });
});

describe('reglas deterministas', () => {
  it('es reproducible: la misma entrada da la misma salida', () => {
    const prompt = 'Por favor, con el fin de ayudarme, básicamente resume esto. Gracias.';
    const a = optimize(prompt);
    const b = optimize(prompt);
    assert.equal(a.optimized, b.optimized);
    assert.equal(a.tokensAfter, b.tokensAfter);
  });

  it('nunca aumenta el número de tokens', () => {
    const prompts = [
      'Hola',
      '',
      'Analiza    este    texto.\n\n\n\nY luego resume.',
      'Please kindly analyze in order to help me. Thank you!',
      '```\ncode\n```',
      'a'.repeat(500),
    ];
    for (const prompt of prompts) {
      const result = optimize(prompt, { level: 'aggressive' });
      assert.ok(
        result.tokensAfter <= result.tokensBefore,
        `"${prompt.slice(0, 30)}" pasó de ${result.tokensBefore} a ${result.tokensAfter}`,
      );
    }
  });

  it('quita cortesía y comprime perífrasis', () => {
    const result = optimize('Por favor, con el fin de ayudarme, resume el texto. Gracias.');
    assert.ok(!/por favor/i.test(result.optimized));
    assert.ok(!/con el fin de/i.test(result.optimized));
    assert.ok(/para/i.test(result.optimized));
    assert.ok(result.tokensSaved > 0);
    assert.ok(result.rules.some((r) => r.id === 'politeness'));
    assert.ok(result.rules.some((r) => r.id === 'verbose-phrases'));
  });

  it('elimina párrafos repetidos', () => {
    const block = 'Responde siempre en español y usa un tono formal con el usuario final.';
    const result = optimize(`${block}\n\nOtra instrucción distinta aquí.\n\n${block}`);
    assert.equal(result.optimized.split(block).length - 1, 1);
    assert.ok(result.rules.some((r) => r.id === 'duplicate-blocks'));
  });

  it('el nivel agresivo activa reglas que el seguro no aplica', () => {
    const prompt = 'Esto es MUY importante. DEBES verificar tu respuesta antes de contestar.';
    const safe = optimize(prompt, { level: 'safe' });
    const aggressive = optimize(prompt, { level: 'aggressive' });
    assert.ok(aggressive.tokensAfter <= safe.tokensAfter);
    assert.ok(aggressive.rules.some((r) => r.level === 'aggressive'));
    assert.ok(!safe.rules.some((r) => r.level === 'aggressive'));
  });

  it('respeta las reglas desactivadas', () => {
    const prompt = 'Por favor resume esto.';
    const result = optimize(prompt, { disableRules: ['politeness'] });
    assert.ok(/por favor/i.test(result.optimized));
    assert.ok(!result.rules.some((r) => r.id === 'politeness'));
  });

  it('se lleva las comas que delimitaban el inciso borrado', () => {
    const { optimized } = optimize('Analiza la consulta y, si no te importa, clasifícala.');
    assert.equal(optimized, 'Analiza la consulta y clasifícala.');
  });

  it('no deja puntuación huérfana al borrar una frase entera', () => {
    const { optimized } = optimize('Resume el texto. ¡¡¡Muchas gracias!!!');
    assert.equal(optimized, 'Resume el texto.');
  });

  it('recapitaliza cuando el borrado deja la frase empezando en minúscula', () => {
    const { optimized } = optimize('Por favor resume el texto.');
    assert.equal(optimized, 'Resume el texto.');
  });

  it('no deja espacios ni líneas sueltas al principio de línea', () => {
    const { optimized } = optimize('Instrucción uno.\n\nBásicamente haz esto.\n\nInstrucción tres.');
    for (const line of optimized.split('\n')) {
      assert.ok(!/^ \S/.test(line), `línea con espacio residual: ${JSON.stringify(line)}`);
    }
    assert.ok(!/\n{3,}/.test(optimized));
  });

  it('mantiene la sangría de listas anidadas en markdown', () => {
    const prompt = 'Pasos:\n\n- uno\n  - uno punto uno\n    - más profundo';
    const { optimized } = optimize(prompt);
    assert.ok(optimized.includes('  - uno punto uno'));
    assert.ok(optimized.includes('    - más profundo'));
  });

  it('no rompe una palabra que contiene una frase como subcadena', () => {
    // "de" está en muchas frases; no debe recortarse dentro de otras palabras.
    const result = optimize('Analiza el ándel y la muyosa con el fin de terminar.');
    assert.ok(result.optimized.includes('ándel'));
    assert.ok(result.optimized.includes('muyosa'));
  });
});

describe('tokenizador heurístico', () => {
  it('devuelve 0 para texto vacío', () => {
    assert.equal(estimateTokens(''), 0);
  });

  it('crece con la longitud del texto', () => {
    const corto = estimateTokens('Hola mundo');
    const largo = estimateTokens('Hola mundo '.repeat(50));
    assert.ok(largo > corto * 20);
  });

  it('nunca devuelve valores negativos ni NaN', () => {
    for (const text of ['🚀🚀', '日本語のテキスト', '!!!???', '   ', '\n\n\n', 'a1b2c3']) {
      const tokens = estimateTokens(text);
      assert.ok(Number.isFinite(tokens) && tokens >= 0, `falla con ${JSON.stringify(text)}`);
    }
  });
});
