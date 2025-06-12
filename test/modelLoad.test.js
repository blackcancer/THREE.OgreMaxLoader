import test from 'node:test';
import assert from 'node:assert/strict';
import { mod as ogre } from './loadOgreMax.js';
const { OgreMaxLoader } = ogre;
import { DOMParser } from 'linkedom';
import * as THREE from 'three';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { dirname, join } from 'path';

// polyfill DOMParser for OgreMaxLoader.load()
global.DOMParser = DOMParser;

// stub texture loader to avoid image dependencies
THREE.TextureLoader.prototype.load = function(url, onLoad) {
  const tex = new THREE.Texture();
  if (onLoad) onLoad(tex);
  return tex;
};

const root = dirname(fileURLToPath(import.meta.url));
const skeletonPath = join(root, '../exemple/res/models/PlayerMdl.skeleton.xml');

test('OgreMaxLoader parses skeleton file', () => {
  const loader = new OgreMaxLoader();
  const skelXML = new DOMParser().parseFromString(fs.readFileSync(skeletonPath, 'utf8'), 'text/xml');
  const skel = loader.parse(skelXML).skeleton;
  assert.ok(skel.skeleton.bones.length > 0);
});

