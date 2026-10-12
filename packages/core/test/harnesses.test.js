import assert from 'node:assert/strict';
import { it } from 'node:test';
import { HARNESS_CAPABILITIES, getHarnessCapability } from '../dist/index.js';

it('distinguishes native adapters from normalized log and MCP access', () => {
  assert.equal(getHarnessCapability('claude-code').nativeImport.command, 'from-claude-code');
  assert.equal(getHarnessCapability('codex').nativeImport.command, 'from-codex');
  for (const id of ['cursor', 'mcp-client']) {
    assert.equal(getHarnessCapability(id).nativeImport, null);
    assert.equal(getHarnessCapability(id).normalizedUsage.command, 'bill');
  }
  assert.equal(getHarnessCapability('unregistered-agent'), null);
  assert.equal(getHarnessCapability('Codex'), null);
});

it('never infers billing, automatic interception or task quality from a harness name', () => {
  assert.deepEqual(HARNESS_CAPABILITIES.accessChannels, ['cli', 'mcp', 'http']);
  assert.equal(HARNESS_CAPABILITIES.schemaVersion, 1);
  assert.equal(HARNESS_CAPABILITIES.taskQuality, 'not-measured');
  for (const entry of HARNESS_CAPABILITIES.harnesses) {
    assert.equal(entry.billingMode, 'unknown');
    assert.equal(entry.automaticInterception, false);
  }
  assert.equal(new Set(HARNESS_CAPABILITIES.harnesses.map(({ id }) => id)).size, HARNESS_CAPABILITIES.harnesses.length);
});

it('keeps discovery metadata immutable across consumers', () => {
  assert.throws(() => { getHarnessCapability('cursor').nativeImport = {}; }, TypeError);
  assert.throws(() => { getHarnessCapability('codex').nativeImport.command = 'anything'; }, TypeError);
  assert.throws(() => { HARNESS_CAPABILITIES.accessChannels.push('automatic-hook'); }, TypeError);
  assert.equal(getHarnessCapability('cursor').nativeImport, null);
});
