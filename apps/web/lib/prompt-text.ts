'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@trazum/core';

/**
 * The prompt being worked on, owned by the page rather than by the Optimise tab.
 *
 * Lifted for the same reason `useScenario` was: a second tab needs it. Saving to
 * the library has to save *the prompt on screen*, and restoring a version has to
 * put it back on screen — neither of which the Optimise tab can do for a sibling
 * holding its own copy. Two components with two copies of "the prompt" is how
 * you get a library that quietly stores something else.
 */

/**
 * Starter prompts, one per locale.
 *
 * Each is written in its own language on purpose: the point of the example is
 * to show the rules firing, and the phrase dictionaries are per-language.
 */
export const EXAMPLES: Record<Locale, string> = {
  en: `You are an expert customer support assistant.

IMPORTANT: You MUST always answer in English.

Please, in order to help the user, I basically need you to analyse the query arriving in {{query}} and, if you don't mind, classify it into one of the categories.

================================================

It is important to note that you have to be very careful when classifying.

Always answer in English and keep a formal tone with the end user.

Check the catalogue at https://api.example.com/v1/catalogue?full=true

Use this function as-is:

\`\`\`python
def classify(text):
    return   model.predict(text)   # do not touch the indentation
\`\`\`

Always answer in English and keep a formal tone with the end user.

Please double-check your answer before responding. Thank you very much!`,

  es: `Eres un asistente experto en atención al cliente.

IMPORTANTE: DEBES responder SIEMPRE en español.

Por favor, con el fin de ayudar al usuario, básicamente necesito que analices la consulta que llega en {{consulta}} y, si no te importa, la clasifiques en una de las categorías.

================================================

Es importante destacar que tienes que ser muy cuidadoso al clasificar.

Responde siempre en español y usa un tono formal con el usuario final.

Consulta el catálogo en https://api.ejemplo.com/v1/catalogo?full=true

Usa esta función tal cual:

\`\`\`python
def clasificar(texto):
    return   modelo.predict(texto)   # no tocar la indentación
\`\`\`

Responde siempre en español y usa un tono formal con el usuario final.

Por favor verifica tu respuesta antes de contestar. ¡¡¡Muchas gracias!!!`,
};

export interface PromptText {
  value: string;
  set: (next: string | ((current: string) => string)) => void;
}

export function usePromptText(locale: Locale): PromptText {
  const [value, setValue] = useState(EXAMPLES[locale]);

  // Switching language swaps the starter prompt, but never a prompt the reader
  // has actually written: losing someone's text to a language toggle would be
  // unforgivable.
  useEffect(() => {
    setValue((current) => (Object.values(EXAMPLES).includes(current) ? EXAMPLES[locale] : current));
  }, [locale]);

  return { value, set: setValue };
}
