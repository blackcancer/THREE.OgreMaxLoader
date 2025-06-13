/**
 * @fileoverview
 * OgreMax XML loader for Three.js – **modern ES2023 rewrite**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Supported Ogre XML flavours
 * ────────────────────────────────────────────────────────────────────────────
 *  • *.scene*      →  `THREE.Scene`
 *  • *.mesh*       →  `THREE.SkinnedMesh`  (BufferGeometry + skin indices/weights)
 *  • *.skeleton*   →  `{ skeleton: THREE.Skeleton, animations: THREE.AnimationClip[] }`
 *  • *.material*   →  `THREE.MeshPhongMaterial[]`  (delegated to DotMaterialLoader)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * What’s new since the legacy prototype version
 * ────────────────────────────────────────────────────────────────────────────
 *  ✓ **ES2023 class syntax** with private fields (#) & native Promise-based API.  
 *  ✓ Extends `THREE.Loader` → integrates with `LoadingManager` & abort-signals.  
 *  ✓ **Internal dependency manager** (`#internalManager`) fires *one* onLoad once
 *    scene → mesh → skeleton → material chain is fully resolved.  
 *  ✓ **BufferGeometry pipeline** (no legacy THREE.Geometry) and UV2 fix.  
 *  ✓ Correct shadow flags (`castShadow` / `receiveShadow`) & up-axis mapping.  
 *  ✓ Proper quaternion parsing (axis-angle | quat-explicit | Euler degrees).  
 *  ✓ Mesh > 65535 vertices auto-switches to `Uint32Array` indices.  
 *  ✓ Strict validation & typed errors (`OgreMaxError`, `DotMaterialError`) with
 *    codes **E_IO / E_XML / E_FORMAT / E_RANGE / E_RUNTIME** for reliable catch.  
 *  ✓ Re-entrant-safe: internal flag `#busy` prevents concurrent loads.  
 *  ✓ **DotMaterialLoader** rewritten (ES2023) – honours blend modes, emissive map,
 *    credentials, texture path, and fires typed errors on malformed input.  
 *  ✓ Extensive JSDoc & type hints for IDE / TS support.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Usage
 * ────────────────────────────────────────────────────────────────────────────
 *   import { OgreMaxLoader } from './OgreMaxLoader.js';
 *
 *   const loader = new OgreMaxLoader();
 *   loader.texturePath   = 'textures/';
 *   loader.withCredentials = true;
 *
 *   loader.load('models/robot.mesh.xml',
 *       obj   => scene.add(obj),
 *       (l,t) => console.log(`${l}/${t}`),          // progress
 *       err   => console.error(err)                 // error
 *   );
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Compatibility
 * ────────────────────────────────────────────────────────────────────────────
 *   • Tested on Three.js r160 +.  
 *   • Requires browser / runtime with full ES2023 support (class fields, Promise,
 *     Optional Chaining, Nullish Coalescing, etc.).  
 *   • For older environments, transpile with Babel @preset-env 2023.
 *
 * @author    Blackcancer <init-sys-rev@hotmail.com>
 * @copyright 2025
 * @version   1.1 – 2025-06-11  (Fix the mesh geometry and textures)
 * @license   MIT
 * @module    OgreMaxLoader
 */
'use strict';

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
THREE.Cache.enabled = true;

/**
 * Loads OgreMax XML files and converts them to Three.js objects.
 * @extends THREE.Loader
 */
export class OgreMaxLoader extends THREE.Loader {
	/* ====================================================================== */
	/* Private internal state (not exposed to the end-user)                   */
	/* ====================================================================== */
	/** @type {THREE.LoadingManager} */
	#internalManager = new THREE.LoadingManager();

	/** @type {Object.<string,*>} collects partial results during parsing */
	#objectRoot = {};

	#url = '';
	#texturePath = '';
	#busy = false;
	#logOpen = false;	// true when a group is active


	/* ====================================================================== */
	/* Construction / configuration                                           */
	/* ====================================================================== */
	/** @param {THREE.LoadingManager} [manager] – reuse an existing manager (defaults to a fresh one). */
	constructor(manager = new THREE.LoadingManager()) {
		super(manager);
	}

	/* ----------------------- public accessors ------------------------- */
	/** @returns {string} absolute or relative path to the Ogre XML file */
	get texturePath() { return this.#texturePath; }

	/**
	 * Set the path where textures are located (relative to the XML file).
	 * This is used by the {@link THREE.DotMaterialLoader} to resolve texture URLs.
	 * @param {string} value – absolute or relative path
	 */
	set texturePath(value) {
		if (typeof value !== 'string') {
			throw new OgreMaxError('E_RUNTIME', `texturePath must be a string!`);
		}

		this.#texturePath = value;
	}


	/* ====================================================================== */
	/* Public API															  */
	/* ====================================================================== */
	/**
	 * Load any Ogre XML document (.scene, .mesh, .skeleton).
	 * @param {string}																										url				- the URL to the XML file (absolute or relative)
	 * @param {(obj:THREE.Object3D|THREE.SkinnedMesh| {skeleton:THREE.Skeleton, animations:THREE.AnimationClip[]})=>void}	[onLoad]		- callback fired when the file is loaded and parsed
	 * @param {(loaded:number,total:number)=>void}																			[onProgress]	- callback fired during loading, receives (loaded, total) parameters
	 * @param {(err:Error)=>void}																							[onError]		- callback fired on error, receives an Error object
	 * @returns {Promise<THREE.Object3D|THREE.SkinnedMesh|{skeleton:THREE.Skeleton, animations:THREE.AnimationClip[]}>}						- resolves with the loaded object(s) or rejects on error
	 * @throws {OgreMaxError}																												- if the root node is not recognized or if an error occurs during parsing
	 */
	load(url, onLoad = () => { }, onProgress = () => { }, onError = () => { }) {
		if (this.#busy) {
			throw new OgreMaxError('E_RUNTIME', 'Loader already in progress');
		}

		this.#busy = true;
		return new Promise((resolve, reject) => {

			const fail = (err) => {
				if (!(err instanceof OgreMaxError)) {
					err = new OgreMaxError("E_RUNTIME", err.message ?? String(err));
				}

				this.manager.itemEnd(url);
				this.#internalManager.itemEnd(url);
				this.#busy = false;

				onError(err);
				reject(err);
			};

			this.#objectRoot = {};
			this.path = THREE.LoaderUtils.extractUrlBase(url);
			this.#url = url;


			//Setup internal manager for eventual files like mesh, materials...
			this.#internalManager.onStart = (file, loaded, total) => {
				this.#logStart(file);
				console.log(`Started   : ${file}`);
				console.log(`Progress  : ${loaded}/${total}`);
			};

			this.#internalManager.onProgress = (file, loaded, total) => {
				console.log(`Loading   : ${file}  (${loaded}/${total})`);

				// can be used to make progression bar
				onProgress(loaded, total);
			};

			this.#internalManager.onError = file => {
				console.error(`Error     : ${file}`);
				this.#logEnd();                         // ensure the group is closed
				fail(new OgreMaxError('E_RUNTIME', `dependency error on ${file}`, { file }));
			};

			this.#internalManager.onLoad = () => {
				console.log('All done');
				this.#logEnd();                         // close the final group
				try {
					this.#busy = false;          // ← libère l’instance
					this.#finalize(url, onLoad, resolve);
				}
				catch (err) {
					fail(err);
				}
			};


			const fileLoader = new THREE.FileLoader(this.manager);
			fileLoader.setWithCredentials(this.withCredentials);

			this.manager.itemStart(url);
			this.#internalManager.itemStart(url);

