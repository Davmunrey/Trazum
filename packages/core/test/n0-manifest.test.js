import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * The N0 deployment manifest, held to the repository it describes.
 *
 * `n0-app.json` embeds the web app's SQL migrations, because the platform
 * writes `config_files` into a volume before the migration container starts
 * — and an embedded copy is exactly the kind of second copy this repository
 * refuses to trust. So it is not trusted: the embedded SQL must be
 * byte-identical to `apps/web/db/*.sql`, every file, both directions. A
 * migration edited in one place fails here rather than diverging silently
 * into a deployment that runs old DDL.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(ROOT, 'n0-app.json'), 'utf8'));

describe('the N0 manifest agrees with the repository', () => {
  it('embeds every migration byte-identically, and none that does not exist', () => {
    const embedded = manifest.services.migration.config_files.migrations;
    const onDisk = readdirSync(join(ROOT, 'apps/web/db')).filter((name) => name.endsWith('.sql')).sort();
    assert.deepEqual(Object.keys(embedded).sort(), onDisk, 'the manifest and apps/web/db list different migrations');
    for (const name of onDisk) {
      assert.equal(
        embedded[name],
        readFileSync(join(ROOT, 'apps/web/db', name), 'utf8'),
        `${name} differs between the manifest and apps/web/db — regenerate the manifest, never hand-edit the embedded copy`,
      );
    }
  });

  it('is a deployable shape: entrypoint exists, every service has an image and a port', () => {
    assert.ok(manifest.entrypoint in manifest.services);
    for (const [name, service] of Object.entries(manifest.services)) {
      assert.ok(typeof service.image === 'string' && service.image.includes(':'), `${name}: image must carry a tag`);
      assert.equal(typeof service.port, 'number', `${name}: port is required, even for the migration service`);
    }
    // The web service is the one built from this repository; its image is a
    // placeholder until a workspace exists, and the placeholder says so
    // loudly instead of looking deployable.
    assert.match(manifest.services.web.image, /^REPLACE-WITH-REGISTRY\//);
  });

  it('carries no secret values — only declarations', () => {
    /**
     * The Vault rule: a manifest ships placeholders, never credentials. Every
     * env value that is an object must say `secret: true`, and no string
     * value may look like a connection string with a password in it.
     */
    for (const [name, service] of Object.entries(manifest.services)) {
      for (const [key, value] of Object.entries(service.env ?? {})) {
        if (typeof value === 'object' && value !== null) {
          assert.equal(value.secret, true, `${name}.${key}: an object env value must be a secret declaration`);
        } else {
          assert.ok(!/:[^@/]+@/.test(String(value)), `${name}.${key} embeds a credential`);
        }
      }
    }
  });

  it('the migration command applies exactly the embedded files, in order, and stops on error', () => {
    const command = manifest.services.migration.command.join(' ');
    assert.match(command, /pg_isready/, 'the migration must wait for the database');
    assert.match(command, /\/migrations\/\*\.sql/, 'the migration must apply the mounted files');
    assert.match(command, /ON_ERROR_STOP=1/, 'a failed migration must fail, not scroll past');
    assert.deepEqual(manifest.services.migration.depends_on, ['db']);
    assert.deepEqual(manifest.services.web.depends_on, ['db', 'migration']);
  });
});
