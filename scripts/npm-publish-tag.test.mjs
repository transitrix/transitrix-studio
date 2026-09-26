import test from 'node:test';
import assert from 'node:assert/strict';
import { publishTag } from './npm-publish-tag.mjs';

test('prereleases preserve the stable channel', () => {
  for (const version of ['2.10.0-rc.0', '1.14.0-rc.0', '1.0.0-beta-test.2+build']) assert.equal(publishTag(version), 'next');
});
test('stable versions use latest, including build metadata', () => {
  for (const version of ['2.9.4', '1.0.0+build-rc.1']) assert.equal(publishTag(version), 'latest');
});
test('invalid or absent versions fail closed', () => {
  for (const version of [undefined, '', 'v1.0.0', '1.0', '01.0.0', '1.0.0-01', '1.0.0-', '1.0.0;echo nope']) assert.throws(() => publishTag(version));
});
