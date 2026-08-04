/** Tipos públicos de @trazum/core. */

/** Nivel de agresividad de las reglas deterministas. */
export type RuleLevel = 'safe' | 'aggressive';

/** Una regla determinista aplicada al texto mutable del prompt. */
export interface Rule {
  id: string;
  /** Título corto en español, para mostrar en informes. */
  title: string;
  /** Qué hace y por qué es seguro. */
  rationale: string;
  level: RuleLevel;
  /** Devuelve el texto transformado y cuántas veces se aplicó. */
  apply(text: string): { text: string; hits: number };
}

/** Resultado de una regla tras ejecutarse sobre el prompt completo. */
export interface RuleResult {
  id: string;
  title: string;
  rationale: string;
  level: RuleLevel;
  hits: number;
  /** Tokens ahorrados atribuibles a esta regla (estimados). */
  tokensSaved: number;
}

/** Severidad de un aviso: cuanto mayor, más dinero suele haber en juego. */
export type AdvisorySeverity = 'info' | 'opportunity' | 'warning';

/** Recomendación que NO modifica el prompt, solo informa. */
export interface Advisory {
  id: string;
  severity: AdvisorySeverity;
  title: string;
  detail: string;
  /** Ahorro mensual estimado en USD si se aplica. `null` si no es cuantificable. */
  estimatedMonthlyUsd: number | null;
}

/** Precio de un modelo, en USD por millón de tokens. */
export interface ModelPricing {
  id: string;
  displayName: string;
  /** USD por 1M tokens de entrada. */
  inputPerMTok: number;
  /** USD por 1M tokens de salida. */
  outputPerMTok: number;
  /** Ventana de contexto en tokens. */
  contextWindow: number;
  /** Tokens mínimos para que el prompt caching llegue a cachear. */
  cacheMinTokens: number;
  /** Familia, para recomendar modelo por capacidad. */
  tier: 'haiku' | 'sonnet' | 'opus' | 'frontier';
  /** Precio promocional activo, si lo hay. */
  promo?: {
    inputPerMTok: number;
    outputPerMTok: number;
    /** Fecha ISO (incluida) hasta la que aplica el precio promocional. */
    until: string;
  };
  /** Notas relevantes para el cálculo de coste. */
  notes?: string;
}

/** Escenario de uso para calcular el ahorro en dinero. */
export interface UsageProfile {
  /** Modelo sobre el que se calcula el coste. */
  model: string;
  /** Llamadas al mes con este prompt. */
  callsPerMonth: number;
  /** Tokens de salida medios por llamada. */
  avgOutputTokens: number;
  /**
   * Fracción de llamadas que reutilizarían el prefijo cacheado (0-1).
   * Solo se usa en el aviso de prompt caching.
   */
  cacheHitRate: number;
  /** Si el trabajo tolera latencia, la Batch API cuesta la mitad. */
  batchEligible: boolean;
}

/** Coste desglosado de un escenario. */
export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
}

/** Comparativa de coste antes/después. */
export interface SavingsReport {
  model: string;
  modelDisplayName: string;
  /** Si se está aplicando un precio promocional vigente. */
  promoApplied: boolean;
  perCall: { before: CostBreakdown; after: CostBreakdown };
  perMonth: { before: CostBreakdown; after: CostBreakdown };
  monthlySavingsUsd: number;
  /** Porcentaje de ahorro sobre el coste total mensual (0-100). */
  monthlySavingsPct: number;
}

/** Segmento del prompt: el protegido nunca se modifica. */
export interface Segment {
  kind: 'mutable' | 'protected';
  /** Qué tipo de contenido protegido es (para diagnóstico). */
  protection?: ProtectionKind;
  text: string;
}

export type ProtectionKind =
  | 'fenced-code'
  | 'inline-code'
  | 'url'
  | 'placeholder'
  | 'xml-tag';

/** Opciones de optimización. */
export interface OptimizeOptions {
  /** `safe` (por defecto) solo aplica reglas sin riesgo semántico. */
  level?: RuleLevel;
  /** Reglas a desactivar por id. */
  disableRules?: string[];
  /** Perfil de uso para cuantificar el ahorro. */
  usage?: Partial<UsageProfile>;
  /** Contador de tokens alternativo (p. ej. la API real de recuento). */
  tokenCounter?: TokenCounter;
}

/** Cuenta tokens de un texto. Sincrónico para poder usarse en el bucle de reglas. */
export type TokenCounter = (text: string) => number;

/** Resultado completo de una optimización. */
export interface OptimizationResult {
  original: string;
  optimized: string;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  /** Porcentaje de reducción de tokens de entrada (0-100). */
  reductionPct: number;
  rules: RuleResult[];
  advisories: Advisory[];
  savings: SavingsReport;
  usage: UsageProfile;
  /** Cómo se contaron los tokens, para que el usuario sepa el margen de error. */
  tokenSource: 'heuristic' | 'external';
  /** Presente solo si se pasó por una pasada de LLM. */
  llm?: LlmRefinement;
}

/** Resultado de la pasada opcional por un LLM. */
export interface LlmRefinement {
  applied: boolean;
  /** Motivo por el que no se aplicó, si `applied` es false. */
  rejectedReason?: string;
  provider: string;
  model: string;
  candidate: string;
  tokensBefore: number;
  tokensAfter: number;
}

/** Proveedor de LLM enchufable: aquí encaja el modelo de n0 o cualquier otro. */
export interface LlmProvider {
  /** Nombre legible, aparece en el informe. */
  name: string;
  /** Identificador del modelo usado. */
  model: string;
  complete(input: { system: string; user: string }): Promise<string>;
}
