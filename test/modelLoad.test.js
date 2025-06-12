import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OgreMaxLoader } from '../OgreMaxLoader.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

global.DOMParser = new JSDOM('').window.DOMParser;

function stubLoaders() {
  THREE.FileLoader.prototype.load = function(url, onLoad, onProgress, onError) {
    if (this.path !== undefined) url = this.path + url;
    url = this.manager.resolveURL(url);
    const fullPath = path.resolve(url);
    this.manager.itemStart(url);
    try {
      const data = fs.readFileSync(fullPath);
      const result = this.responseType === 'arraybuffer'
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data.toString();
      if (onLoad) onLoad(result);
      this.manager.itemEnd(url);
    } catch (err) {
      this.manager.itemError(url);
      if (onError) onError(err);
    }
  };

  THREE.TextureLoader.prototype.load = function(url, onLoad) {
    const tex = new THREE.Texture();
    if (onLoad) onLoad(tex);
    return tex;
  };
}

stubLoaders();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelBase = path.resolve(__dirname, '../exemple/res/models');

test('OgreMaxLoader loads PlayerMdl.scene', async () => {
  const loader = new OgreMaxLoader();
  const scene = await loader.load(path.join(modelBase, 'PlayerMdl.scene'));
  assert.ok(scene instanceof THREE.Scene, 'returns a THREE.Scene');

  const node = scene.getObjectByName('PlayerMdl');
  assert.ok(node, 'PlayerMdl node present');
  const mesh = node.children[0];
  assert.ok(mesh instanceof THREE.SkinnedMesh, 'contains skinned mesh');

  assert.ok(mesh.material, 'material resolved');
  assert.ok(mesh.skeleton instanceof THREE.Skeleton, 'skeleton resolved');
  assert.ok(mesh.skeleton.bones.length > 0, 'skeleton has bones');
});
