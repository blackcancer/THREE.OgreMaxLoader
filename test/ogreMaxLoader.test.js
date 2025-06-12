import test from 'node:test';
import assert from 'node:assert/strict';
import { mod as ogre } from './loadOgreMax.js';
const { OgreMaxLoader } = ogre;
import { DOMParser } from 'linkedom';

// minimal mesh without geometry
const emptyMesh = `<mesh></mesh>`;

test('OgreMaxLoader.parse throws for mesh without geometry', () => {
  const loader = new OgreMaxLoader();
  const xml = new DOMParser().parseFromString(emptyMesh, 'text/xml');
  assert.throws(() => loader.parse(xml), /Mesh contains no geometry/);
});

// unknown root node
const unknownXml = `<foo></foo>`;

test('OgreMaxLoader.parse throws for unknown root node', () => {
  const loader = new OgreMaxLoader();
  const xml = new DOMParser().parseFromString(unknownXml, 'text/xml');
  assert.throws(() => loader.parse(xml), /Unknown root node/);
});
