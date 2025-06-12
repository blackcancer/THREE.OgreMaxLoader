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
 * @version   1.0 – 2025-06-11  (ES2023, UV fix, DotMaterialLoader overhaul)
 * @license   MIT
 * @module    OgreMaxLoader
 */
'use strict';

// Use local three module in Node.js test environment
import * as THREE from 'three';
THREE.Cache.enabled = true;

/**
 * Loads OgreMax XML files and converts them to Three.js objects.
 * @extends THREE.Loader
 */
class OgreMaxLoader extends THREE.Loader {
	/* ====================================================================== */
	/* Private internal state (not exposed to the end-user)                   */
	/* ====================================================================== */
	/** @type {THREE.LoadingManager} */
	#internalManager	= new THREE.LoadingManager();

	/** @type {Object.<string,*>} collects partial results during parsing */
	#objectRoot			= {};

	#url				= '';
	#texturePath		= '';
    #busy				= false;


	/* ====================================================================== */
	/* Construction / configuration                                           */
	/* ====================================================================== */
	/**
	 * @param {THREE.LoadingManager} [manager] – reuse an existing manager (defaults to a fresh one).
	 */
	constructor(manager = new THREE.LoadingManager()){
		super(manager);	// initialise this.manager
	}

	/* ----------------------- public accessors ------------------------- */
    /** @returns {string} absolute or relative path to the Ogre XML file */
	get texturePath(){return this.#texturePath;}

	/**
	 * Set the path where textures are located (relative to the XML file).
	 * This is used by the {@link THREE.DotMaterialLoader} to resolve texture URLs.
	 * @param {string} value – absolute or relative path
	 */
	set texturePath(value){
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
				console.groupCollapsed(`[OgreMaxLoader]`);
				console.log(`[OgreMaxLoader] Started loading of ${file}`);
				console.log(`		Loaded: ${loaded}/${total}`);
			};

			this.#internalManager.onProgress = (file, loaded, total) => {
				console.log(`[OgreMaxLoader] Loading ${file}`);
				console.log(`		Loaded: ${loaded} / ${total}`);

				// can be used to make progression bar
				onProgress(loaded, total);
			};

