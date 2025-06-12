import test from 'node:test';
import assert from 'node:assert/strict';
import { mod as ogre } from './loadOgreMax.js';
const { DotMaterialLoader, DotMaterialError } = ogre;

// invalid material text used to test error handling
const invalidText = `material Bad { technique { pass { diffuse 1 0 0 } }`;

test('DotMaterialLoader.texturePath setter validates input', () => {
  const loader = new DotMaterialLoader();
  loader.texturePath = 'textures/';
  assert.equal(loader.texturePath, 'textures/');
  assert.throws(() => { loader.texturePath = 123; }, DotMaterialError);
});

test('DotMaterialLoader.parse throws on malformed input', () => {
  const loader = new DotMaterialLoader();
  assert.throws(() => loader.parse(invalidText), DotMaterialError);
});
