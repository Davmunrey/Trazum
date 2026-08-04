# Trazum

Optimizador de prompts. Acorta lo que envías a la IA sin cambiar lo que pides, y te dice cuánto dinero supone eso al mes.

El núcleo es **determinista**: las mismas reglas, el mismo resultado, coste cero al ejecutarlo. Encima hay una **pasada opcional por un LLM** para la compresión que las reglas no pueden hacer, con el proveedor que tú configures.

```
┌──────────────┐   ┌───────────────┐   ┌──────────────────┐
│ @trazum/core │ ← │ @trazum/cli   │   │ @trazum/web      │
│  librería    │   │  terminal     │   │  Next.js         │
└──────────────┘   └───────────────┘   └──────────────────┘
```

---

## Qué hace exactamente

**1. Recorta el prompt con reglas deterministas.** Cortesía, muletillas, perífrasis largas, párrafos duplicados, separadores decorativos, énfasis en mayúsculas. Dos niveles: `seguro` (sin riesgo semántico) y `agresivo` (revisa el diff).

**2. Nunca toca lo que rompería el prompt.** Bloques de código, código en línea, URLs, marcadores de plantilla (`{{x}}`, `${x}`, `{x}`, `{% %}`) y etiquetas XML/HTML se aíslan antes de aplicar ninguna regla. Si una regla llegara a hacer desaparecer uno de esos fragmentos, esa regla se descarta y el resto sigue.

**3. Te dice dónde está el dinero.** Además del recorte, avisa de lo que suele ahorrar más que acortar el prompt:

| Aviso | Por qué importa |
|---|---|
| Prompt caching | Leer de caché cuesta el 10% de la entrada. Con buena reutilización es el mayor ahorro disponible. |
| Batch API | 50% de descuento sobre entrada y salida si el trabajo tolera latencia. |
| Modelo más barato | Heurística de complejidad: si la tarea parece simple, cuánto ahorrarías bajando de nivel. |
| Coste dominado por la salida | Si pagas más por la respuesta que por el prompt, acortar el prompt tiene techo. |
| Precio promocional | Te avisa si estás calculando con un precio de lanzamiento que va a caducar. |
| Ventana de contexto | Si el prompt no cabe, la llamada va a fallar. |

**4. Opcionalmente, pasa por un LLM.** Solo acepta el resultado si es más corto y conserva intacto el contenido protegido. Si no, se queda con la versión determinista. Nunca devuelve algo peor que el punto de partida.

---

## Empezar

```bash
npm install
npm run build      # compila core + cli
npm test           # 43 tests
```

### CLI

```bash
node packages/cli/dist/index.js optimize prompt.txt --calls 50000 --diff
```

```
Tokens de entrada
  259 → 179   -30.9% (estimado, ±15%)

Reglas aplicadas
  [segura] Párrafos repetidos (1×, ~24 tokens)
  [segura] Fórmulas de cortesía (4×, ~21 tokens)
  ...

Coste con Claude Opus 5
  50.000 llamadas/mes · 300 tokens de salida por llamada
  $439.25/mes → $419.25/mes   ahorro $20.00/mes (4.6%)

Además de acortar el prompt
  → Si el trabajo tolera latencia, usa la Batch API  ~$209.62/mes
  → Esta tarea quizá no necesite Claude Opus 5  ~$251.55/mes
```

Otros comandos:

```bash
node packages/cli/dist/index.js models    # tabla de precios y mínimos de caché
node packages/cli/dist/index.js rules     # qué hace cada regla y su id
node packages/cli/dist/index.js --help
```

Al redirigir la salida solo escribe el prompt optimizado, así que encadena bien:

```bash
cat prompt.md | node packages/cli/dist/index.js optimize - > prompt.optimizado.md
```

Para instalarlo como comando `trazum`:

```bash
npm link -w @trazum/cli
```

### Web

```bash
npm run build:web
npm run dev:web        # http://localhost:3000
```

Interfaz para pegar el prompt, ajustar el escenario de uso y ver el diff palabra a palabra, el ahorro y los avisos.

### Librería

```ts
import { optimize, refineWithLlm, openAiCompatible } from '@trazum/core';

const resultado = optimize(prompt, {
  level: 'safe',
  usage: {
    model: 'claude-opus-5',
    callsPerMonth: 50_000,
    avgOutputTokens: 500,
    cacheHitRate: 0.9,
    batchEligible: false,
  },
});

console.log(resultado.optimized);
console.log(resultado.savings.monthlySavingsUsd);
```

