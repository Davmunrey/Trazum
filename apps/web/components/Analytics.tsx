'use client';

import { useEffect } from 'react';

/**
 * Analítica opcional, apagada por defecto.
 *
 * Solo se activa si el operador define NEXT_PUBLIC_POSTHOG_KEY al compilar.
 * Sin clave no se carga ni un byte de posthog-js (el import es dinámico), no
 * se contacta con ningún servidor y `track` es un no-op. Nunca se envía el
 * contenido de los prompts: solo métricas agregadas (recorte %, nivel, modelo).
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!KEY) return;
  import('posthog-js')
    .then(({ default: posthog }) => posthog.capture(event, properties))
    .catch(() => {
      // La analítica jamás debe romper la aplicación.
    });
}

export function Analytics() {
  useEffect(() => {
    if (!KEY) return;
    import('posthog-js')
      .then(({ default: posthog }) => posthog.init(KEY, { api_host: HOST }))
      .catch(() => {});
  }, []);
  return null;
}
