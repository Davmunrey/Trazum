'use client';

import { useState } from 'react';

import type { UsageProfile } from '@trazum/core';

/**
 * The usage scenario, owned once for the whole page.
 *
 * Optimise and Compare both price their answers through it — "$41 a month" means
 * nothing without the call volume behind it — and the two tabs must not disagree
 * about what that volume is. Setting 50,000 calls on one tab and reading 10,000
 * on the other would make the two answers incomparable while looking like they
 * were about the same workload, which is a worse failure than either tab getting
 * it wrong on its own.
 *
 * So it lives beside the locale in `App`, for the same reason and with the same
 * shape: a page-level concern, lifted rather than copied.
 */
export interface Scenario {
  usage: UsageProfile;
  set: <K extends keyof UsageProfile>(key: K, value: UsageProfile[K]) => void;
  /** Restores several fields at once, for the history panel. */
  restore: (values: UsageProfile) => void;
}

export const DEFAULT_USAGE: UsageProfile = {
  model: 'claude-opus-5',
  callsPerMonth: 10_000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  batchEligible: false,
};

export function useScenario(): Scenario {
  const [usage, setUsage] = useState<UsageProfile>(DEFAULT_USAGE);

  return {
    usage,
    set: (key, value) => setUsage((prev) => ({ ...prev, [key]: value })),
    restore: setUsage,
  };
}
