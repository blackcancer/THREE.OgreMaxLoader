import fs from 'fs';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const source = fs.readFileSync(new URL('../OgreMaxLoader.js', import.meta.url), 'utf8')
  .replace("import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';", "import * as THREE from 'three';");

const tmpDir = dirname(fileURLToPath(import.meta.url));
const tmpFile = join(tmpDir, `tmp_OgreMaxLoader_${process.pid}_${Math.random().toString(36).slice(2)}.mjs`);
fs.writeFileSync(tmpFile, source);
export const mod = await import(pathToFileURL(tmpFile));
fs.unlinkSync(tmpFile);