---

## Conectar vuestro LLM

El proveedor es enchufable. Configúralo por entorno:

```bash
TRAZUM_LLM_PROVIDER=openai              # openai (por defecto) | anthropic
TRAZUM_LLM_BASE_URL=https://tu-llm/v1   # sin /chat/completions
TRAZUM_LLM_MODEL=nombre-del-modelo
TRAZUM_LLM_API_KEY=...
```

Con eso, `--llm` en la CLI y la casilla de la web ya funcionan. El formato compatible con OpenAI cubre vLLM, Ollama, OpenRouter, LM Studio y la mayoría de gateways internos.

Si tu endpoint no habla ninguno de los dos formatos, `customProvider` te deja definir petición y respuesta a mano:

```ts
import { customProvider, refineWithLlm } from '@trazum/core';

const proveedor = customProvider({
  name: 'n0',
  model: 'mi-modelo',
  request: ({ system, user }) => ({
    url: 'https://tu-endpoint/generar',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.MI_CLAVE! },
      body: JSON.stringify({ instrucciones: system, entrada: user }),
    },
  }),
  extract: (body) => (body as { salida: string }).salida,
});

const conLlm = await refineWithLlm(resultado, proveedor);
console.log(conLlm.llm.applied, conLlm.llm.rejectedReason);
```

Un candidato del LLM se **rechaza** si: está vacío, altera código/URLs/marcadores, no es más corto, o conserva menos del 25% de los tokens (eso es un resumen, no una compresión).

---

## Recuento de tokens

Por defecto se usa un **estimador heurístico sin dependencias**: clasifica por tipo de carácter (palabras, números, puntuación, CJK, emoji). En texto normal el error típico ronda el ±15%. Sirve para comparar dos versiones del mismo prompt, que es para lo que está.

Para números exactos, el endpoint oficial de recuento no cobra tokens:

```bash
ANTHROPIC_API_KEY=... node packages/cli/dist/index.js optimize prompt.txt --exact-tokens
```

O desde la librería:

```ts
import { countTokensAnthropic, withExactTokenCounts } from '@trazum/core';

const exacto = await withExactTokenCounts(
  resultado,
  countTokensAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-opus-5' }),
);
```

---

## Limitaciones, dichas claramente

- **Los ahorros son proyecciones, no facturación.** Se calculan sobre el escenario que tú indicas (llamadas/mes, tokens de salida) y con la tabla de precios de `packages/core/src/pricing.ts`. Revisa esa tabla antes de presupuestar: `PRICING_LAST_REVIEWED` te dice cuándo se actualizó por última vez.
- **Los tokens de salida se mantienen constantes en el cálculo.** Un prompt más corto suele dar respuestas algo más cortas, pero depende de la tarea y no se puede prometer. El ahorro que ves viene solo de la entrada.
- **La recomendación de modelo es una heurística por palabras clave**, no un juicio sobre la calidad de la respuesta. Mide la diferencia con tus propias evaluaciones antes de bajar de modelo en producción.
- **El nivel agresivo puede cambiar matices.** Quita intensificadores, coletillas y peticiones de auto-verificación. Revisa el diff antes de aplicarlo.
- **Los precios de Amazon Bedrock y Vertex AI los fija cada partner** y no son los de esta tabla.

---

## Estructura

```
packages/core/     librería sin dependencias (reglas, tokens, precios, LLM)
  src/segment.ts     aislamiento de código, URLs, plantillas y XML
  src/rules.ts       motor de reglas deterministas
  src/phrases.ts     diccionarios ES/EN
  src/pricing.ts     catálogo de modelos y precios
  src/advisories.ts  avisos de caché, batch, modelo y contexto
  src/llm.ts         proveedores enchufables y comprobaciones de seguridad
packages/cli/      CLI sin dependencias
apps/web/          Next.js (App Router)
```

## Actualizar precios

`packages/core/src/pricing.ts` es la única fuente de verdad. Al cambiarla, actualiza también `PRICING_LAST_REVIEWED`. La suite de tests comprueba que la tabla siga siendo coherente (salida más cara que entrada, promociones con fecha de caducidad, ventanas de contexto plausibles).