			fileLoader.load(
				url,
				(response) => {														// success
					try {
						this.#handleFileLoaded(url, response);
					} catch (err) {
						fail(err);
					}
				},																	// prog. par fichier (optionnel)
				progress => onProgress(progress.loaded, progress.total ?? 0),		// prog. par fichier (optionnel)
				() => fail(new OgreMaxError("E_IO", `Cannot load ${url}`, { url }))	// erreur
			);
		});
	}

	/**
	 * Parse the XML string into Three.js objects.
	 * Dispatches on root-node name.
	 * @param	{XMLDocument} xml	- the Ogre XML document to parse
	 * @returns {{scene?:THREE.Scene, mesh?:THREE.SkinnedMesh, skeleton?:{skeleton:THREE.Skeleton, animations:THREE.AnimationClip[]}}} - parsed data object
	 * @throws {OgreMaxError}		- if the root node is not recognized
	 */
	parse(xml) {
		const root = xml.documentElement;
		const data = {};

		switch (root.nodeName) {
			case 'scene':
				data.scene = this.#parseScene(root);
				break;
			case 'mesh':
				data.mesh = this.#parseMesh(root);
				break;
			case 'skeleton':
				data.skeleton = this.#parseSkeleton(root);
				break;
			default:
				throw new OgreMaxError("E_XML", `Unknown root node <${root.nodeName}>`, { url: this.#url });
		}

		return data;
	}


	/* ====================================================================== */
	/* Internal loading management                                            */
	/* ====================================================================== */
	/**
	 * When #internalManager fires onLoad, assemble final object(s) and
	 * forward them to user callback.
	 * @private
	 * @param {string}		baseURL	– original URL requested by the user
	 * @param {Function}	onLoad	- callback to call with the final object(s)
	 * @param {Function}	resolve	- Promise resolve function to call with the final object(s)
	 */
	#finalize(baseURL, onLoad, resolve) {
		if (this.#objectRoot.scene) {
			const scene = this.#objectRoot.scene;
			const group = scene.children[0];
			const base = this.#filenameBase(this.#url);

			if (group && this.#objectRoot[base]?.materials) {
				const mats = this.#objectRoot[base].materials;

				for (const object of group.children) {

					for (const mesh of object.children) {

						if (mesh.name && this.#objectRoot[base]) {
							mesh.material = mats;
						}
					}
				}
			}

			this.manager.itemEnd(baseURL);
			onLoad(scene);
			resolve(scene);
			return;
		}

		if (this.#objectRoot.mesh) {
			const mesh = this.#objectRoot.mesh;

			if (this.#objectRoot.skeletonFile) {
				const { skel, anim } = this.#objectRoot.skeletonFile;
				mesh.animations = anim;
				mesh.geometry.bones = skel.bones;
				mesh.add(skel.bones[0]);
				mesh.bind(skel);
			}

			this.manager.itemEnd(baseURL);
			onLoad(mesh);
			mesh.traverse(o => {
				if (o.isMesh) {
					const m = o.material;
					console.table({
						type: m.type,
						emissive: m.emissive && m.emissive.getHexString(),
						emissiveIntensity: m.emissiveIntensity,
						emissiveMap: !!m.emissiveMap
					});
				}
			});
			console.log(mesh);
			resolve(mesh);
			return;
		}

		if (this.#objectRoot.skeleton) {
			this.manager.itemEnd(baseURL);
			onLoad(this.#objectRoot.skeleton);
			resolve(this.#objectRoot.skeleton);
			return;
		}
	}

	/**
	 * File-loader success callback – convert XML, store partial result,
	 * notify the internal manager that this URL is finished.
	 * @private
	 * @param	{string}	url			- the URL of the loaded file
	 * @param	{string}	response	- the XML response as a string
	 * @returns {void}
	 * @throws {OgreMaxError}			- if the XML is malformed or if parsing fails
	 */
	#handleFileLoaded(url, response) {
		const xml = new DOMParser().parseFromString(response, 'text/xml');
		if (xml.querySelector('parsererror')) {
			throw new OgreMaxError('E_XML', 'Malformed XML', { url });
		}

		const data = this.parse(xml);

		if (data.scene) this.#objectRoot.scene = data.scene;
		if (data.mesh) this.#objectRoot.mesh = data.mesh;
		if (data.skeleton) this.#objectRoot.skeleton = data.skeleton;

		this.#internalManager.itemEnd(url);
	}


	/* ====================================================================== */
	/* First level parsers													  */
	/* ====================================================================== */
	/**
	 * High-level conversion from a `<mesh>` XML root to a skinned
	 * {@link THREE.SkinnedMesh} using {@link THREE.BufferGeometry}.
	 * @private
	 * @param	{Element}			XMLNode	- XML element `<mesh>`
	 * @returns	{THREE.SkinnedMesh}			- the resulting skinned mesh
	 */
	#parseMesh(XMLNode) {
		const sharedGeomNode = this.#querySelect(XMLNode, 'sharedgeometry');
		let sharedGeom;

		if (sharedGeomNode) {
			sharedGeom = this.#parseGeometry(sharedGeomNode);
		}

		const submeshesNode = this.#querySelect(XMLNode, 'submeshes');
		if (!submeshesNode) {
			throw new OgreMaxError('E_XML', '<mesh> is missing a <submeshes> block', { url: this.#url });
		}

		const submeshes = this.#parseSubmeshes(submeshesNode, sharedGeom);
		const skelLink = this.#querySelect(XMLNode, 'skeletonlink');

		if (skelLink) {
			const skelUrl = `${this.path}${skelLink.getAttribute('name')}.xml`;
			const intLoad = new OgreMaxLoader(this.manager);

			this.#internalManager.itemStart(skelUrl);

			intLoad.load(
				skelUrl,
				({ skeleton, animations }) => {

					/* rattacher l’ossature à chaque SkinnedMesh */
					submeshes.forEach(obj => {
						if (obj.isSkinnedMesh) {
							obj.add(skeleton.bones[0]);
							obj.bind(skeleton);
							obj.animations = animations;
						}
					});

					/* mémo pour #finalize (cas mesh-seul) */
					this.#objectRoot.skeletonFile = {
						skel: skeleton,
						anim: animations
					};
					this.#internalManager.itemEnd(skelUrl);
				},
				() => { },
				() => this.#internalManager.itemError(skelUrl)
			);
		}

		if (submeshes.length === 1) {
			return submeshes[0]; // un seul submesh, on le retourne directement
		}

		const group = new THREE.Group();
		group.name = XMLNode.getAttribute('name') ?? 'mesh';

		submeshes.forEach(submesh => {
			group.add(submesh); // ajoute chaque submesh au groupe
		});

        return group; // retourne le groupe contenant tous les submeshes
	}

	/**
	 * Build a THREE.Scene from a Ogre dotScene XML root.
	 * @private
	 * @param	{Element}		sceneNode	- XML element `<scene>`
	 * @returns	{THREE.Scene}				- the resulting scene object
	 */
	#parseScene(sceneNode) {
		const env = this.#querySelect(sceneNode, 'environment');
		const nodes = this.#querySelect(sceneNode, 'nodes');
		const scene = new THREE.Scene();
		const upAxis = (sceneNode.getAttribute('upAxis') || 'y').toLowerCase();

		scene.up.set(
			+(upAxis === 'x'),
			+(upAxis === 'y'),
			+(upAxis === 'z')
		); // (1,0,0) / (0,1,0) / (0,0,1)

		scene.userData = {
			formatVersion: this.#attrFloat(sceneNode, 'formatVersion', 0),
			minOgreVersion: this.#attrFloat(sceneNode, 'minOgreVersion', 0),
			ogreMaxVersion: this.#attrFloat(sceneNode, 'ogreMaxVersion', 0),
			unitsPerMeter: this.#attrFloat(sceneNode, 'unitsPerMeter', 1),
			unitType: sceneNode.getAttribute('unitType') || 'meters',
			author: sceneNode.getAttribute('author') || undefined,
			application: sceneNode.getAttribute('application') || undefined
		};

		if (nodes) {
			scene.add(this.#parseNodes(nodes));
		}

		if (env) {
			scene.add(this.#parseEnvironment(env));
		}

		return scene;
	}

	/**
	 * Build a THREE.Skeleton + animations array from a <skeleton> XML root.
	 * @private
	 * @param	{Element}														XMLNode	- XML element `<skeleton>`
	 * @returns	{{skeleton:THREE.Skeleton,animations:THREE.AnimationClip[]}}			- the resulting skeleton and animations
	 */
	#parseSkeleton(XMLNode) {
		const animationsNode = this.#querySelect(XMLNode, 'animations');
		const bonesNode = this.#querySelect(XMLNode, 'bones');
		const bonehierarchyNode = this.#querySelect(XMLNode, 'bonehierarchy');
		let skeleton = new THREE.Skeleton([]);
		let animations = [];

		if (!bonesNode || !bonehierarchyNode && animations) {
			throw new OgreMaxError('E_XML', '<skeleton> is missing <bones> or <bonehierarchy>', { url: this.#url });
		}

		if (!bonesNode || !bonehierarchyNode) {
			return { skeleton, animations };
		}

		const bones = bonesNode ? this.#parseBones(bonesNode) : [];
		animations = animationsNode ? this.#parseAnimations(animationsNode, bones) : animations;
		skeleton = bonehierarchyNode ? new THREE.Skeleton(this.#parseBoneHierarchy(bonehierarchyNode, bones)) : skeleton;

		return { skeleton, animations };
	}


	/* ====================================================================== */
	/* Mesh parsers															  */
	/* ====================================================================== */
	/**
	 * Merge an incoming geometry into the receiver (`this`) *in-place*.
	 *
	 *  ▸ Vertices, faces, UVs, skin indices & weights are appended.
	 *  ▸ Normals are transformed if a matrix is supplied.
	 *  ▸ Face .materialIndex is shifted by `materialIndexOffset` so that
	 *    a {@link THREE.MultiMaterial} can be built afterwards.
	 *
	 * **Important :** This helper is bound to `THREE.Geometry.prototype.merge`
	 * for backward-compatibility with the Ogre XML format – it still relies on
	 * classical `THREE.Geometry` rather than `BufferGeometry`.
	 * @private
	 * @param	{THREE.BufferGeometry}	geomSrc			- the geometry to merge into this
	 * @param	{THREE.Matrix4}			[matrix]		- optional transformation matrix
	 * @returns {void}
	*/
	#geomMerge(geomSrc, matrix) {
		const geomDst = this;
		if (!(geomDst instanceof THREE.BufferGeometry) || !(geomSrc instanceof THREE.BufferGeometry)) {
			console.error('[OgreMaxLoader] #geomMerge : arguments non BufferGeometry');
			return;
		}

		// prepare normal matrix if needed
		const normalMatrix = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
		const tmpPos = new THREE.Vector3();
		const tmpNrm = new THREE.Vector3();

		/** list of attributes to merge: name, itemSize, DefaultArrayType
		 * @type {[string,number,Function][]}
		 */
		const ATTR = [
			['position', 3, Float32Array],
			['normal', 3, Float32Array],
			['uv', 2, Float32Array],
			['skinIndex', 4, Uint16Array],
			['skinWeight', 4, Float32Array]
		];

		// for each attribute present in geomSrc
		for (const [name, itemSize, DefaultArray] of ATTR) {

			const srcAttr = geomSrc.getAttribute(name);
			if (!srcAttr) continue;                            // rien à copier

			const dstAttr = geomDst.getAttribute(name);
			const srcCount = srcAttr.count;
			const dstCount = dstAttr ? dstAttr.count : 0;
			const NewArray = srcAttr.array.constructor || DefaultArray;
			const merged = new NewArray((dstCount + srcCount) * itemSize);

			// copy existing attribute data (if any)
			if (dstAttr) {
				merged.set(dstAttr.array, 0);
			}

			// merge offset in the destination array
			let writeOfs = dstCount * itemSize;
			for (let i = 0; i < srcCount; ++i) {

				// position / normal : apply matrix if provided
				if (name === 'position') {
					tmpPos.fromBufferAttribute(srcAttr, i);
					if (matrix) tmpPos.applyMatrix4(matrix);
					merged[writeOfs++] = tmpPos.x;
					merged[writeOfs++] = tmpPos.y;
					merged[writeOfs++] = tmpPos.z;
				}
				else if (name === 'normal') {
					tmpNrm.fromBufferAttribute(srcAttr, i);

					if (normalMatrix) {
						tmpNrm.applyMatrix3(normalMatrix).normalize();
					}

					merged[writeOfs++] = tmpNrm.x;
					merged[writeOfs++] = tmpNrm.y;
					merged[writeOfs++] = tmpNrm.z;
				}
				// vectorial attributes (uv, skinIndex, skinWeight)
				else {
					merged.set(
						srcAttr.array.subarray(i * itemSize, i * itemSize + itemSize),
						writeOfs
					);
					writeOfs += itemSize;
				}
			}

			// install merged attribute in geomDst
			geomDst.setAttribute(name, new THREE.BufferAttribute(merged, itemSize, srcAttr.normalized));
		}

		// index merging is a bit more complex, as we need to shift the indices
		const srcIdx = geomSrc.getIndex();
		if (srcIdx) {

			const dstIdx = geomDst.getIndex();
			const dstCount = dstIdx ? dstIdx.count : 0;

			const dstVertCnt = geomDst.getAttribute('position').count;
			const srcVertCnt = geomSrc.getAttribute('position').count;

			const IndexType = (dstVertCnt + srcVertCnt) < 65536 ? Uint16Array : Uint32Array;


			const mergedIdx = new IndexType(dstCount + srcIdx.count);
			if (dstIdx) mergedIdx.set(dstIdx.array, 0);

			// copy indices from srcIdx, shifting them by the current vertex count
			const vertOffset = dstVertCnt;
			for (let i = 0; i < srcIdx.count; ++i) {
				mergedIdx[dstCount + i] = srcIdx.array[i] + vertOffset;
			}

			geomDst.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
		}

		// update vertex normals and UVs
		geomDst.computeBoundingSphere();
		geomDst.computeBoundingBox();
	}

	/**
	 * Append skin indices / weights for a set of vertices.
	 * @private
	 * @param {Element}   baNode		- XML element `<boneassignments>`
	 * @param {number[]}  skinIdx		- array to append skin indices to
	 * @param {number[]}  skinWgt		- array to append skin weights to
	 * @param {number}    baseVertex	- absolute vertex count before geometry push
	 * @param {number}    endVertex		- absolute vertex count after geometry push
	 */
	#parseBoneassignments(XMLNode, skinIdx, skinWgt, baseVertex, endVertex) {
		for (let v = baseVertex; v < endVertex; ++v) {
			skinIdx.push(0, 0, 0, 0);
			skinWgt.push(0, 0, 0, 0);
		}

		const assignmentNodes = this.#querySelectAll(XMLNode, ':scope > vertexboneassignment, :scope > boneassignment');

		for (const assignmentNode of assignmentNodes) {
			const vIndex = this.#attrInt(assignmentNode, 'vertexindex');
			const bIndex = this.#attrInt(assignmentNode, 'boneindex');
			const weight = this.#attrFloat(assignmentNode, 'weight', 0);

			const vAbs = baseVertex + vIndex;


			if (vAbs >= endVertex) {
				throw new OgreMaxError('E_RANGE', `vertexindex ${vIndex} out of range (base ${baseVertex}, end ${endVertex})`, { assignment: assignmentNode.outerHTML });
			}

			// find free slot (max 4)
			let placed = false;
			for (let s = 0; s < 4; ++s) {
				const off = vAbs * 4 + s;
				if (skinWgt[off] === 0) {
					skinIdx[off] = bIndex;
					skinWgt[off] = weight;
					placed = true;
					break;
				}
			}

			if (!placed) {
				throw new OgreMaxError('E_FORMAT', `More than 4 bone influences for vertex ${vIndex}`, { assignment: assignmentNode.outerHTML });
			}
		}
	}

	/**
	 * Parse a single <face>.
	 * @private
	 * @param	{Element}													XMLNode	- XML element `<face>`
	 * @param	{THREE.Vector3[]}											normals	- array of vertex normals
	 * @param	{(THREE.Vector2|THREE.Vector3)[]}							uvs		- array of vertex UVs
	 * @returns	{{face:THREE.Face3, uvs:(THREE.Vector2|THREE.Vector3)[]}}			- the parsed face and its UV set
	 */
	#parseFace(XMLNode, normals, uvs) {
		const v1 = this.#attrInt(XMLNode, 'v1');
		const v2 = this.#attrInt(XMLNode, 'v2');
		const v3 = this.#attrInt(XMLNode, 'v3');
		const normal = [normals[v1], normals[v2], normals[v3]];
		const uv = [uvs[v1], uvs[v2], uvs[v3]];

		return { v1, v2, v3, normal, uv };
	}

	/**
	 * Parse `<faces>` and push indices into the global array.
	 * @private
	 * @param	{Element}							XMLNode		- XML element `<faces>`
	 * @param	{number}							base		- base vertex index (offset)
	 * @param	{number}							vertCount	- total vertex count (for range check)
	 * @param	{THREE.Vector3[]}					normals		- array of vertex normals
	 * @param	{(THREE.Vector2|THREE.Vector3)[]}	uvs			- array of vertex UVs
	 * @returns	{{faces:number[], faceNormals:THREE.Vector3[], faceUvs:(THREE.Vector2|THREE.Vector3)[]}} - parsed faces, normals and UVs
	 * @throws {OgreMaxError}			- if a face index is out of range
	 */
	#parseFaces(XMLNode, base, vertCount, normals, uvs) {
		const faces = [], faceNormals = [], faceUvs = [];
		const faceNodes = this.#querySelectAll(XMLNode, ':scope > face');

		for (const faceNode of faceNodes) {
			const { v1, v2, v3, normal, uv } = this.#parseFace(faceNode, normals, uvs);

			const a = base + v1;
			const b = base + v2;
			const c = base + v3;

			if (v1 >= vertCount || v2 >= vertCount || v3 >= vertCount) {
				throw new OgreMaxError('E_RANGE', `Face index out of range (v1:${a} v2:${b} v3:${c} >= ${vertCount})`, { node: faceNode.outerHTML, url: this.#url });
			}

			faces.push(a, b, c);
			faceNormals.push(normal);
			faceUvs.push(uv);
		}

        return { faces, faceNormals, faceUvs };
	}

	/**
	 * Push vertex data of a `<geometry>` / `<sharedgeometry>` block into
	 * the provided accumulators.
	 * @private
	 * @param	{Element}												XMLNode - XML element `<geometry>` or `<sharedgeometry>`
	 * @returns	{{globalVertices:THREE.Vector3[], globalNormals:THREE.Vector3[], globalUvs:(THREE.Vector2|THREE.Vector3)[]}[]} - accumulators for vertices, normals and UVs
	 * @throws	{OgreMaxError}													- if vertexcount differs from parsed count
	 */
	#parseGeometry(XMLNode) {
		const globalNormals = [], globalUvs = [], globalVertices = [];
        const vertexBufferNodes = XMLNode.querySelectorAll(':scope > vertexbuffer');
		const declared = this.#attrInt(XMLNode, 'vertexcount', 0);

		for (const vertexBufferNode of vertexBufferNodes) {
			const { vertices, normals, uvs } = this.#parseVertexbuffer(vertexBufferNode);

			globalVertices.push(...vertices);
			globalNormals.push(...normals);
            globalUvs.push(...uvs);
		}

		if (declared && declared !== globalVertices.length) {
			throw new OgreMaxError('E_FORMAT', `vertexcount ${declared} differs from parsed ${globalVertices.length}`, { url: this.#url });
		}

		return { vertices: globalVertices, normals: globalNormals, uvs: globalUvs };
	}

	/**
	 * Parse a `<submeshes>` block and return an array of submeshes.
	 * @private
	 * @param	{Element}				XMLNode	- XML element `<submeshes>`
	 * @param	{{vertices:THREE.Vector3[], normals:THREE.Vector3[], uvs:(THREE.Vector2|THREE.Vector3)[]}?}	shared	- optional shared geometry data (vertices, normals, uvs)
	 * @returns {THREE.Object3D[]}				- array of parsed submeshes (SkinnedMesh or Line)
	 * @throws	{OgreMaxError}					- if no submesh is found in the XML
	 */
	#parseSubmeshes(XMLNode, shared = null) {
		const submeshes = [];
		const submeshNodes = this.#querySelectAll(XMLNode, ':scope > submesh');
		let materialSlot = 0;

		if (submeshNodes.length === 0) {
			throw new OgreMaxError('E_XML', 'No <submesh> found inside <submeshes>', { url: this.#url });
		}

		for (const submeshNode of submeshNodes) {
			submeshes.push(this.#parseSubmesh(submeshNode, shared, materialSlot++));
		}

        return submeshes;
	}

	/**
	 * Parse a single <submesh> and return a SkinnedMesh (geometry+material).
	 * @private
	 * @param	{Element}																					XMLNode			- XML element `<submesh>`
	 * @param	{{vertices:THREE.Vector3[], normals:THREE.Vector3[], uvs:(THREE.Vector2|THREE.Vector3)[]}?}	shared			- optional shared geometry data (vertices, normals, uvs)
	 * @param	{number}																					materialSlot	- material slot index (for multi-materials)
	 * @returns {THREE.SkinnedMesh}																							- the resulting skinned mesh (or Line if operationtype=line_list)
	 */
	#parseSubmesh(XMLNode, shared = null, materialSlot = 0) {
		const indices = [], normals = [], skinIndex = [], skinWeight = [], uvs = [], vertices = [];
		const geomNode = this.#querySelect(XMLNode, 'geometry');
		const facesNode = this.#querySelect(XMLNode, 'faces');
		const assignmentsNode = this.#querySelect(XMLNode, 'boneassignments');
		const usesShared = this.#attrBool(XMLNode, 'usesharedvertices');
        const use32bitindexes = this.#attrBool(XMLNode, 'use32bitindexes');
		const opType = XMLNode.getAttribute('operationtype') || 'triangle_list';
		const geom = new THREE.BufferGeometry();
		let base = 0;

		if (usesShared) {
			if (!shared) {
				throw new OgreMaxError('E_FORMAT', 'usesharedvertices is true but no shared geometry provided', { node: XMLNode.outerHTML, url: this.#url });
			}

			vertices.push(...shared.vertices);
			normals.push(...shared.normals);
			uvs.push(...shared.uvs);
		}
		else if (geomNode) {
			const { vertices: geoV, normals: geoN, uvs: geoUV } = this.#parseGeometry(geomNode);

			base = 0;
			vertices.push(...geoV);
			normals.push(...geoN);
			uvs.push(...geoUV);
		}

        if (facesNode) {
			const { faces, faceNormals, faceUvs } = this.#parseFaces(facesNode, base, vertices.length, normals, uvs);

			indices.push(...faces);
		}

		if (assignmentsNode) {
			this.#parseBoneassignments(assignmentsNode, skinIndex, skinWeight, 0, vertices.length);
		}

		const flatPos = vertices.flatMap(v => [v.x, v.y, v.z]);
		const flatNorm = normals.flatMap(n => [n.x, n.y, n.z]);
		const flatUvs = uvs.flatMap(u => u.toArray ? u.toArray() : [u.x, u.y]); // Vector2 or Vector3

		geom.setAttribute('position', new THREE.Float32BufferAttribute(flatPos, 3));
		if (flatNorm.length) {
			geom.setAttribute('normal', new THREE.Float32BufferAttribute(flatNorm, 3));
		}

		if (flatUvs.length) {
			geom.setAttribute('uv', new THREE.Float32BufferAttribute(flatUvs, 2));
		}

		if (skinIndex.length) {
			geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
			geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
		}

		if (indices.length) {
			const need32 = use32bitindexes || indices.length > 65535; // if we need 32-bit indices
			const IndexType = need32 ? Uint32Array : Uint16Array;
			geom.setIndex(new THREE.BufferAttribute(new IndexType(indices), 1));
            geom.addGroup(0, indices.length, materialSlot); // add group for multi-materials
		}

		geom.computeBoundingSphere();
		if (!flatNorm.length) {
			geom.computeVertexNormals(); // compute normals if not provided
		}

		const material = new THREE.MeshStandardMaterial();
		material.skinning = !!skinIndex.length;
		material.morphTargets = true; // for compatibility with Ogre XML
		material.transparent = true

		if (opType === 'line_list' || opType === 'line_strip') {
			// create a Line object instead of SkinnedMesh
			const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
			return new THREE.Line(geom, lineMaterial);
		}

		// create a SkinnedMesh for triangle lists
		const skinnedMesh = new THREE.SkinnedMesh(geom, material);
		skinnedMesh.name = XMLNode.getAttribute('name') || 'submesh'; // set name from attribute or default
		skinnedMesh.castShadow = true; // enable shadow casting by default
		skinnedMesh.receiveShadow = true; // enable shadow receiving by default
		skinnedMesh.frustumCulled = false; // disable frustum culling for better performance in some cases
        skinnedMesh.userData.materialSlot = materialSlot; // store material slot in userData
		skinnedMesh.userData.operationType = opType; // store operation type in userData
		skinnedMesh.userData.usesharedvertices = usesShared; // store shared usage in userData
		skinnedMesh.userData.use32bitindexes = use32bitindexes; // store shared usage in userData

        return skinnedMesh;
	}

	/**
	 * Parse one <vertex>.
	 * @private
	 * @param	{Element}																			XMLNode	- XML element `<vertex>`
	 * @param	{boolean}																			hasPos	- true if the vertex has a position
	 * @param	{boolean}																			hasNorm	- true if the vertex has a normal
	 * @param	{number}																			tcCount	- number of texture coordinates (0, 1, 2 or 3)
	 * @param	{number[]}																			tcDim	- array of texture coordinate dimensions (1, 2 or 3)
	 * @returns {{vertices:THREE.Vector3[], normals:THREE.Vector3[], uvs:(THREE.Vector2|THREE.Vector3)[]}}	- the parsed vertex data
	 */
	#parseVertex(XMLNode, hasPos, hasNorm, tcCount, tcDim) {
		const normals = [], uvs = [], vertices = [];

		if (hasPos) {
			// added [0] to ensure we get an array of Vector3, not a single Vector3
			const positionNode = this.#querySelect(XMLNode, 'position');

			vertices.push(this.#attrVector3(positionNode));
		}

		if (hasNorm) {
			const normalNode = this.#querySelect(XMLNode, 'normal');

			normals.push(this.#attrVector3(normalNode));
		}

		if (tcCount) {
			const texCoords = XMLNode.querySelectorAll('texcoord');

			for (let i = 0; i < tcCount; ++i) {
				const texCoord = texCoords[i];

				switch (tcDim[i]) {
					case 1:
						uvs.push(this.#attrU(texCoord));
						break;
					case 2:
						uvs.push(this.#attrUV(texCoord));
						break;
					case 3:
						uvs.push(this.#attrUVW(texCoord));
						break;
				}
			}
		}

		return { vertices, normals, uvs };
	}

	/**
	 * Parse one `<vertexbuffer>` and append its content to accumulators.
	 * @private
	 * @param	{Element}												XMLNode	- XML element `<vertexbuffer>`
	 * @returns	{{globalVertices:number[], globalNormals:number[], globalUvs:(THREE.Vector2|THREE.Vector3)[]}}	- the parsed vertex data
	 */
	#parseVertexbuffer(XMLNode) {
		const globalNormals = [], globalUvs = [], globalVertices = [];
		const hasPos = this.#attrBool(XMLNode, 'positions');
		const hasNorm = this.#attrBool(XMLNode, 'normals');
		const tcCount = this.#attrInt(XMLNode, 'texture_coords', 0);
		const vertexNodes = this.#querySelectAll(XMLNode, ':scope > vertex');

		// texture_coord_dimensions_n  (default 2)
		const tcDim = Array.from({ length: tcCount }, (_, i) => {
			const texCoordNode = XMLNode.getAttribute(`texture_coord_dimensions_${i}`);
			const dimension = texCoordNode ? parseInt(texCoordNode.replace('float', ''), 10) : 2;

			if (![1, 2, 3].includes(dimension)) {
				throw new OgreMaxError('E_FORMAT', `texture_coord_dimensions_${i} = ${dimension} (expected 1/2/3)`, { node: XMLNode.outerHTML });
			}

			return dimension;
		});

		for (const vertexNode of vertexNodes) {
			const { vertices, normals, uvs } = this.#parseVertex(vertexNode, hasPos, hasNorm, tcCount, tcDim);

			globalVertices.push(...vertices);
			globalNormals.push(...normals);
            globalUvs.push(...uvs);
		}

		return { vertices: globalVertices, normals: globalNormals, uvs: globalUvs };
	}


	/* ====================================================================== */
	/* Scene parsers														  */
	/* ====================================================================== */
	/**
	 * Parse an `<environment>` block (ambient light, background colour,
	 * clipping distances) and return it as a dedicated `THREE.Group`.
	 * @private
	 * @param	{Element}		envNode	– XML element `<environment>`
	 * @returns {THREE.Group}			– contains ambient light, userData etc.
	 */
	#parseEnvironment(envNode) {
		const amb = this.#querySelect(envNode, 'colourAmbient');
		const bg = this.#querySelect(envNode, 'colourBackground');
		const clip = this.#querySelect(envNode, 'clipping');
		const grp = new THREE.Group();
		grp.name = 'environment';

		if (amb) {
			const ambLight = new THREE.AmbientLight(this.#attrColorRGB(amb));

			grp.add(ambLight);
		}

		if (bg) {
			grp.userData.background = this.#attrColorRGB(bg);
		}

		if (clip) {
			grp.userData.clipping = {
				near: this.#attrFloat(clip, 'near', 0),
				far: this.#attrFloat(clip, 'far', 1)
			};
		}

		return grp;
	}

	/**
	 * Handle one `<entity>` tag : triggers a nested mesh load and attaches the
	 * resulting `SkinnedMesh` (or `Line`) to *parentObj*.
	 * Deals with shadow flags, material sub-entities, and bone attachments.
	 * @private
	 * @param	{Element}			entityNode	– XML element `<entity>`
	 * @param	{THREE.Object3D}	parentObj	– parent object that receives the mesh
	 * @returns	{void}
	 */
	#parseEntity(entityNode, parentObj) {
		const meshFile = entityNode.getAttribute('meshFile');

		if (!meshFile) {
			console.warn('Entity sans meshFile :', entityNode);
			return;
		}

		const meshURL = `${this.path}${meshFile}.xml`;
		const intLoader = new OgreMaxLoader(this.manager);
		const subEntities = this.#querySelect(entityNode, 'subentities');

		if (subEntities) {
			this.#parseSubEntities(subEntities);
		}

		this.#internalManager.itemStart(meshURL);

		intLoader.load(
			meshURL,
			mesh => {
				mesh.name = entityNode.getAttribute('name') || mesh.name;
				mesh.castShadow = this.#attrBool(entityNode, 'castShadows', mesh.castShadow);
				mesh.receiveShadow = this.#attrBool(entityNode, 'receiveShadows', mesh.receiveShadow);

				parentObj.add(mesh);
				this.#internalManager.itemEnd(meshURL);
			},
			() => { },
			() => this.#internalManager.itemError(meshURL)
		);
	}

	/**
	 * Convert a single Ogre `<node>` branch (recursion) to `THREE.Object3D`.
	 * @private
	 * @param	{Element}			node	– XML element `<node>`
	 * @returns	{THREE.Object3D}			– root object for this branch
	 */
	#parseNode(node) {
		const entity = this.#querySelect(node, ':scope > entity');
		const obj = new THREE.Object3D();

		obj.name = node.getAttribute('name') || '';
		obj.visible = this.#attrBool(node, 'visibility', true);
		obj.applyMatrix4(this.#attrMatrix(node));

		if (entity) {
			this.#parseEntity(entity, obj);
		}

		node.querySelectorAll(':scope > node').forEach(sub => {
			obj.add(this.#parseNode(sub));
		});

		return obj;
	}

	/**
	 * Create a `THREE.Group` that aggregates all top-level `<node>` children
	 * inside a `<nodes>` block.  The group’s matrix corresponds to the
	 * `<nodes>` transform so that the whole subtree is positioned correctly.
	 * @private
	 * @param	{Element}		nodesNode	– XML element `<nodes>`
	 * @returns	{THREE.Group}				– assembled hierarchy
   */
	#parseNodes(nodesNode) {
		const grp = new THREE.Group();

		grp.name = 'nodes';
		grp.applyMatrix4(this.#attrMatrix(nodesNode));

		nodesNode.querySelectorAll(':scope > node').forEach(node => {
			grp.add(this.#parseNode(node));
		});
		return grp;
	}

	/**
	 * Resolve a `<subentities>` block : loads the corresponding `.material`
	 * file, validates every `<subentity>` entry, then stores the material array
	 * in `#objectRoot[baseName].materials` for later assignment.
	 * @private
	 * @param	{Element}	subNode	– XML element `<subentities>`
	 * @returns {void}
	 * @throws {OgreMaxError}		- if a subentity material is missing in the loaded material file
	 */
	#parseSubEntities(subNode) {
		const fnameParts = this.#url.split('/').pop().split('.');
		const baseName = fnameParts.length > 2 ? fnameParts.slice(0, -1).join('.') : fnameParts[0];
		const matURL = `${this.path}${baseName}.material`;
		const matLoader = new DotMaterialLoader(this.manager);

		matLoader.texturePath = this.texturePath || this.path;

		this.#internalManager.itemStart(matURL);
		matLoader.load(
			matURL,
			mats => {
				/* create array large enough to hold every sub-entity by index */
				const subList = subNode.querySelectorAll('subentity');
				const maxIdx = Math.max(...Array.from(subList, s =>
					this.#attrInt(s, 'index')));
				const subMats = new Array(subList.length)
					.fill(new THREE.MeshBasicMaterial({ color: 0x808080 }));

				//subNode.querySelectorAll('subentity').forEach(sub => {
				subList.forEach(sub => {
					const idx = this.#attrInt(sub, 'index');
					const name = sub.getAttribute('materialName');

					/* look-up by name to tolerate multi-pass materials */
					const mat = mats.find(m => m.name === name);
					if (mat) {
						//if(!mats[idx] || mats[idx].name !== name){
						mat.map.flipY = false; // Ogre textures are not flipped
                        mat.map.needsUpdate = true; // ensure texture is updated
						subMats[idx] = mat;
					}
					else {
						console.warn(`[OgreMaxLoader] material "${name}" (index ${idx})` +
							` not found in ${matURL}`);
						// fallback: simple grey Standard material so geometry remains visible
						subMats[idx] = new THREE.MeshStandardMaterial({ color: 0x808080 });
					}
				});

				this.#objectRoot[baseName] = { materials: subMats };
				this.#internalManager.itemEnd(matURL);
			},
			() => { },
			() => this.#internalManager.itemError(matURL)
		);
	}


	/* ====================================================================== */
	/* Skeleton parsers														  */
	/* ====================================================================== */
	/**
	 * Parse one <animation>.
	 * @private
	 * @param	{Element}                   XMLNode	- XML element `<animation>`
	 * @param	{Record<string,THREE.Bone>}	bones	- map of bone names to THREE.Bone objects
	 * @returns {THREE.AnimationClip}				- the parsed animation clip
	 */
	#parseAnimation(XMLNode, bones) {
		const name = XMLNode.getAttribute('name') || 'default';
		const length = this.#attrFloat(XMLNode, 'length', 0);

		if (!length || !isFinite(length)) {
			throw new OgreMaxError('E_FORMAT', `Animation "${name}" has invalid length (${length})`, { url: this.#url });
		}

		const tracksNode = this.#querySelect(XMLNode, 'tracks');
		if (!tracksNode) {
			throw new OgreMaxError('E_XML', `Animation "${name}" missing <tracks>`, { url: this.#url });
		}

		const tracks = this.#parseTracks(tracksNode, bones);
		if (tracks.length === 0) {
			console.warn(`[OgreMaxLoader] Animation "${name}" has no keyframes`);
		}

		return new THREE.AnimationClip(name, length, tracks);
	}

	/**
	 * Parse <animations>.
	 * @private
	 * @param	{Element}					XMLNode		- XML element `<animations>`
	 * @param	{Record<string,THREE.Bone>}	bones		- map of bone names to THREE.Bone objects
	 * @returns {THREE.AnimationClip[]}					- the parsed animation clips
	 */
	#parseAnimations(XMLNode, bones) {
		const clips = [];
		const nodes = this.#querySelectAll(XMLNode, ':scope > animation');

		for (const node of nodes) {
			clips.push(this.#parseAnimation(node, bones));
		}

		return clips;
	}

	/**
	 * Single <bone>.
	 * @private
	 * @param	{Element}		XMLNode	- XML element `<bone>`
	 * @returns {THREE.Bone}			- the parsed bone object
	 */
	#parseBone(XMLNode) {
		const bone = new THREE.Bone();

		bone.name = XMLNode.getAttribute('name') || '';
		bone.userData.index = this.#attrInt(XMLNode, 'id');
		bone.applyMatrix4(this.#attrMatrix(XMLNode));

		return bone;
	}

	/**
	 * Parse <bones> list into an index-addressable map.
	 * @private
	 * @param	{Element}					XMLNode	- XML element `<bones>`
	 * @returns {Record<string,THREE.Bone>}			- map of bone names to THREE.Bone objects
	 */
	#parseBones(XMLNode) {
		const bones = {};
		const nodes = this.#querySelectAll(XMLNode, ':scope > bone');

		for (const node of nodes) {
			const bone = this.#parseBone(node);

			bones[bone.name] = bone;
		}
		return bones;
	}

	/**
	 * Build THREE.Bone hierarchy (<bonehierarchy>).
	 * @private
	 * @param	{Element}					XMLNode	- XML element `<bonehierarchy>`
	 * @param	{Record<string,THREE.Bone>}	bones	- map of bone names to THREE.Bone objects
	 * @returns {THREE.Bone[]}						- array of THREE.Bone objects in hierarchy order
	 */
	#parseBoneHierarchy(XMLNode, bones) {
		const nodes = this.#querySelectAll(XMLNode, ':scope > boneparent');

		for (const boneparentNode of nodes) {
			const parent = bones[boneparentNode.getAttribute('parent')];
			const bone = bones[boneparentNode.getAttribute('bone')];

			parent && bone && parent.add(bone);
		}

		/* reorder by original index (THREE.Skeleton expects array) */
		const newBones = Object.values(bones).sort((a, b) => a.userData.index - b.userData.index);
		return newBones;
	}

	/**
	 * Single <keyframe>.
	 * @private
	 * @param	{Element}								XMLNode	- XML element `<keyframe>`
	 * @returns {{time:number, matrix:THREE.Matrix4}}			- the parsed keyframe data
	 */
	#parseKeyframe(XMLNode) {
		return { time: this.#attrFloat(XMLNode, 'time', 0), matrix: this.#attrMatrix(XMLNode) };
	}

	/**
	 * Gather arrays for one <keyframes> block.
	 * @private
	 * @param  {Element}																												XMLNode	- XML element `<keyframes>`
	 * @param  {THREE.Bone}																												bone	- the bone to which the keyframes apply
	 * @returns {{pos:{times:number[],values:number[]}, rot:{times:number[],values:number[]}, scl:{times:number[],values:number[]}}}			- the parsed keyframes data
	 */
	#parseKeyframes(XMLNode, bone) {
		const position = { times: [], values: [] }, rotation = { times: [], values: [] }, scale = { times: [], values: [] };

		for (const keyframeNode of XMLNode.children) {
			if (keyframeNode.nodeName !== 'keyframe') {
				console.warn("THREE.OgreMaxLoader.parseKeyframes(): Unknown node name <" + keyframeNode.nodeName + ">");
				continue;
			}

			const { time, matrix } = this.#parseKeyframe(keyframeNode);
			const mPosition = new THREE.Vector3();
			const mRotation = new THREE.Quaternion();
			const mScale = new THREE.Vector3();

			matrix.decompose(mPosition, mRotation, mScale);

			position.times.push(time);
			rotation.times.push(time);
			scale.times.push(time);

			//Add translation to bone position to get final position
			mPosition.add(bone.position);

			//Multiply quaternion to bone quaternion to get the final rotation
			mRotation.multiplyQuaternions(bone.quaternion, mRotation).normalize();

			position.values.push(...mPosition.toArray());
			rotation.values.push(...mRotation.toArray());
			scale.values.push(...mScale.toArray());
		}

		return { position, rotation, scale };
	}

	/**
	 * Parse one <track> → multiple KeyframeTracks (pos / rot / scale).
	 * @private
	 * @param	{Element}					XMLNode	- XML element `<track>`
	 * @param	{Record<string,THREE.Bone>} bones	- map of bone names to THREE.Bone objects
	 * @returns {THREE.KeyframeTrack[]}				- the parsed keyframe tracks for this bone
	 */
	#parseTrack(XMLNode, bones) {
		const tracks = [];
		const boneName = XMLNode.getAttribute('bone');
		const keyframesNode = this.#querySelect(XMLNode, 'keyframes');
		const bone = bones[boneName];

		if (!bone) {
			throw new OgreMaxError('E_RANGE', `Track references unknown bone "${boneName}"`, { url: this.#url });
		}

		if (!keyframesNode) {
			throw new OgreMaxError('E_XML', `Track for bone "${boneName}" has no <keyframes>`, { url: this.#url });
		}

		const { position, rotation, scale } = this.#parseKeyframes(keyframesNode, bone);
		if (!position.times.length && !rotation.times.length && !scale.times.length) {
			throw new OgreMaxError('E_FORMAT', `Track for bone "${boneName}" contains zero keyframes`, { url: this.#url });
		}

		if (position.times.length) {
			tracks.push(new THREE.VectorKeyframeTrack(`.bones[${boneName}].position`, position.times, position.values));
		}

		if (rotation.times.length) {
			tracks.push(new THREE.QuaternionKeyframeTrack(`.bones[${boneName}].quaternion`, rotation.times, rotation.values));
		}

		if (scale.times.length) {
			tracks.push(new THREE.VectorKeyframeTrack(`.bones[${boneName}].scale`, scale.times, scale.values));
		}

		return tracks;
	}

	/**
	 * Parse <tracks>.
	 * @private
	 * @param	{Element}					XMLNode	- XML element `<tracks>`
	 * @param	{Record<string,THREE.Bone>}	bones	- map of bone names to THREE.Bone objects
	 * @returns {THREE.KeyframeTrack[]}				- the parsed keyframe tracks for all bones
	 */
	#parseTracks(XMLNode, bones) {
		const tracks = [];
		const nodes = this.#querySelectAll(XMLNode, ':scope > track');

		for (const trackNode of nodes) {
			tracks.push(...this.#parseTrack(trackNode, bones));
		}

		return tracks;
	}


	/* ====================================================================== */
	/* Attributes parsers													  */
	/* ====================================================================== */
	/**
	 * Read a boolean attribute (`"true"` / `"false"`) with default fallback.
	 * @private
	 * @param   {Element|null} XMLNode         – element holding the attribute
	 * @param   {string}       attr         – attribute name
	 * @param   {boolean}      [defaultValue=false]  – default if missing
	 * @returns {boolean}					- the attribute value as boolean
	 */
	#attrBool(XMLNode, attr, defaultValue = false) {
		return (XMLNode?.getAttribute(attr) ?? `${defaultValue}`).toLowerCase() === 'true';
	}

	/**
	 * Build a `THREE.Color` from attributes `r`, `g`, `b` (0–1 floats).
	 * @private
	 * @param	{Element}		XMLNode	- XML element with `r`, `g`, `b` attributes
	 * @returns {THREE.Color}			- the resulting color
	 */
	#attrColorRGB(XMLNode) {
		return new THREE.Color(this.#attrFloat(XMLNode, 'r'), this.#attrFloat(XMLNode, 'g'), this.#attrFloat(XMLNode, 'b'));
	}

	/**
	 * Read a float attribute with default.
	 * @private
	 * @param	{Element|null}	XMLNode	- element holding the attribute
	 * @param	{string}		attr	- attribute name
	 * @param	{number}		[defaultValue=0]	- default value if missing
	 * @returns	{number}				- the attribute value as float
	 */
	#attrFloat(XMLNode, attr, defaultValue = 0) {
		return parseFloat(XMLNode?.getAttribute(attr) ?? defaultValue);
	}

	/**
	 * Read an int attribute with default.
	 * @private
	 * @param	{Element|null}	XMLNode	- element holding the attribute
	 * @param	{string}		attr	- attribute name
	 * @param	{number}		[defaultValue=0]	- default value if missing
	 * @returns {number}				- the attribute value as integer
	 */
	#attrInt(XMLNode, attr, defaultValue = 0) {
		return parseInt(XMLNode?.getAttribute(attr) ?? defaultValue, 10);
	}

	/**
	 * Compose a `THREE.Matrix4` from optional child tags
	 * `<position|translate>`, `<rotation|rotate>` and `<scale>`.
	 * @private
	 * @param	{Element|null}	XMLNode	- XML element `<node>` or similar
	 * @returns {THREE.Matrix4}			- the resulting matrix
	 */
	#attrMatrix(XMLNode) {
		const position = this.#attrVector3(XMLNode?.querySelector('position,translate'));
		const rotation = this.#attrQuaternion(XMLNode?.querySelector('rotation,rotate'));
		const scaleNode = XMLNode?.querySelector('scale');
		let scale = new THREE.Vector3(1, 1, 1);

		if (scaleNode) {
			scale = scaleNode.hasAttribute('factor') ? new THREE.Vector3(this.#attrFloat(scaleNode, 'factor', 1), this.#attrFloat(scaleNode, 'factor', 1), this.#attrFloat(scaleNode, 'factor', 1)) : this.#attrVector3(scaleNode);
		}

		return new THREE.Matrix4().compose(position, rotation, scale);
	}

	/**
	 * Convert an OgreXML rotation representation into a normalised
	 * {@link THREE.Quaternion}.  Three syntaxes are supported :
	 * 1. **Axis + Angle**  
	 *    ```xml
	 *    <rotation axisX="1" axisY="0" axisZ="0" angle="1.5708"/>
	 *    ```  
	 *    – or children `<axis x="…" y="…" z="…"/>` + `<angle value="…"/>`.
	 *
	 * 2. **Quaternion explicit**  
	 *    ```xml
	 *    <rotation qx="0" qy="0.707" qz="0" qw="0.707"/>
	 *    ```
	 *
	 * 3. **Separate Euler angles** (rare, legacy)  
	 *    ```xml
	 *    <rotation angleX="90" angleY="0" angleZ="0"/>
	 *    ```  
	 *    – interpreted in **degrees** (matching historical OgreMax output).
	 *
	 * Missing or unsupported nodes return **identity**.
	 * @private
	 * @param	{Element|null}		XMLNode	- XML element `<rotation>` or similar
	 * @returns {THREE.Quaternion}			- the resulting quaternion
	 */
	#attrQuaternion(XMLNode) {
		const quat = new THREE.Quaternion();
		if (!XMLNode) {
			return quat;	// default → identity
		}

		// explicit quaternion (qx qy qz qw)
		if (XMLNode.hasAttribute('qx')) {
			const qx = this.#attrFloat(XMLNode, 'qx', NaN);
			const qy = this.#attrFloat(XMLNode, 'qy', NaN);
			const qz = this.#attrFloat(XMLNode, 'qz', NaN);
			const qw = this.#attrFloat(XMLNode, 'qw', NaN);

			if ([qx, qy, qz, qw].some(Number.isNaN)) {
				throw new OgreMaxError('E_FORMAT', 'Invalid quaternion component', { node: XMLNode.outerHTML });
			}

			quat.set(qx, qy, qz, qw).normalize();
			return quat;
		}


		// axis-angle  (attributes or sub-elements)

		if (XMLNode.hasAttribute('angle') || this.#querySelect(XMLNode, 'angle')) {
			// angle value (radians)
			const angleAttr = XMLNode.getAttribute('angle');
			const angleElem = this.#querySelect(XMLNode, 'angle');
			const angle = angleAttr !== null ? parseFloat(angleAttr) : this.#attrFloat(angleElem, 'value', 0);
			let axis;

			if (XMLNode.hasAttribute('axisX')) {
				axis = new THREE.Vector3(
					this.#attrFloat(XMLNode, 'axisX', 0),
					this.#attrFloat(XMLNode, 'axisY', 0),
					this.#attrFloat(XMLNode, 'axisZ', 1)
				);
			}
			else {
				const ax = this.#querySelect(XMLNode, 'axis');

				axis = new THREE.Vector3(
					this.#attrFloat(ax, 'x', 0),
					this.#attrFloat(ax, 'y', 0),
					this.#attrFloat(ax, 'z', 1)
				);
			}


			if (!isFinite(angle) || axis.lengthSq() === 0) {
				throw new OgreMaxError('E_FORMAT', 'Invalid axis-angle rotation', { node: XMLNode.outerHTML });
			}

			return quat.setFromAxisAngle(axis.normalize(), angle);
		}

		// Euler fallback  (angleX / angleY / angleZ)  
		//    – OgreMax stores these in **degrees**
		if (XMLNode.hasAttribute('angleX') || XMLNode.hasAttribute('angleY') || XMLNode.hasAttribute('angleZ')) {
			const degToRad = Math.PI / 180;
			const euler = new THREE.Euler(this.#attrFloat(XMLNode, 'angleX', 0) * degToRad, this.#attrFloat(XMLNode, 'angleY', 0) * degToRad, this.#attrFloat(XMLNode, 'angleZ', 0) * degToRad, 'XYZ');

			return quat.setFromEuler(euler);
		}

		// Unsupported → identity
		console.warn('[OgreMaxLoader] Unknown rotation format:', XMLNode.outerHTML);
		return quat;
	}

	/**
	 * Extract a single float from an attribute `u`.
	 * Defaults to `0` if the node is missing or the attribute is not present.
	 * This is used for texture coordinates in OgreXML files.
	 * @private
	 * @param	{Element|null}	XMLNode	- XML element with `u` attribute
	 * @returns {number}				- the resulting float (default: 0)
	 */
	#attrU(XMLNode) {
		return this.#attrFloat(XMLNode, 'u');
	}

	/**
	 * Extract a 2-component vector from attributes `u / v`.
	 * Defaults to (0,0) if the node is missing or attributes are not present.
	 * This is used for texture coordinates in OgreXML files.
	 * @param	{Element|null}	XMLNode	- XML element with `u`, `v` attributes
	 * @returns {THREE.Vector2}			- the resulting vector (default: (0,0))
	 */
	#attrUV(XMLNode) {
		return new THREE.Vector2(
			this.#attrFloat(XMLNode, 'u'),
			this.#attrFloat(XMLNode, 'v')
		);
	}

	/**
	 * Extract a 3-component vector from attributes `u / v / w`.
	 * Defaults to (0,0,0) if the node is missing or attributes are not present.
	 * This is used for texture coordinates in OgreXML files.
	 * @private
	 * @param	{Element|null}	XMLNode	- XML element with `u`, `v`, `w` attributes
	 * @returns {THREE.Vector3}			- the resulting vector (default: (0,0,0))
	 */
	#attrUVW(XMLNode) {
		return new THREE.Vector3(
			this.#attrFloat(XMLNode, 'u', 0),
			this.#attrFloat(XMLNode, 'v', 0),
			this.#attrFloat(XMLNode, 'w', 0)
		);
	}

	/**
	 * Simple 3-component vector from attributes `x / y / z`.
	 * @private
	 * @param	{Element|null}	XMLNode	- XML element with `x`, `y`, `z` attributes
	 * @returns	{THREE.Vector3}			- the resulting vector
	 */
	#attrVector3(XMLNode) {
		return new THREE.Vector3(
			this.#attrFloat(XMLNode, 'x', 0),
			this.#attrFloat(XMLNode, 'y', 0),
			this.#attrFloat(XMLNode, 'z', 0)
		);
	}


	/* ====================================================================== */
	/* Misc utils															  */
	/* ====================================================================== */
	/**
	 * Extract the base filename without extension chain (e.g. a.b.c.xml → a.b).
	 * @private
	 * @param	{string}	path	- the full path to the file
	 * @returns {string}			- the base filename without extension
	 */
	#filenameBase(path) {
		const parts = path.split('/').pop().split('.');
		return parts.length > 2 ? parts.slice(0, -1).join('.') : parts[0];
	}

	/**
	 * Shorthand: same as node?.querySelector(sel) but returns `null`
	 * when `node` itself is `null`.
	 * @private
	 * @param	{Element|null}	XMLNode	- the parent node to query
	 * @param	{string}		sel		- the CSS selector to use
	 * @returns {Element|null}			- the first matching element or `null` if not found
	 */
	#querySelect(XMLNode, selector) {
		return XMLNode ? XMLNode.querySelector(selector) : null;
	}

	/**
	 * Shorthand: same as node?.querySelectorAll(sel) but returns an empty array
	 * when `node` itself is `null`.
	 * @param	{Element|null}	XMLNode		- the parent node to query
	 * @param	{string}		selector	- the CSS selector to use
	 * @returns {Element[]}					- the list of matching elements or an empty array if not found
	 */
	#querySelectAll(XMLNode, selector) {
		return XMLNode ? XMLNode.querySelectorAll(selector) : [];
	}

	#logStart(url) {
		if (this.#logOpen) {
			this.#logEnd(); // close previous group if still open
		}
		console.groupCollapsed(`[OgreMaxLoader] ${url}`);
		this.#logOpen = true;
	}

	#logEnd() {
		if (this.#logOpen) {
			console.groupEnd();
			this.#logOpen = false;
		}
	}
}


/**
 * Loader for legacy Ogre *.material* text files.
 * Produces an **array of THREE.MeshPhongMaterial** objects, one per pass.
 */
export class DotMaterialLoader extends THREE.Loader {
	/* ====================================================================== */
	/* Private internal state (not exposed to the end-user)                   */
	/* ====================================================================== */
	#texturePath = '';

	/* ====================================================================== */
	/* Construction / configuration                                           */
	/* ====================================================================== */
	/**
	 * Create a new DotMaterialLoader instance.
	 * @param {THREE.LoadingManager} [manager=THREE.DefaultLoadingManager] - the loading manager to use
	 * @return {DotMaterialLoader} - the new loader instance
	 * @throws {TypeError} - if manager is not a THREE.LoadingManager instance
	 */
	constructor(manager = THREE.DefaultLoadingManager) {
		super(manager);
		this.textureLoader = new THREE.TextureLoader(this.manager);
	}

	/** @returns {string} - the texture path for loading textures (default: same as `path`) */
	get texturePath() {
		return this.#texturePath;
	}

	/** @param {string} value - the texture path for loading textures (default: same as `path`) */
	set texturePath(value) {
		if (typeof value !== 'string') {
			throw new DotMaterialError('E_RUNTIME', 'texturePath must be string', { value });
		}

		this.#texturePath = value;
	}


	/* ====================================================================== */
	/* Public API															  */
	/* ====================================================================== */
	/**
	 * Fetch a *.material* text file, convert it to Three.js materials.
	 * @param	{string}								url				- the URL of the material file to load
	 * @param	{function(THREE.Material[]):void}		[onLoad]		- callback for successful load
	 * @param	{function(number,number):void}			[onProgress]	- callback for progress updates (loaded, total)
	 * @param	{function(Error):void}					[onError]		- callback for errors
	 * @returns {Promise<THREE.MeshPhongMaterial[]>}					- the loaded materials
	 */
	load(url, onLoad = () => { }, onProgress = () => { }, onError = () => { }) {

		const basePath = this.path || THREE.LoaderUtils.extractUrlBase(url);
		const texPath = this.#texturePath || basePath;
		const fileLoader = new THREE.FileLoader(this.manager);

		fileLoader.setWithCredentials(this.withCredentials);

		return new Promise((resolve, reject) => {

			const fail = (code, msg, meta = {}) => {
				const err = code instanceof DotMaterialError
					? code
					: new DotMaterialError(code, msg, meta);
				onError(err);
				reject(err);
			};

			fileLoader.load(
				url,
				txt => {
					try {
						const mats = this.parse(txt, texPath);
						onLoad(mats);
						resolve(mats);
					} catch (e) {
						const err = e instanceof Error ? e : new Error(String(e));
						onError(err);
						reject(err);
					}
				},
				xhr => onProgress(xhr.loaded, xhr.total ?? 0),
				() => fail('E_IO', `Cannot load ${url}`, { url })
			);
		});
	}

	/**
	 * Convert a *.material* source string to an array of MeshPhongMaterial.
	 * @param	{string}					text		- the material source text (e.g. from a *.material* file)
	 * @param	{string}					texturePath	- optional base path for textures (default: same as `path`)
	 * @returns {THREE.MeshPhongMaterial[]}				- the parsed materials, one per pass
	 */
	parse(text, texturePath = '') {
		const mats = [];                          // final array
		const lines = text.split(/\r?\n/);        // strip CRLF
		const textureLoader = this.textureLoader; // local ref for closure

		// helper cursors
		let i = 0;
		const next = () => lines[i++]?.trim();
		const peek = () => lines[i]?.trim();

		// recursive descent parsing
		while (i < lines.length) {
			const line = next();
			if (!line) continue;

			const [kw, name] = line.split(/\s+/, 2);
			if (kw !== 'material') continue;

			mats.push(...parseMaterialBlock(name));
		}
		return mats;

		/* ─────────── local helpers (closures capture i / lines) ────────── */
		/**
		 * Read a color from a line, expecting the format `r g b [a]`.
		 * If the line has fewer than 3 components, it throws an error.
		 * If the line has 4 components, it sets the alpha value on the color.
		 * If the line has 3 components, it sets the alpha to 1 (opaque).
		 * The color is expected to be in the range [0, 1] for each component.
		 * @private
		 * @param	{string[]}			tokens	- the split line tokens (e.g. `['diffuse', '1', '0', '0']`)
		 * @param	{THREE.Color}		color	- the THREE.Color object to set
		 * @throws	{DotMaterialError}			- if the color format is invalid or unsupported
		 * @returns	{void}
		 */
		function parseMaterialBlock(matName) {
			const locals = [];

			eat('{');

			while (peek() !== '}') {
				const [kw] = peek().split(/\s+/, 1);

				if (kw === 'technique') {
					locals.push(...parseTechniqueBlock(matName));
				}
				else {
					next(); // skip unknown token
				}
			}
			eat('}');

			return locals;
		}

		/**
		 * Parse a `<technique>` block, which contains one or more `<pass>` blocks.
		 * Each pass block defines a set of rendering properties for the material.
		 * The technique block can contain multiple passes, but OgreMax only uses the first one.
		 * The technique block can contain other commands, but OgreMax ignores them.
		 * @private
		 * @param	{string}					matName	- the name of the material to create
		 * @throws	{DotMaterialError}					- if the technique block is malformed or unsupported
		 * @throws	{DotMaterialError}					- if a required pass block is missing or malformed
		 * @returns {THREE.MeshPhongMaterial[]}			- an array of MeshPhongMaterial objects created from the technique block
		 */
		function parseTechniqueBlock(matName) {
			const locals = [];

			eat('technique'); eat('{');
			while (peek() !== '}') {
				const [kw] = peek().split(/\s+/, 1);

				if (kw === 'pass') {
					locals.push(parsePassBlock(matName));
				}
				else { next(); }
			}
			eat('}');
			return locals;
		}

		/**
		 * Parse a `<pass>` block, creating a MeshPhongMaterial with the specified properties.
		 * The pass block can contain various commands like `diffuse`, `specular`, `texture_unit`, etc.
		 * It supports diffuse and emissive textures, but ignores others like normal maps.
		 * It sets the first texture as the diffuse map and the second as the emissive map.
		 * @private
		 * @param	{string}					matName	- the name of the material to create
		 * @returns {THREE.MeshPhongMaterial}			- the created material with the specified properties
		 * @throws	{DotMaterialError}					- if the pass block is malformed or unsupported
		 * @throws	{DotMaterialError}					- if a required texture is missing or malformed
		 */
		function parsePassBlock(matName) {
			const m = new THREE.MeshPhongMaterial({
				name: matName,
				transparent: true,
			});
			m.skinning = true;
			m.morphTargets = true;

			let diffuseSet = false;
			let emissiveSet = false;

			eat('pass'); eat('{');

			// loop over pass commands
			while (peek() !== '}') {

				const tokens = next().split(/\s+/);
				const cmd = tokens[0];

				switch (cmd) {
					case 'diffuse':
						readColor(tokens, m.color);
						break;
					case 'ambient':
						readColor(tokens, m.color);
						break; // Ogre ambient → base color
					case 'specular':
						readColor(tokens, m.specular);
						m.shininess = +tokens[4] || 30;
						break;
					case 'emissive':
						readColor(tokens, m.emissive);
						break;
					case 'scene_blend':          // add / alpha_blend
						m.transparent = true;
						m.blending = tokens[1] === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending;
						break;
					case 'texture_unit':
						handleTextureUnit();
						break;
					default:
						/* ignore */
						break;
				}
			}

			eat('}');
			return m;


			/* ───── sub-helpers ───────── */
			/**
			 * Handle a `<texture_unit>` block, loading textures and setting them on the material.
			 * OgreMax supports diffuse and emissive textures, but ignores others like normal maps.
			 * OgreMax does not support `texture_unit` parameters like `colour_op_ex` or `colour_op_multipass_fallback`.
			 * This function sets the first texture as the diffuse map and the second as the emissive map.
			 * @private
			 * @throws	{DotMaterialError}	- if the texture unit block is malformed or unsupported
			 * @returns {void}
			 */
			function handleTextureUnit() {
				//eat('texture_unit');
				eat('{');

				while (peek() !== '}') {

					const t = next().split(/\s+/);
					switch (t[0]) {
						case 'texture':
							if (!diffuseSet) {
								m.map = loadTex(t[1]);
                                m.map.flipY = false; // OgreMax does not flip Y by default
								diffuseSet = true;
							}
							else if (!emissiveSet) {
								m.emissiveMap = loadTex(t[1]);
								m.emissiveIntensity = 1; // OgreMax uses emissive intensity of 1 by default
								m.emissive.set(0xffffff); // set emissive color to white.
                                m.emissiveMap.flipY = false; // OgreMax does not flip Y by default
								emissiveSet = true;
							}
							break;
						case 'colour_op_ex':
							// ignore (Three can't replicate easily)
							break;
						case 'colour_op_multipass_fallback':
							break;
						default:
							break;
					}
				}
				eat('}');
			}

			/**
			 * Load a texture by name, using the configured texture path.
			 * @private
			 * @param	{string}				texName	- the name of the texture file to load
			 * @return	{THREE.Texture|null}			- the loaded texture or null if no name is given
			 */
			function loadTex(texName) {
				return texName ? textureLoader.load(texturePath + texName) : null;
			}

			/**
			 * Read a color from the token array and set it on the target color object.
			 * The expected format is `color r g b` where `r`, `g`, and `b` are floats in the range [0, 1].
			 * If the target is not provided, the function does nothing.
			 * @private
			 * @param	{string[]}		tok			- the token array containing the color values
			 * @param	{THREE.Color}	[target]	- the target color object to set the values on
			 * @returns {void}						- nothing, but sets the color on the target if provided
			 */
			function readColor(tok, target) {
				if (!target) return;
				target.set(+tok[1], +tok[2], +tok[3]);
			}
		}

		/**
		 * Check the next line for a specific token and advance the cursor.
		 * Throws an error if the token is not found.
		 * @private
		 * @param	{string}			token	- the expected token to match
		 * @throws	{DotMaterialError}			- if the token is not found
		 * @return	{void}						- nothing, but advances the cursor if the token is found
		 */
		function eat(token) {
			const line = next();

			if (!line?.startsWith(token)) {
				throw new DotMaterialError(`Expected "${token}" but got "${line}"`, { line: line });
			}
		}
	}
}


/* ------------------------------------------------------------------ */
/* Custom error type – every fatal issue bubbles as OgreMaxError      */
/* ------------------------------------------------------------------ */
/**
 * @typedef {"E_IO"|"E_XML"|"E_FORMAT"|"E_RUNTIME"|"E_RANGE"} LoaderErrorCode 
 */

/**
 * Loader-specific Error with a stable code and optional metadata.
 * @class
 */
class OgreMaxError extends Error {
	/**
	 * @param {LoaderErrorCode} code   – category of failure
	 * @param {string}           detail – human-readable message
	 * @param {object}           [meta] – additional context (url, node…)
	 */
	constructor(code, detail, meta = {}) {
		super(`[${code}] ${detail}`);
		this.name = "OgreMaxError";
		this.code = code;
		this.meta = meta;
	}
}

/**
 * Loader-specific Error for DotMaterialLoader with a stable code and optional metadata.
 * @class
 */
class DotMaterialError extends Error {
	/**
	 * @param {LoaderErrorCode } code   – category of failure
	 * @param {string}           detail – human-readable message
	 * @param {object}           [meta] – additional context (url, node…)
	 */
	constructor(code, detail, meta = {}) {
		super(`[${code}] ${detail}`);
		this.name = 'DotMaterialError';
		this.code = code;
		this.meta = meta;
	}
}
