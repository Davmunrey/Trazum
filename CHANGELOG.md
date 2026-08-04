# Changelog

## 0.1.0

Primera versión.

- Núcleo determinista (`@trazum/core`): 12 reglas en dos niveles, aislamiento
  de código/URLs/plantillas/XML, estimador de tokens sin dependencias,
  catálogo de precios con promociones y avisos de ahorro (caching, Batch API,
  modelo, contexto).
- Capa de LLM opcional y enchufable (endpoints compatibles con OpenAI,
  Claude API o proveedor a medida) con comprobaciones de seguridad: el
  candidato solo se acepta si es más corto y conserva el contenido protegido.
- CLI (`@trazum/cli`): `optimize`, `check` (presupuesto de tokens para CI),
  `models` y `rules`; salida limpia al redirigir, `--json`, `--diff`,
  `--exact-tokens`.
- Web (`@trazum/web`): interfaz Next.js con diff palabra a palabra, historial
  local, escenario de coste editable y pasada por LLM configurable.