			this.#internalManager.onError = file => {
				fail(new OgreMaxError('E_RUNTIME', `dependency error on ${file}`, { file }));
			};

			this.#internalManager.onLoad = () => {
				console.log(`[OgreMaxLoader] All files loaded!`);
				console.groupEnd();
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
	parse(xml){
		const root = xml.documentElement;
		const data = {};

		switch (root.nodeName){
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
				throw new OgreMaxError( "E_XML", `Unknown root node <${root.nodeName}>`, { url: this.#url });
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
	#finalize(baseURL, onLoad, resolve){
		if(this.#objectRoot.scene){
			const scene   = this.#objectRoot.scene;
			const group   = scene.children[0];
			const base    = this.#filenameBase(this.#url);

			if(group && this.#objectRoot[base]?.materials){
				const mats = this.#objectRoot[base].materials;

				for(const object of group.children){

					for(const mesh of object.children){
						
						if(mesh.name){
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

		if(this.#objectRoot.mesh){
			const mesh = this.#objectRoot.mesh;

			if(this.#objectRoot.skeletonFile){
				const { skel, anim } = this.#objectRoot.skeletonFile;
				mesh.animations				= anim;
				mesh.geometry.bones			= skel.bones;
				mesh.add(skel.bones[0]);
				mesh.bind(skel);
			}

			this.manager.itemEnd(baseURL);
			onLoad(mesh);
			resolve(mesh);
			return;
		}

		if(this.#objectRoot.skeleton){
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
	#handleFileLoaded(url, response){
		const xml = new DOMParser().parseFromString(response, 'text/xml');
		if (xml.querySelector('parsererror')) {
			throw new OgreMaxError('E_XML', 'Malformed XML', { url });
		}

		const data  = this.parse(xml);

		if(data.scene)     this.#objectRoot.scene     = data.scene;
		if(data.mesh)      this.#objectRoot.mesh      = data.mesh;
		if(data.skeleton)  this.#objectRoot.skeleton  = data.skeleton;

		this.#internalManager.itemEnd(url);
	}


	/* ====================================================================== */
	/* First level parsers													  */
	/* ====================================================================== */
	/**
	 * High-level conversion from a `<mesh>` XML root to a skinned
	 * {@link THREE.SkinnedMesh} using {@link THREE.BufferGeometry}.
	 * @private
	 * @param	{Element}			meshNode	- XML element `<mesh>`
	 * @returns	{THREE.SkinnedMesh}				- the resulting skinned mesh
	 */
	#parseMesh(meshNode) {
		if (!meshNode.querySelector('sharedgeometry') &&  !meshNode.querySelector('submeshes > submesh')){
			throw new OgreMaxError('E_XML', 'Mesh contains no geometry', {url: this.#url});
		}

		// shared arrays (CPU side)
		const positions   = [];
		const normals     = [];
		const uvs         = [];
		const indices     = [];
		const skinIndex   = [];
		const skinWeight  = [];

		// optional sharedgeometry
		const shared = this.#q(meshNode, 'sharedgeometry');
		if (shared){
			this.#parseGeometry(shared, { positions, normals, uvs });
		}

		const target = new THREE.BufferGeometry();

		// parse every submesh
		for (const sm of meshNode.querySelectorAll('submesh')) {
			const base			= positions.length / 3;  // vertex offset
			const usesShared	= this.#attrB(sm, 'usesharedvertices');
			const geoNode		= this.#q(sm, 'geometry');
			const facesNode		= this.#q(sm, 'faces');
			const boneNode		= this.#q(sm, 'boneassignments');
			
			// private geometry (unless usesSharedVertices
			if (!usesShared && geoNode) {
				this.#parseGeometry(geoNode, { positions, normals, uvs });
			}

			// faces → indices
                        if (facesNode) {
                                this.#parseFaces(facesNode, indices, base, positions.length / 3);
                        }

			// bone assignments
			if (boneNode) {
				this.#parseBoneassignments(
					boneNode, skinIndex, skinWeight,
					base,                       // vertex offset
					positions.length / 3        // new vertex count (absolute)
				);
			}
		}

		if (positions.length === 0) {
			throw new OgreMaxError('E_FORMAT', 'Mesh has zero vertices', { url: this.#url });
		}

		if (indices.length % 3 !== 0) {
			throw new OgreMaxError('E_FORMAT', `Index buffer length (${indices.length}) not multiple of 3`, { url: this.#url });
		}

		// build BufferGeometry
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals,   3));
		geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,       2));
		geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
		geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
		geom.setIndex(indices);
		geom.computeBoundingSphere();
		geom.computeVertexNormals();

		// trivial material (replace later if needed)
		const material = new THREE.MeshStandardMaterial({
			skinning      : true,
			morphTargets  : true
		});

		const skinnedMesh = new THREE.SkinnedMesh(geom, material);

		// optional skeleton link
		const skelLink = this.#q(meshNode, 'skeletonlink');
		if (skelLink) {
			const skelURL = `${this.path}${skelLink.getAttribute('name')}.xml`;
			const intLoad = new OgreMaxLoader(this.manager);

			this.#internalManager.itemStart(skelURL);
			intLoad.load(
				skelURL,
				({ skeleton, animations }) => {
					this.#objectRoot.skeletonFile = { skel: skeleton, anim: animations };
					this.#internalManager.itemEnd(skelURL);
				},
				() => {},
				err => {
					this.#internalManager.itemError(skelURL);
					throw err;
				}
			);
		}

		return skinnedMesh;
	}

	/**
	 * Build a THREE.Scene from a Ogre dotScene XML root.
	 * @private
	 * @param	{Element}		sceneNode	- XML element `<scene>`
	 * @returns	{THREE.Scene}				- the resulting scene object
	 */
	#parseScene(sceneNode){
		const env = this.#q(sceneNode, 'environment');
		const nodes = this.#q(sceneNode, 'nodes');
		const scene = new THREE.Scene();
		const upAxis = (sceneNode.getAttribute('upAxis') || 'y').toLowerCase();

		scene.up.set(
			+(upAxis === 'x'),
			+(upAxis === 'y'),
			+(upAxis === 'z')
		); // (1,0,0) / (0,1,0) / (0,0,1)

		scene.userData = {
			formatVersion : this.#attrF(sceneNode, 'formatVersion', 0),
			minOgreVersion: this.#attrF(sceneNode, 'minOgreVersion', 0),
			ogreMaxVersion: this.#attrF(sceneNode, 'ogreMaxVersion', 0),
			unitsPerMeter : this.#attrF(sceneNode, 'unitsPerMeter', 1),
			unitType      : sceneNode.getAttribute('unitType') || 'meters',
			author        : sceneNode.getAttribute('author')   || undefined,
			application   : sceneNode.getAttribute('application') || undefined
		};

		if(nodes){
			scene.add(this.#parseNodes(nodes));
		}

		if(env){
			scene.add(this.#parseEnvironment(env));
		}

		return scene;
	}

	/**
	 * Build a THREE.Skeleton + animations array from a <skeleton> XML root.
	 * @private
	 * @param	{Element}														skelNode	- XML element `<skeleton>`
	 * @returns	{{skeleton:THREE.Skeleton,animations:THREE.AnimationClip[]}}				- the resulting skeleton and animations
	 */
	#parseSkeleton(skelNode){
		const animNode		= this.#q(skelNode, 'animations');
		const bonesNode = this.#q(skelNode, 'bones');
		const hierNode		= this.#q(skelNode, 'bonehierarchy');

		if (!bonesNode || !hierNode) {
			throw new OgreMaxError('E_XML', '<skeleton> is missing <bones> or <bonehierarchy>', { url: this.#url });
		}

		const bones			= bonesNode ? this.#parseBones(bonesNode) : [];
		const animations	= animNode ? this.#parseAnimations(animNode, bones) : [];
		let   skeleton		= new THREE.Skeleton([]);

		if(hierNode){
			skeleton = new THREE.Skeleton(this.#parseBoneHierarchy(hierNode, bones));
		}

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
	#parseBoneassignments(baNode, skinIdx, skinWgt, baseVertex, endVertex) {

		for (let v = baseVertex; v < endVertex; ++v) {
			skinIdx.push(0, 0, 0, 0);
			skinWgt.push(0, 0, 0, 0);
		}

		for (const a of baNode.querySelectorAll('vertexboneassignment')) {

			const vRel = this.#attrI(a, 'vertexindex');
			const vAbs = baseVertex + vRel;
			if (vAbs >= endVertex) {
				throw new OgreMaxError('E_RANGE', `vertexindex ${vRel} out of range (base ${baseVertex}, end ${endVertex})`, { assignment: a.outerHTML });
			}

			const bone = this.#attrI(a, 'boneindex');
			const weight = this.#attrF(a, 'weight');

			// find free slot (max 4)
			let placed = false;
			for (let s = 0; s < 4; ++s) {
				const off = vAbs * 4 + s;
				if (skinWgt[off] === 0) {
					skinIdx[off] = bone;
					skinWgt[off] = weight;
					placed = true;
					break;
				}
			}

			if (!placed) {
				throw new OgreMaxError('E_FORMAT', `More than 4 bone influences for vertex ${vRel}`, { assignment: a.outerHTML });
			}
		}
	}

	/**
	 * Parse a single <face>.
	 * @private
	 * @param	{Element}													fNode	- XML element `<face>`
	 * @param	{THREE.Vector3[]}											normals	- array of vertex normals
	 * @param	{(THREE.Vector2|THREE.Vector3)[]}							uvs		- array of vertex UVs
	 * @returns	{{face:THREE.Face3, uvSet:(THREE.Vector2|THREE.Vector3)[]}}			- the parsed face and its UV set
	 */
	#parseFace(fNode, normals, uvs){
		const v1 = this.#attrI(fNode,'v1');
		const v2 = this.#attrI(fNode,'v2');
		const v3 = this.#attrI(fNode,'v3');
		const n  = [ normals[v1], normals[v2], normals[v3] ];
		const uv = [ uvs[v1],     uvs[v2],     uvs[v3]     ];

		return { face: new THREE.Face3(v1, v2, v3, n), uvSet: uv };
	}

	/**
	 * Parse `<faces>` and push indices into the global array.
	 * @private
	 * @param	{Element}	facesNode	- XML element `<faces>`
	 * @param	{number[]}	indices		- array to push indices into
	 * @param	{number}	base		- base vertex index (offset)
	 * @param	{number}	vertCount	- total vertex count (for range check)
	 * @returns	{void}
	 * @throws {OgreMaxError}			- if a face index is out of range
	 */
	#parseFaces(facesNode, indices, base, vertCount) {
		for (const f of facesNode.querySelectorAll(':scope > face')) {
			const v1 = base + this.#attrI(f, 'v1');
			const v2 = base + this.#attrI(f, 'v2');
			const v3 = base + this.#attrI(f, 'v3');

			if (v1 >= vertCount || v2 >= vertCount || v3 >= vertCount) {
				throw new OgreMaxError('E_RANGE', `Face index out of range (v1:${v1} v2:${v2} v3:${v3} >= ${vertCount})`, {node: f.outerHTML, url: this.#url });
			}

			indices.push(v1, v2, v3);
		}
	}

	/**
	 * Push vertex data of a `<geometry>` / `<sharedgeometry>` block into
	 * the provided accumulators.
	 * @private
	 * @param	{Element}												geoNode - XML element `<geometry>` or `<sharedgeometry>`
	 * @param	{{positions:number[],normals:number[],uvs:number[]}}	acc		- accumulators for vertex data
	 * @returns {number}														- the number of vertices parsed
	 * @throws {OgreMaxError}													- if vertexcount differs from parsed count
	 */
	#parseGeometry(geoNode, acc) {
		const start = acc.positions.length / 3;

		for (const vb of geoNode.querySelectorAll(':scope > vertexbuffer')) {
			this.#parseVertexbuffer(vb, acc);
		}

		const added = (acc.positions.length / 3) - start;
		const declared = this.#attrI(geoNode, 'vertexcount', added);
		if (declared !== added) {
			throw new OgreMaxError('E_FORMAT', `vertexcount ${declared} differs from parsed ${added}`, { url: this.#url });
		}

		/* keep global count for face-index range check */
		return added;
	}

	/**
	 * Parse a single <submesh> and return a SkinnedMesh (geometry+material).
	 * @private
	 * @param	{Element}																					smNode	- XML element `<submesh>`
	 * @param	{{vertices:THREE.Vector3[], normals:THREE.Vector3[], uvs:(THREE.Vector2|THREE.Vector3)[]}?}	shared	- optional shared geometry data (vertices, normals, uvs)
	 * @returns {THREE.SkinnedMesh}																					- the resulting skinned mesh (or Line if operationtype=line_list)
	 */
	#parseSubmesh(smNode, shared = null) {

        // source or shared geometry
		const usesSV = this.#attrB(smNode, 'usesharedvertices');
		const geoNode = this.#q(smNode, 'geometry');
		const facesNode = this.#q(smNode, 'faces');
		const boneNode = this.#q(smNode, 'boneassignments');

        // If no shared geometry, use private accumulators
		const acc = usesSV && shared
			? shared
			: { positions: [], normals: [], uvs: [] };

		if (!usesSV && geoNode) {
			this.#parseGeometry(geoNode, acc);
		}

        // indices + weights for skinning
		const indices = [];
		const skinIndex = [];
		const skinWeight = [];

		if (facesNode) {
			const base = 0; // vertOffset = 0 (private accumulators)
			this.#parseFaces(facesNode, indices, base, acc.positions.length / 3);
		}

		if (boneNode) {
			this.#parseBoneassignments(
				boneNode, skinIndex, skinWeight,
				0,                             // baseVertex
				acc.positions.length / 3       // endVertex
			);
		}

        // BufferGeometry construction
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position',
			new THREE.Float32BufferAttribute(acc.positions, 3));
		if (acc.normals.length) {
			geom.setAttribute('normal',
				new THREE.Float32BufferAttribute(acc.normals, 3));
		}
		if (acc.uvs.length) {
			geom.setAttribute('uv',
				new THREE.Float32BufferAttribute(acc.uvs, 2));
		}
		if (skinIndex.length) {
			geom.setAttribute('skinIndex',
				new THREE.Uint16BufferAttribute(skinIndex, 4));
			geom.setAttribute('skinWeight',
				new THREE.Float32BufferAttribute(skinWeight, 4));
		}
		if (indices.length) geom.setIndex(indices);

		geom.computeBoundingSphere();
		if (!acc.normals.length) geom.computeVertexNormals();

        // base material for the skinned mesh
		const material = new THREE.MeshStandardMaterial({
			skinning: !!skinIndex.length,
		});

		// operationtype
		const opType = smNode.getAttribute('operationtype') ?? 'triangle_list';
		if (opType === 'line_list') {
			return new THREE.Line(geom, material);
		}
		return new THREE.SkinnedMesh(geom, material);
	}

	/**
	 * Parse one <vertex>.
	 * @private
	 * @param	{Element}																			vNode	- XML element `<vertex>`
	 * @param	{boolean}																			hasPos	- true if the vertex has a position
	 * @param	{boolean}																			hasNorm	- true if the vertex has a normal
	 * @param	{number}																			tcCount	- number of texture coordinates (0, 1, 2 or 3)
	 * @param	{number[]}																			tcDim	- array of texture coordinate dimensions (1, 2 or 3)
	 * @returns {{vert:THREE.Vector3[], norm:THREE.Vector3[], uv:(THREE.Vector2|THREE.Vector3)[]}}			- the parsed vertex data
	 */
	#parseVertex(vNode, hasPos, hasNorm, tcCount, tcDim){
		const vert = [], norm = [], uv = [];

		if(hasPos){
			const p = this.#q(vNode, 'position');

			vert.push(this.#attrVector(p));
		}

		if(hasNorm){
			const n = this.#q(vNode, 'normal');

			norm.push(this.#attrVector(n));
		}

		if(tcCount){
			const texList = vNode.querySelectorAll('texcoord');

			for(let i = 0; i < tcCount; ++i){
				const t = texList[i];

				switch (tcDim[i]){
					case 1: uv.push(new THREE.Vector2(this.#attrF(t,'u'), 0)); break;
					case 2: uv.push(new THREE.Vector2(this.#attrF(t,'u'), this.#attrF(t,'v'))); break;
					case 3: uv.push(new THREE.Vector3(this.#attrF(t,'u'), this.#attrF(t,'v'), this.#attrF(t,'w'))); break;
				}
			}
		}

		return { vert, norm, uv };
	}

	/**
	 * Parse one `<vertexbuffer>` and append its content to accumulators.
	 * @private
	 * @param	{Element}												vbNode	- XML element `<vertexbuffer>`
	 * @param	{{positions:number[],normals:number[],uvs:number[]}}	acc		- accumulators for vertex data
	 * @returns	{void}
	 */
	#parseVertexbuffer(vbNode, acc) {
		const hasPos  = this.#attrB(vbNode, 'positions');
		const hasNorm = this.#attrB(vbNode, 'normals');
		const tcCount = this.#attrI(vbNode, 'texture_coords', 0);

		// texture_coord_dimensions_n  (default 2)
		const tcDim = Array.from({ length: tcCount }, (_, i) => {
			const raw = vbNode.getAttribute(`texture_coord_dimensions_${i}`);
			const dim = raw ? parseInt(raw.replace('float', ''), 10) : 2;

			if (![1, 2, 3].includes(dim)) {
				throw new OgreMaxError('E_FORMAT', `texture_coord_dimensions_${i} = ${dim} (expected 1/2/3)`, { node: vbNode.outerHTML });
			}

			return dim;
		});

		const vList = vbNode.querySelectorAll(':scope > vertex');
		const vertTot = vList.length;
		let uvPtr = 0;
		let uvTmp = tcCount ? new Float32Array(vertTot * 2) : null;

		for (const vNode of vList) {

			// positions
			if (hasPos) {
				const p = this.#q(vNode, 'position');
				
				acc.positions.push(
					this.#attrF(p,'x',0),
					this.#attrF(p,'y',0),
					this.#attrF(p,'z',0)
				);
			}

			// normals
			if (hasNorm) {
				const n = this.#q(vNode, 'normal');
				
				acc.normals.push(
					this.#attrF(n,'x',0),
					this.#attrF(n,'y',0),
					this.#attrF(n,'z',0)
				);
			}

			// UV sets
			if (tcCount) {
				const texList = vNode.querySelectorAll('texcoord');

				for (let i = 0; i < tcCount; ++i) {
					const t = texList[i];
					const u = this.#attrF(t, 'u', 0);
					const v = this.#attrF(t, 'v', 0);

					uvTmp[uvPtr++] = u;
					uvTmp[uvPtr++] = v;
				}
			}

			if (uvTmp) {
				acc.uvs.push(...uvTmp);
			}
		}
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
	#parseEnvironment(envNode){
		const amb = this.#q(envNode, 'colourAmbient');
		const bg = this.#q(envNode, 'colourBackground');
		const clip = this.#q(envNode, 'clipping');
		const grp = new THREE.Group();
		grp.name  = 'environment';

		if(amb){
			const ambLight    = new THREE.AmbientLight(this.#attrColor(amb));
			
			grp.add(ambLight);
		}

		if(bg){
			grp.userData.background = this.#attrColor(bg);
		}

		if(clip){
			grp.userData.clipping = {
				near: this.#attrF(clip, 'near', 0),
				far : this.#attrF(clip, 'far' , 1)
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
	#parseEntity(entityNode, parentObj){
		const meshFile = entityNode.getAttribute('meshFile');

		if(!meshFile){
			console.warn('Entity sans meshFile :', entityNode);
			return;
		}

		const meshURL = `${this.path}${meshFile}.xml`;
		const intLoader = new OgreMaxLoader(this.manager);
		const subEntities = this.#q(entityNode, 'subentities');

		if(subEntities){
			this.#parseSubEntities(subEntities);
		}

		this.#internalManager.itemStart(meshURL);

		intLoader.load(
			meshURL,
			mesh => {
				mesh.name          = entityNode.getAttribute('name') || mesh.name;
				mesh.castShadow    = this.#attrB(entityNode, 'castShadows'   , mesh.castShadow);
				mesh.receiveShadow = this.#attrB(entityNode, 'receiveShadows', mesh.receiveShadow);

				parentObj.add(mesh);
				this.#internalManager.itemEnd(meshURL);
			},
			() => {},
			() => this.#internalManager.itemError(meshURL)
		);
	}

	/**
	 * Convert a single Ogre `<node>` branch (recursion) to `THREE.Object3D`.
	 * @private
	 * @param	{Element}			node	– XML element `<node>`
	 * @returns	{THREE.Object3D}			– root object for this branch
	 */
	#parseNode(node){
		const entity	 = this.#q(node, ':scope > entity');
		const obj			 = new THREE.Object3D();

		obj.name       = node.getAttribute('name') || '';
		obj.visible    = this.#attrB(node, 'visibility', true);
		obj.applyMatrix4(this.#attrMatrix(node));

		if(entity){
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
	#parseNodes(nodesNode){
		const grp = new THREE.Group();

		grp.name  = 'nodes';
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
	#parseSubEntities(subNode){
		const fnameParts = this.#url.split('/').pop().split('.');
		const baseName   = fnameParts.length > 2 ? fnameParts.slice(0, -1).join('.') : fnameParts[0];
		const matURL     = `${this.path}${baseName}.material`;
		const matLoader  = new DotMaterialLoader(this.manager);

		matLoader.texturePath = this.texturePath || this.path;

		this.#internalManager.itemStart(matURL);
		matLoader.load(
			matURL,
			mats => {
				subNode.querySelectorAll('subentity').forEach(sub => {
					const idx  = this.#attrI(sub, 'index');
					const name = sub.getAttribute('materialName');

					if(!mats[idx] || mats[idx].name !== name){
						this.#internalManager.itemError(matURL);
					}
				});

				this.#objectRoot[baseName] = { materials: mats };
				this.#internalManager.itemEnd(matURL);
			},
			() => {},
			() => this.#internalManager.itemError(matURL)
		);
	}


	/* ====================================================================== */
	/* Skeleton parsers														  */
	/* ====================================================================== */
	/**
	 * Parse one <animation>.
	 * @private
	 * @param	{Element}                   aNode	- XML element `<animation>`
	 * @param	{Record<string,THREE.Bone>}	bones	- map of bone names to THREE.Bone objects
	 * @returns {THREE.AnimationClip}				- the parsed animation clip
	 */
	#parseAnimation(aNode, bones) {
		const name = aNode.getAttribute('name') || 'default';
		const length = this.#attrF(aNode, 'length', 0);

		if (!length || !isFinite(length)) {
			throw new OgreMaxError('E_FORMAT', `Animation "${name}" has invalid length (${length})`, { url: this.#url });
		}

		const tracksNode = this.#q(aNode, 'tracks');
		if (!tracksNode) {
			throw new OgreMaxError('E_XML', `Animation "${name}" missing <tracks>`, {url: this.#url});
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
	 * @param	{Element}					animNode	- XML element `<animations>`
	 * @param	{Record<string,THREE.Bone>}	bones		- map of bone names to THREE.Bone objects
	 * @returns {THREE.AnimationClip[]}					- the parsed animation clips
	 */
	#parseAnimations(animNode, bones){
		const clips = [];

		for(const a of animNode.querySelectorAll('animation')){
			clips.push(this.#parseAnimation(a, bones));
		}

		return clips;
	}

	/**
	 * Single <bone>.
	 * @private
	 * @param	{Element}		boneNode	- XML element `<bone>`
	 * @returns {THREE.Bone}				- the parsed bone object
	 */
	#parseBone(boneNode){
		const bone   = new THREE.Bone();

		bone.name    = boneNode.getAttribute('name') || '';
		bone.userData.index = this.#attrI(boneNode,'id');
		bone.applyMatrix4(this.#attrMatrix(boneNode));

		return bone;
	}

	/**
	 * Parse <bones> list into an index-addressable map.
	 * @private
	 * @param	{Element}					bonesNode	- XML element `<bones>`
	 * @returns {Record<string,THREE.Bone>}				- map of bone names to THREE.Bone objects
	 */
	#parseBones(bonesNode){
		/** @type {Record<string,THREE.Bone>} */
		const out = {};

		for(const bNode of bonesNode.querySelectorAll('bone')){
			const bone = this.#parseBone(bNode);

			out[bone.name] = bone;
		}
		return out;
	}

	/**
	 * Build THREE.Bone hierarchy (<bonehierarchy>).
	 * @private
	 * @param	{Element}					hierNode	- XML element `<bonehierarchy>`
	 * @param	{Record<string,THREE.Bone>}	bones		- map of bone names to THREE.Bone objects
	 * @returns {THREE.Bone[]}							- array of THREE.Bone objects in hierarchy order
	 */
	#parseBoneHierarchy(hierNode, bones){
		for(const bp of hierNode.querySelectorAll('boneparent')){
			const parent = bones[bp.getAttribute('parent')];
			const child  = bones[bp.getAttribute('bone')];

			parent && child && parent.add(child);
		}

		/* reorder by original index (THREE.Skeleton expects array) */
		const arr = Object.values(bones).sort((a,b)=>a.userData.index-b.userData.index);
		return arr;
	}

	/**
	 * Single <keyframe>.
	 * @private
	 * @param	{Element}								kfNode	- XML element `<keyframe>`
	 * @returns {{time:number, matrix:THREE.Matrix4}}			- the parsed keyframe data
	 */
	#parseKeyframe(kfNode){
		return {
			time   : this.#attrF(kfNode,'time',0),
			matrix : this.#attrMatrix(kfNode)
		};
	}

	/**
	 * Gather arrays for one <keyframes> block.
	 * @private
	 * @param  {Element}																												kfsNode	- XML element `<keyframes>`
	 * @param  {THREE.Bone}																												bone	- the bone to which the keyframes apply
	 * @returns {{pos:{times:number[],values:number[]}, rot:{times:number[],values:number[]}, scl:{times:number[],values:number[]}}}			- the parsed keyframes data
	 */
	#parseKeyframes(kfsNode, bone){
		const pos = { times:[], values:[] };
		const rot = { times:[], values:[] };
		const scl = { times:[], values:[] };

		for(const kf of kfsNode.children){
			if(kf.nodeName !== 'keyframe') continue;
			const { time, matrix } = this.#parseKeyframe(kf);
			const p = new THREE.Vector3();
			const q = new THREE.Quaternion();
			const s = new THREE.Vector3();

			matrix.decompose(p, q, s);

			// bone-space → object-space
			q.multiplyQuaternions(bone.quaternion, q).normalize();

			pos.times.push(time);  rot.times.push(time);  scl.times.push(time);
			pos.values.push(...p.toArray());
			rot.values.push(...q.toArray());
			scl.values.push(...s.toArray());
		}

		return { pos, rot, scl };
	}

	/**
	 * Parse one <track> → multiple KeyframeTracks (pos / rot / scale).
	 * @private
	 * @param	{Element}					trNode	- XML element `<track>`
	 * @param	{Record<string,THREE.Bone>} bones	- map of bone names to THREE.Bone objects
	 * @returns {THREE.KeyframeTrack[]}				- the parsed keyframe tracks for this bone
	 */
	#parseTrack(trNode, bones){
		const boneName	= trNode.getAttribute('bone');
		const kfNode	= this.#q(trNode, 'keyframes');
		const bone		= bones[boneName];
		const tracks	= [];

		if (!bone) {
			throw new OgreMaxError('E_RANGE', `Track references unknown bone "${boneName}"`, { url: this.#url });
		}

		if (!kfNode) {
			throw new OgreMaxError('E_XML', `Track for bone "${boneName}" has no <keyframes>`, { url: this.#url });
		}

		const data = this.#parseKeyframes(kfNode, bone);
		if (!data.pos.times.length && !data.rot.times.length && !data.scl.times.length) {
			throw new OgreMaxError('E_FORMAT', `Track for bone "${boneName}" contains zero keyframes`, { url: this.#url });
		}

		if(data.pos.times.length){
			tracks.push(new THREE.VectorKeyframeTrack(
				`.bones[${boneName}].position`, data.pos.times, data.pos.values
			));
		}

		if(data.rot.times.length){
			tracks.push(new THREE.QuaternionKeyframeTrack(
				`.bones[${boneName}].quaternion`, data.rot.times, data.rot.values
			));
		}

		if(data.scl.times.length){
			tracks.push(new THREE.VectorKeyframeTrack(
				`.bones[${boneName}].scale`, data.scl.times, data.scl.values
			));
		}

		return tracks;
	}

	/**
	 * Parse <tracks>.
	 * @private
	 * @param	{Element}					tracksNode	- XML element `<tracks>`
	 * @param	{Record<string,THREE.Bone>}	bones		- map of bone names to THREE.Bone objects
	 * @returns {THREE.KeyframeTrack[]}					- the parsed keyframe tracks for all bones
	 */
	#parseTracks(tracksNode, bones){
		const tracks = [];

		for(const t of tracksNode?.querySelectorAll('track') || []){
			tracks.push(...this.#parseTrack(t, bones));
		}

		return tracks;
	}


	/* ====================================================================== */
	/* Attributes helpers													  */
	/* ====================================================================== */
	/**
	 * Read a boolean attribute (`"true"` / `"false"`) with default fallback.
	 * @private
	 * @param   {Element|null} node         – element holding the attribute
	 * @param   {string}       attr         – attribute name
	 * @param   {boolean}      [def=false]  – default if missing
	 * @returns {boolean}					- the attribute value as boolean
	 */
	#attrB(node, attr, def = false){
		return (node?.getAttribute(attr) ?? `${def}`).toLowerCase() === 'true';
	}

	/**
	 * Build a `THREE.Color` from attributes `r`, `g`, `b` (0–1 floats).
	 * @private
	 * @param	{Element}		n	- XML element with `r`, `g`, `b` attributes
	 * @returns {THREE.Color}		- the resulting color
	 */
	#attrColor(n){
		return new THREE.Color(this.#attrF(n,'r'),this.#attrF(n,'g'),this.#attrF(n,'b'));
	}

	/**
	 * Read a float attribute with default.
	 * @private
	 * @param	{Element|null}	node	- element holding the attribute
	 * @param	{string}		attr	- attribute name
	 * @param	{number}		[def=0]	- default value if missing
	 * @returns	{number}				- the attribute value as float
	 */
	#attrF(node, attr, def = 0){
		return parseFloat(node?.getAttribute(attr) ?? def);
	}

	/**
	 * Read an int attribute with default.
	 * @private
	 * @param	{Element|null}	node	- element holding the attribute
	 * @param	{string}		attr	- attribute name
	 * @param	{number}		[def=0]	- default value if missing
	 * @returns {number}				- the attribute value as integer
	 */
	#attrI(node, attr, def = 0){
		return parseInt  (node?.getAttribute(attr) ?? def, 10);
	}

	/**
	 * Compose a `THREE.Matrix4` from optional child tags
	 * `<position|translate>`, `<rotation|rotate>` and `<scale>`.
	 * @private
	 * @param	{Element|null}	n	- XML element `<node>` or similar
	 * @returns {THREE.Matrix4}		- the resulting matrix
	 */
	#attrMatrix(n){
		const pos = this.#attrVector(n?.querySelector('position,translate'));
		const rot = this.#attrQuat  (n?.querySelector('rotation,rotate'));
		let   scl = new THREE.Vector3(1, 1, 1);

		const scaleNode = n?.querySelector('scale');
		if(scaleNode){
			scl = scaleNode.hasAttribute('factor')
				? new THREE.Vector3(
						this.#attrF(scaleNode, 'factor', 1),
						this.#attrF(scaleNode, 'factor', 1),
						this.#attrF(scaleNode, 'factor', 1))
				: this.#attrVector(scaleNode);
		}
		return new THREE.Matrix4().compose(pos, rot, scl);
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
	 * @param	{Element|null}		n	- XML element `<rotation>` or similar
	 * @returns {THREE.Quaternion}		- the resulting quaternion
	 */
	#attrQuat(n) {
		const q = new THREE.Quaternion();
		if (!n) return q;	// default → identity

		
		// explicit quaternion (qx qy qz qw)
		if (n.hasAttribute('qx')) {
			const qx = this.#attrF(n, 'qx', NaN);
			const qy = this.#attrF(n, 'qy', NaN);
			const qz = this.#attrF(n, 'qz', NaN);
			const qw = this.#attrF(n, 'qw', NaN);

			if ([qx, qy, qz, qw].some(Number.isNaN)) {
				throw new OgreMaxError('E_FORMAT', 'Invalid quaternion component', {node: n.outerHTML});
			}

			q.set(qx, qy, qz, qw).normalize();
			return q;
		}

		
		// axis-angle  (attributes or sub-elements)
		
		if (n.hasAttribute('angle') || this.#q(n, 'angle')) {

			// angle value (radians)
			const angleAttr = n.getAttribute('angle');
			const angleElem = this.#q(n, 'angle');
			const angle = angleAttr !== null
				? parseFloat(angleAttr)
				: this.#attrF(angleElem, 'value', 0);

			// axis vector
			let axis;
			if (n.hasAttribute('axisX')) {
				axis = new THREE.Vector3(
					this.#attrF(n, 'axisX', 0),
					this.#attrF(n, 'axisY', 0),
					this.#attrF(n, 'axisZ', 1)
				);
			} else {
				const ax = this.#q(n, 'axis');
				axis = new THREE.Vector3(
					this.#attrF(ax, 'x', 0),
					this.#attrF(ax, 'y', 0),
					this.#attrF(ax, 'z', 1)
				);
			}


			if (!isFinite(angle) || axis.lengthSq() === 0) {
				throw new OgreMaxError('E_FORMAT', 'Invalid axis-angle rotation', {node: n.outerHTML});
			}

			return q.setFromAxisAngle(axis.normalize(), angle);
		}

		// Euler fallback  (angleX / angleY / angleZ)  
		//    – OgreMax stores these in **degrees**
		if (n.hasAttribute('angleX') ||
				n.hasAttribute('angleY') ||
				n.hasAttribute('angleZ')) {

			const degToRad = Math.PI / 180;
			const euler = new THREE.Euler(
				this.#attrF(n, 'angleX', 0) * degToRad,
				this.#attrF(n, 'angleY', 0) * degToRad,
				this.#attrF(n, 'angleZ', 0) * degToRad,
				'XYZ'                                    // Ogre default order
			);
			return q.setFromEuler(euler);
		}

		// Unsupported → identity
		console.warn('[OgreMaxLoader] Unknown rotation format:', n.outerHTML);
		return q;
	}

	/**
	 * Simple 3-component vector from attributes `x / y / z`.
	 * @private
	 * @param	{Element|null}	n	- XML element with `x`, `y`, `z` attributes
	 * @returns	{THREE.Vector3}		- the resulting vector
	 */
	#attrVector(n){
		if(!n) return new THREE.Vector3();	// (0,0,0)
		return new THREE.Vector3(
			this.#attrF(n, 'x', 0),
			this.#attrF(n, 'y', 0),
			this.#attrF(n, 'z', 0)
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
	#filenameBase(path){
		const parts = path.split('/').pop().split('.');
		return parts.length > 2 ? parts.slice(0, -1).join('.') : parts[0];
	}

	/**
	 * Shorthand: same as node?.querySelector(sel) but returns `null`
	 * when `node` itself is `null`.
	 * @private
	 * @param	{Element|null}	node	- the parent node to query
	 * @param	{string}		sel		- the CSS selector to use
	 * @returns {Element|null}			- the first matching element or `null` if not found
	 */
	#q(node, sel){
		return node ? node.querySelector(sel) : null;
	}
}


/**
 * Loader for legacy Ogre *.material* text files.
 * Produces an **array of THREE.MeshPhongMaterial** objects, one per pass.
 */
class DotMaterialLoader extends THREE.Loader {
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
		this.textureLoader.flipY = false;          // Ogre + Three coordinate fix
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
				skinning: true,
				morphTargets: true
			});

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
                                                i--; // let handleTextureUnit consume the line
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
				eat('texture_unit');
				eat('{');
				let diffuseSet = false;

				while (peek() !== '}') {

					const t = next().split(/\s+/);
					switch (t[0]) {
						case 'texture':
							if (!diffuseSet) {
								m.map = loadTex(t[1]);
								diffuseSet = true;
							}
							else {
								m.emissiveMap = loadTex(t[1]);
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


export { OgreMaxLoader };
export { DotMaterialLoader };
