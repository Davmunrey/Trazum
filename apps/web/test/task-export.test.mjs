import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { copyTaskExport, requestTaskDownload } from '../lib/task-export.ts';

const content = '{\n  "criterion": "Synthetic check: á → ✓"\n}\n';
function setDocument(t, document) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
}

describe('task export delivery', () => {
  it('copies the complete document and waits for clipboard confirmation', async () => {
    let confirm;
    let received;
    let settled = false;
    const result = copyTaskExport(content, {
      writeText(value) { received = value; return new Promise((resolve) => { confirm = resolve; }); },
    }).then((value) => { settled = true; return value; });
    await Promise.resolve();
    assert.equal(received, content);
    assert.equal(settled, false);
    confirm();
    assert.equal(await result, true);
  });

  it('returns a recoverable failure for unavailable or denied clipboard access', async () => {
    assert.equal(await copyTaskExport(content, undefined), false);
    assert.equal(await copyTaskExport(content, { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }), false);
    assert.equal(await copyTaskExport(content, { writeText() { throw new Error('Unavailable'); } }), false);
  });

  for (const type of ['application/json', 'text/markdown']) {
    it(`downloads exact UTF-8 content as ${type} without leaving an active link`, async (t) => {
      let clicked;
      let connected = false;
      const anchor = { click() { assert.ok(connected); clicked = { href: this.href, name: this.download }; }, remove() { connected = false; } };
      t.mock.timers.enable({ apis: ['setTimeout'] });
      setDocument(t, {
        createElement() { return anchor; },
        body: { append() { connected = true; } },
      });
      const revoke = t.mock.method(URL, 'revokeObjectURL');
      requestTaskDownload({ name: type === 'application/json' ? 'synthetic-report.json' : 'synthetic-policy.md', content, type });
      assert.equal(connected, false);
      assert.match(clicked.name, type === 'application/json' ? /\.json$/ : /\.md$/);
      const downloaded = await fetch(clicked.href);
      assert.equal(downloaded.headers.get('content-type'), type);
      assert.equal(await downloaded.text(), content);
      assert.equal(revoke.mock.callCount(), 0);
      t.mock.timers.tick(1000);
      assert.equal(revoke.mock.callCount(), 1);
      await assert.rejects(fetch(clicked.href));
    });
  }

  it('releases the download link and blob when browser activation fails', (t) => {
    let removed = false;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    setDocument(t, {
      createElement() { return { click() { throw new Error('Download blocked'); }, remove() { removed = true; } }; },
      body: { append() {} },
    });
    const revoke = t.mock.method(URL, 'revokeObjectURL');
    assert.throws(() => requestTaskDownload({ name: 'synthetic.json', content, type: 'application/json' }), /Download blocked/);
    assert.equal(removed, true);
    t.mock.timers.tick(1000);
    assert.equal(revoke.mock.callCount(), 1);
  });
});
