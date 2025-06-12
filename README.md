# OgreMax XML Loader for Three.js

A modern **ES2023** loader that converts the complete Ogre XML family into native Three.js objects:

* **`.scene`** → `THREE.Scene`
* **`.mesh`**  → `THREE.SkinnedMesh` (`BufferGeometry`, skin indices & weights)
* **`.skeleton`** → `THREE.Skeleton` + `THREE.AnimationClip[]`
* **`.material`** (via *DotMaterialLoader*) for per‑submesh materials

The loader supports recursive dependencies (scene → mesh → skeleton → materials), up‑axis correction and robust error handling through a dedicated `OgreMaxError` class.

---

## Features

| Category           | Details                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Geometry**       | Uses `BufferGeometry` and typed attributes (`position`, `normal`, `uv`, `skinIndex`, `skinWeight`).                            |
| **Skinning**       | Full bone hierarchy, up to four weights per vertex, animation clips automatically attached to the mesh.                        |
| **Materials**      | Loads companion `.material` files; sub‑entity indices are validated at runtime.                                                |
| **Error handling** | Structured exceptions (`E_IO`, `E_XML`, `E_FORMAT`, `E_RUNTIME`) — propagated to the user callback and the returned `Promise`. |
| **Caching**        | In‑memory cache (`Map`) avoids re‑parsing identical files.                                                                     |
| **ES modules**     | Ships as a pure ES module (no global side‑effects).                                                                            |

> **Compatibility** : Three.js **r160** or newer (post‑`Geometry`).

---

## Installation

```bash
# install via npm
npm install @your-scope/ogremax-loader three
```

or copy `OgreMaxLoader.js` next to your scripts.

---

## Quick start

```js
import * as THREE from 'three';
import { OgreMaxLoader } from '@your-scope/ogremax-loader';

const scene   = new THREE.Scene();
const loader  = new OgreMaxLoader();

loader.texturePath = './textures/'; // optional

loader.load('./models/level.scene',
  obj   => scene.add(obj),           // onLoad
  (l,t) => console.log(`${l/t*100}%`),
  err   => console.error(err)        // OgreMaxError
);
```

The method returns a `Promise`, so you can also:

```js
await loader.load('./robot.mesh');
```

### API surface

| Method                | Signature                                            | Description                                                         |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| **`load`**            | `(url, onLoad?, onProgress?, onError?) → Promise<…>` | Asynchronous loading. Errors reject the promise and call `onError`. |
| **`texturePath`**     | `string`                                             | Folder used when a `.material` file references external textures.   |
| **`withCredentials`** | `boolean`                                            | Forwarded to the internal `FileLoader`.                             |

See the JSDoc inside the source for advanced options.

---

## Migration notes from *three.XMLOgreLoader* (2014)

* Legacy `Geometry` → **`BufferGeometry`** (faster, future‑proof).
* Removed synchronous `loadSync`; use `await` instead.
* Errors are now instances of `OgreMaxError` rather than `console.error` strings.
* Public class renamed **`OgreMaxLoader`** and exported as ES module.
* Progress callbacks now receive `(loaded, total)` bytes, matching Three.js conventions.

---

## Changelog

See **[CHANGELOG.md](./CHANGELOG.md)** for version history.

---

## License

Creative Commons BY 3.0 — see `LICENSE` file for details.
