/**
 * Serves one mutated file in place of the built one, for one process.
 *
 * `scripts/mutate.mjs` starts each test with this file preloaded and two
 * variables: the URL of the module to replace and the path of the text to
 * serve instead. Nothing on disk changes, so a run that is interrupted leaves
 * `dist` exactly as the build wrote it, and four mutants can run at once
 * without seeing each other.
 *
 * It arrives through `NODE_OPTIONS`, so a test that starts a child `node`
 * hands it on, unless the test builds the child's environment itself. Those
 * children run the unmutated file: a mutant only they would notice is counted
 * as a survivor, which errs on the side of saying a test is missing.
 */

import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const url = process.env.TRAZUM_MUTANT_URL;
const path = process.env.TRAZUM_MUTANT_SOURCE;

if (url && path) {
  registerHooks({
    load(candidate, context, nextLoad) {
      if (candidate !== url) return nextLoad(candidate, context);
      return { format: 'module', source: readFileSync(path, 'utf8'), shortCircuit: true };
    },
  });
}
