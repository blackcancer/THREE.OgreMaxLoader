/*
	Product: THREE.XMLOgreLoager
	Description: Three.js loader for Ogre xml file format
	License: http://creativecommons.org/licenses/by/3.0/legalcode

	FileVersion: 0.1-rev00004					Date: 2014-10-17
	By Blackcancer

	website: http://initsysrev.net
	support: blackcancer@initsysrev.net
*/


(function(){
	var PhongGlowShader = {

		uniforms: THREE.UniformsUtils.merge( [

			THREE.UniformsLib[ "common" ],
			THREE.UniformsLib[ "normalmap" ],
			THREE.UniformsLib[ "fog" ],
			THREE.UniformsLib[ "shadowmap" ],
			THREE.UniformsLib[ "lights" ],

			{
				"ambient"  : { type: "c", value: new THREE.Color( 0xffffff ) },
				"emissive" : { type: "c", value: new THREE.Color( 0x000000 ) },
				"specular" : { type: "c", value: new THREE.Color( 0x111111 ) },
				"shininess": { type: "f", value: 30 },
				"wrapRGB"  : { type: "v3", value: new THREE.Vector3( 1, 1, 1 ) },

				"glowMap"  	   : { type: "t", value: null },
				"glowIntensity": { type: "f", value: 1 },
			}

		] ),

		vertexShader: [

			"#define PHONG",

			"varying vec3 vViewPosition;",
			"varying vec3 vNormal;",

			THREE.ShaderChunk[ "map_pars_vertex" ],
			THREE.ShaderChunk[ "lightmap_pars_vertex" ],
			THREE.ShaderChunk[ "envmap_pars_vertex" ],
			THREE.ShaderChunk[ "lights_phong_pars_vertex" ],
			THREE.ShaderChunk[ "color_pars_vertex" ],
			THREE.ShaderChunk[ "morphtarget_pars_vertex" ],
			THREE.ShaderChunk[ "skinning_pars_vertex" ],
			THREE.ShaderChunk[ "shadowmap_pars_vertex" ],
			THREE.ShaderChunk[ "logdepthbuf_pars_vertex" ],

			"void main() {",

				THREE.ShaderChunk[ "map_vertex" ],
				THREE.ShaderChunk[ "lightmap_vertex" ],
				THREE.ShaderChunk[ "color_vertex" ],

				THREE.ShaderChunk[ "morphnormal_vertex" ],
				THREE.ShaderChunk[ "skinbase_vertex" ],
				THREE.ShaderChunk[ "skinnormal_vertex" ],
				THREE.ShaderChunk[ "defaultnormal_vertex" ],

			"	vNormal = normalize( transformedNormal );",

				THREE.ShaderChunk[ "morphtarget_vertex" ],
				THREE.ShaderChunk[ "skinning_vertex" ],
				THREE.ShaderChunk[ "default_vertex" ],
				THREE.ShaderChunk[ "logdepthbuf_vertex" ],

			"	vViewPosition = -mvPosition.xyz;",

				THREE.ShaderChunk[ "worldpos_vertex" ],
				THREE.ShaderChunk[ "envmap_vertex" ],
				THREE.ShaderChunk[ "lights_phong_vertex" ],
				THREE.ShaderChunk[ "shadowmap_vertex" ],

			"}"

		].join("\n"),

		fragmentShader: [

			"uniform vec3 diffuse;",
			"uniform float opacity;",

			"uniform vec3 ambient;",
			"uniform vec3 emissive;",
			"uniform vec3 specular;",
			"uniform float shininess;",

			"uniform sampler2D glowMap;",
			"uniform float glowIntensity;",

			THREE.ShaderChunk[ "color_pars_fragment" ],
			THREE.ShaderChunk[ "map_pars_fragment" ],
			THREE.ShaderChunk[ "lightmap_pars_fragment" ],
			THREE.ShaderChunk[ "envmap_pars_fragment" ],
			THREE.ShaderChunk[ "fog_pars_fragment" ],
			THREE.ShaderChunk[ "shadowmap_pars_fragment" ],
			THREE.ShaderChunk[ "lights_phong_pars_fragment" ],
			THREE.ShaderChunk[ "normalmap_pars_fragment" ],
			THREE.ShaderChunk[ "specularmap_pars_fragment" ],
			THREE.ShaderChunk[ "logdepthbuf_pars_fragment" ],

			"void main() {",

			"	gl_FragColor = vec4( vec3( 1.0 ), opacity );",

				THREE.ShaderChunk[ "logdepthbuf_fragment" ],
				THREE.ShaderChunk[ "map_fragment" ],
				THREE.ShaderChunk[ "alphatest_fragment" ],
				THREE.ShaderChunk[ "specularmap_fragment" ],

				THREE.ShaderChunk[ "lights_phong_fragment" ],

			"	float glow = texture2D(glowMap, vUv).x * glowIntensity * 2.0;",
			"	gl_FragColor.xyz = texelColor.xyz * clamp(emissive + totalDiffuse + ambientLightColor * ambient + glow, 0.0, 2.0) + totalSpecular;",

				THREE.ShaderChunk[ "lightmap_fragment" ],
				THREE.ShaderChunk[ "color_fragment" ],
				THREE.ShaderChunk[ "envmap_fragment" ],
				THREE.ShaderChunk[ "shadowmap_fragment" ],

				THREE.ShaderChunk[ "linear_to_gamma_fragment" ],

				THREE.ShaderChunk[ "fog_fragment" ],

			"}"

		].join("\n")

	};


	//--------------------------------------------
	// THREE.XMLOgreLoader
	//--------------------------------------------
	THREE.XMLOgreLoader	= function(showStatus){
		THREE.Loader.call(this, showStatus);
		this.withCredentials = false;
	};

	THREE.XMLOgreLoader.prototype = Object.create(THREE.Loader.prototype);

	THREE.XMLOgreLoader.prototype.load				= function(url, callback, texturePath){
		var scope = this;

		texturePath	= texturePath && (typeof texturePath === 'string')? texturePath : this.extractUrlBase(url);
		this.file = url.replace(texturePath, '');

		this.onLoadStart();
		this.loadAjaxXML(this, url, callback, texturePath);
	};

	THREE.XMLOgreLoader.prototype.loadSync			= function(url, callback, texturePath){
		var scope = this;

		texturePath	= texturePath && (typeof texturePath === 'string')? texturePath : this.extractUrlBase(url);
		this.file = url.replace(texturePath, '');

		this.onLoadStart();
		this.loadSynAjaxXML(this, url, callback, texturePath);
	};

	THREE.XMLOgreLoader.prototype.loadAjaxXML		= function(context, url, callback, texturePath, callbackProgress){
		if(!url){
			throw "No URL given.";
		}

		var xhr,
			length	= 0;

		if(window.XMLHttpRequest){
			xhr = new XMLHttpRequest();
		}
		else if(window.ActiveXObject){
			try {
				xhr = new ActiveXObject('Msxml2.XMLHTTP');
			}
			catch(cErr){
				try {
					xhr = new ActiveXObject('Microsoft.XMLHTTP');
				}
				catch(cErr){
				}
			}
		}

		if(!xhr){
			console.err("Cannot create an XMLHTTP instance");
			return false;
		}

		xhr.onreadystatechange = function(){
			if(this.readyState === this.DONE){
				var cType = this.getResponseHeader('Content-Type'),
					xml;

				if(this.status === 200){

					if(cType === 'text/xml' || cType === 'application/xml'){
						xml = this.responseXML;
					}
					else {
						xml = StringToXml(this.responseText);
					}

					var type	= xml.documentElement.nodeName,
						result	= null;

					switch(type){
						case 'scene':
							result = context.parseScene(xml, texturePath);
							callback(result);
						break;

						case 'mesh':
							result = context.parseMeshFile(xml, texturePath);
							callback(result);
						break;

						case 'skeleton':
							result = context.parseSkeleton(xml, texturePath);
							callback(result.bones, result.animations);
						break;

						default:
							console.error('THREE.XMLOgreLoader: "' + url + '" seems to be an unknown xml ogre format');
							return;
						break;
					}
				}
				else {
					console.error( 'THREE.XMLOgreLoader: Couldn\'t load "' + url + '" (' + this.status + ')' )
				}

			}
			else if(this.readyState === this.LOADING){
				if(callbackProgress){

					if(length === 0){
						length = this.getResponseHeader( 'Content-Length' );
					}

					callbackProgress({
						total: length,
						loaded: this.responseText.length
					});

				}
			}
			else if(this.readyState === this.HEADERS_RECEIVED){

				if(callbackProgress){
					length = this.getResponseHeader( 'Content-Length' );
				}

			}
		};

		xhr.open('GET', url, true);
		xhr.withCredentials = this.withCredentials;
		xhr.send();
	};

	THREE.XMLOgreLoader.prototype.loadSynAjaxXML	= function(context, url, callback, texturePath, callbackProgress){
		if(!url){
			throw "No URL given.";
		}

		var xhr,
			length	= 0;

		if(window.XMLHttpRequest){
			xhr = new XMLHttpRequest();
		}
		else if(window.ActiveXObject){
			try {
				xhr = new ActiveXObject('Msxml2.XMLHTTP');
			}
			catch(cErr){
				try {
					xhr = new ActiveXObject('Microsoft.XMLHTTP');
				}
				catch(cErr){
				}
			}
		}

		if(!xhr){
			console.err("Cannot create an XMLHTTP instance");
			return false;
		}

		xhr.open('GET', url, false);
		xhr.send();

		var cType = xhr.getResponseHeader('Content-Type'),
			xml;

		if(cType === 'text/xml' || cType === 'application/xml'){
			xml = xhr.responseXML;
		}
		else {
			xml = StringToXml(xhr.responseText);
		}

		var type	= xml.documentElement.nodeName,
			result	= null;

		switch(type){
			case 'scene':
				result = context.parseScene(xml, texturePath);
				callback(result);
			break;

			case 'mesh':
				result = context.parseMeshFile(xml, texturePath);
				callback(result);
			break;

			case 'skeleton':
				result = context.parseSkeleton(xml, texturePath);
				callback(result);
			break;

			default:
				console.error('THREE.XMLOgreLoader: "' + url + '" seems to be an unknown xml ogre format');
				return;
			break;
		}
	};

	THREE.XMLOgreLoader.prototype.parseMeshFile		= function(xml, texturePath){
		var scope		= this,
			object		= new THREE.Object3D(),
			bones, animations;

		if(xml.getElementsByTagName('skeletonlink').length > 0){
			var result	= parseSkeleton(xml.getElementsByTagName('skeletonlink')[0].getAttribute('name'), object);
			bones		= result.bones;
			animations	= result.animations;
		}

		if(xml.getElementsByTagName('submesh').length > 0){
			var submesh = xml.getElementsByTagName('submesh');

			for(var i = 0, il = submesh.length; i < il; i++){
				var node = submesh[i];

				object.add(parseMesh(node, bones, animations));
			}
		}

		if(xml.getElementsByTagName('submeshname').length > 0){
			var submeshname = xml.getElementsByTagName('submeshname');

			for(var i = 0, il = submeshname.length; i < il; i++){
				var node	= submeshname[i],
					index	= parseInt(node.getAttribute('index')),
					name	= node.getAttribute('name');

				object.children[index].name = name;
			}
		}

		return object;


		//sub functions
		function parseMesh(node, bonesList, animations){
			var userData	= {},
				mesh		= null
				geometry	= new THREE.Geometry();
				geom		= node.getElementsByTagName('geometry')[0],
				faces		= node.getElementsByTagName('faces')[0],
				bones		= node.getElementsByTagName('boneassignments')[0],
				assignment	= [];

			//parsing mesh attributes
			for(var i = 0, il = node.attributes.length; i < il; i++){
				var attr = node.attributes[i];

				switch(attr.name){
					case 'usesharedvertices':
						userData[attr.name] = parseBool(attr.value);
					break;

					case 'use32bitindexes':
						userData[attr.name] = parseBool(attr.value);
					break;

					case 'operationtype':
						userData[attr.name] = attr.value;
					break;

					default:
						userData[attr.name] = attr.value;
					break;
				}
			}

			geom = parseGeometry(geom);

			geometry.vertices	= geom.vertices;

			geometry.morphTargets.push({'name': 'animation_000000', 'vertices': geom.vertices});
			geometry.morphTargets.push({'name': 'animation_000001', 'vertices': geom.vertices});
			geometry.morphTargets.push({'name': 'animation_000002', 'vertices': geom.vertices});
			geometry.morphTargets.push({'name': 'animation_000003', 'vertices': geom.vertices});

			geometry.bones		= bonesList;
			geometry.animations	= animations;

			// parsing faces
			for(var i = 0, il = faces.children.length; i < il; i++){
				var face	= faces.children[i],
					a		= parseInt(face.getAttribute('v1')),
					b		= parseInt(face.getAttribute('v2')),
					c		= parseInt(face.getAttribute('v3')),
					index = geom.uvs.length -1,
					nrm		= [geom.normals[a]	, geom.normals[b]	, geom.normals[c]	],
					uv		= [geom.uvs[a]		, geom.uvs[b]		, geom.uvs[c]		];

				geometry.faces.push(face3(a, b, c, nrm));
				geometry.faceVertexUvs[0].push(uv);
			}

			// parsing bones assignment
			for(var i = 0, il = bones.children.length; i < il; i++){
				var bone	= bones.children[i],
					vIndex	= parseInt(bone.getAttribute('vertexindex'));

				if(!assignment[vIndex]){
					assignment[vIndex] = {
						'skinWeights':			[parseInt(bone.getAttribute('weight'))],
						'skinIndices':			[parseInt(bone.getAttribute('boneindex'))]
					};
				}
				else{
					assignment[vIndex].skinWeights.push(parseInt(bone.getAttribute('weight')));
					assignment[vIndex].skinIndices.push(parseInt(bone.getAttribute('boneindex')));
				}
			}

			for(var i = 0, l = assignment.length; i < l; i++){
				var x	= assignment[i].skinWeights[0] ?	assignment[i].skinWeights[0] : 0;
					y	= assignment[i].skinWeights[1] ?	assignment[i].skinWeights[1] : 0;
					z	= assignment[i].skinWeights[2] ?	assignment[i].skinWeights[2] : 0;
					w	= assignment[i].skinWeights[3] ?	assignment[i].skinWeights[3] : 0;

					a	= assignment[i].skinIndices[0] ?	assignment[i].skinIndices[0] : 0;
					b	= assignment[i].skinIndices[1] ?	assignment[i].skinIndices[1] : 0;
					c	= assignment[i].skinIndices[2] ?	assignment[i].skinIndices[2] : 0;
					d	= assignment[i].skinIndices[3] ?	assignment[i].skinIndices[3] : 0;

				geometry.skinWeights.push(vector4(x, y, z, w));
				geometry.skinIndices.push(vector4(a, b, c, d));
			}

			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
			geometry.computeFaceNormals();

			if(userData.operationtype === 'line_list'){
				mesh = new THREE.Line(geometry);
			}
			else {
				mesh = new THREE.SkinnedMesh(geometry);
			}

			mesh.userData = userData;
			return mesh;
		};

		function parseGeometry(nodeGeom){
			var	count			= parseInt(nodeGeom.getAttribute('vertexcount'));
				texture_coords	= 0,
				dimension		= 0,
				vertices		= [],
				normals			= [],
				uvs				= [];

			for(var i = 0, il = nodeGeom.children.length; i < il; i++){
				var nodeBuffer	= nodeGeom.children[i],
					asPos		= false,
					asNorm		= false,
					texcoords	= 0,
					dimension	= 0;

				for(var j = 0, jl = nodeBuffer.attributes.length; j < jl; j++){
					var vertexAttr	= nodeBuffer.attributes[j];

					switch(vertexAttr.name){
						case 'positions':
							asPos	= parseBool(vertexAttr.value);
						break;

						case 'normals':
							asNorm = parseBool(vertexAttr.value);
						break;

						case 'texture_coords':
							texcoords = parseInt(vertexAttr.value);
						break;

						case 'texture_coord_dimension_0':
							dimension = parseInt(vertexAttr.value);
						break;

						case 'texture_coord_dimensions_0':
							if(!isNaN(parseInt(vertexAttr.value))){
								dimension = parseInt(vertexAttr.value);
							}
							else {
								switch(vertexAttr.value){
									case 'float1':
										dimension = 1;
									break;

									case 'float2':
										dimension = 2;
									break;

									case 'float3':
										dimension = 3;
									break;

									default:
										throw "THREE.XMLOgreLoader: faild to parse vertexbuffer, undefined " + attr.name + " = " + attr.value;
									break;
								}
							}
						break;
					}
				}

				for(var j = 0, jl = nodeBuffer.children.length; j < jl; j++){

					for(var k = 0, kl = nodeBuffer.children[j].children.length; k < kl; k++){
						var node	= nodeBuffer.children[j].children[k];

						if(asPos && node.nodeName === 'position'){
							vertices.push(parseVector3(node));
						}
						else if(asNorm && node.nodeName === 'normal'){
							normals.push(parseVector3(node));
						}
						else if(texcoords > 0 && node.nodeName === 'texcoord'){

							if(dimension === 1){
								uvs.push(parseU(node));
							}
							else if(dimension === 2){
								uvs.push(parseUV(node));
							}
							else if(dimension === 3){
								uvs.push(parseUVW(node));
							}

						}
					}
				}

			}

			if(asPos && vertices.length != count){
				throw new Error("vertices(" + vertices.length + ") and vertexcount(" + count + ") should match");
			}

			return {vertices: vertices, normals: normals, uvs: uvs};
		};

		function parseSkeleton(file, object){
			var loader = new THREE.XMLOgreLoader(),
				data;

			loader.loadSync(texturePath + file + '.xml', function(result){
				data = result;
			});

			return data;
		};
	};

	THREE.XMLOgreLoader.prototype.parseSkeleton		= function(xml, texturePath){
		var scope		= this,
			bones		= [],
			animations	= [];

		if(xml.getElementsByTagName('bones').length > 0){
			var nodeBones = xml.getElementsByTagName('bones')[0];

			bones = parseBones(nodeBones);
		}

		if(xml.getElementsByTagName('bonehierarchy').length > 0){
			var nodeBones = xml.getElementsByTagName('bonehierarchy')[0];

			bones = parseBoneHierarchy(nodeBones, bones);
		}

		if(xml.getElementsByTagName('animation').length > 0){
			var nodeAnim = xml.getElementsByTagName('animation');

			for(var i = 0, il = nodeAnim.length; i < il; i++){
				animations.push(parseAnimations(nodeAnim[i], bones));
			}
		}

		return {'bones': bones, 'animations': animations};


		//sub functions
		function parseBones(node){
			var bones = [];

			for(var i = 0, il = node.children.length; i < il; i++){
				var nodeBone = node.children[i];

				if(nodeBone.nodeName === 'bone'){
					var id		= parseInt(nodeBone.getAttribute('id')),
						pos		= nodeBone.getElementsByTagName('position')[0],
						rot		= nodeBone.getElementsByTagName('rotation')[0],
						axis	= nodeBone.getElementsByTagName('axis')[0],
						quat	= new THREE.Quaternion(),
						bone	= {
							'parent':	-1,
							'name':		null,
							'pos':		[0, 0, 0],
							'scl':		[1, 1, 1],
							'rotq':		[0, 0, 0, 1]
						};

					pos		= parseVector3(pos)
					axis	= parseVector3(axis);
					rot		= parseInt(rot.getAttribute('angle'));

					quat.setFromAxisAngle(axis, rot);
					bone.name	= nodeBone.getAttribute('name');
					bone.pos	= [pos.x, pos.y, pos.z];
					bone.rotq	= [quat.x, quat.y, quat.z, quat.w];

					if(!(id >= 0)){
						throw new Error("Bone id(" + id + ") should be > 0.");
					}

					if(bone.name === null){
						throw new Error("Bone name(" + name + ") should have name.");
					}

					bones[id] = bone;
				}
			}

			return bones;
		};

		function parseBoneHierarchy(node, bones){
			var arr = bones;

			for(var i = 0, il = node.children.length; i < il; i++){
				var boneP = node.children[i];

				if(boneP.nodeName === 'boneparent'){
					var bone	= boneP.getAttribute('bone'),
						parent	= boneP.getAttribute('parent');

					for(var j = 0, jl = bones.length; j < jl; j++){
						if(bones[j].name === bone){

							for(var k = 0; k < jl; k++){
								if(bones[k].name === parent){
									bones[j].parent = k;
									break;
								}
							}

							break;
						}
					}
				}
			}

			return bones;
		};

		function parseAnimations(node, bones){
			var animation = {
					'name':			null,
					'fps':			30,
					'length':		0.0,
					'loop':			false,
					'hierarchy':	[]
				},
				tracks = node.getElementsByTagName('track');

			for(var i = 0, il = node.attributes.length; i < il; i++){
				var attr = node.attributes[i];

				switch(attr.name){
					case 'name':
						animation.name = attr.value;
					break;

					case 'loop':
						animation.loop = parseBool(attr.value);
					break;

					case 'length':
						animation.length = parseFloat(attr.value);
					break;

					case 'interpolationMode':
						console.warn("THREE.XMLOgreLoader: line " + (new Error).lineNumber + ", interpolationMode not yet implemented");
					break;

					case 'rotationInterpolationMode':
						console.warn("THREE.XMLOgreLoader: line " + (new Error).lineNumber + ", rotationInterpolationMode not yet implemented");
					break;
				}
			}

			for(var i = 0, il = tracks.length; i < il; i++){
				var bone		= tracks[i].getAttribute('bone'),
					keyframes	= tracks[i].getElementsByTagName('keyframe'),
					track		= {
						parent:	0,
						keys:	[]
					},
					bId = 0;

				for(var j = 0, jl = bones.length; j < jl; j++){
					if(bones[j].name === bone){
						track.parent = bones[j].parent;
						bId = j;
						break;
					}
				}

				for(var j = 0, jl = keyframes.length; j < jl; j++){
					track.keys.push(parseKeyframe(keyframes[j], bId));
				}

				animation.hierarchy.push(track);
			}

			return animation;
		};

		function parseKeyframe(node, bId){
			var trans		= node.getElementsByTagName('translate')[0],
				rot			= node.getElementsByTagName('rotate')[0],
				axis		= node.getElementsByTagName('axis')[0],
				quat		= new THREE.Quaternion(),
				keyframe	= {
					'time':	parseFloat(node.getAttribute('time')),
					'pos':	[0, 0, 0],
					'rot':	[0, 0, 0],
					'scl':	[1, 1, 1]
				};

			trans	= parseVector3(trans);
			axis	= parseVector3(axis);
			rot		= parseFloat(rot.getAttribute('angle'));

			quat.setFromAxisAngle(axis, rot);
			keyframe.pos	= [trans.x, trans.y, trans.z];
			keyframe.rot	= [quat.x, quat.y, quat.z, quat.w];

			return keyframe;
		};
	};

	THREE.XMLOgreLoader.prototype.parseScene		= function(xml, texturePath){
		var scope = this,
			scene	= new THREE.Scene(),
			camera	= new THREE.PerspectiveCamera();
			ambient	= new THREE.AmbientLight(0xffffff);
			params	= {};

		scene.add(camera);
		scene.add(ambient);

		for(var i = 0, il = xml.documentElement.attributes.length; i < il; i++){
			var attr = xml.documentElement.attributes[i];

			scene.userData[attr.name] = attr.value;
		}

		if(xml.getElementsByTagName('environment').length > 0){
			var environment = xml.getElementsByTagName('environment')[0];

			for(var i = 0, il = environment.length; i < il; i++){
				switch(environment[i].nodeName){
					case 'colourAmbient':
						var r = parseFloat(environment[i].getAttribute('r')),
							g = parseFloat(environment[i].getAttribute('g')),
							b = parseFloat(environment[i].getAttribute('b'));

						ambient.color	= new THREE.Color(r, g, b);
					break;

					case 'colourBackground':
						var r = parseFloat(environment[i].getAttribute('r')),
							g = parseFloat(environment[i].getAttribute('g')),
							b = parseFloat(environment[i].getAttribute('b'));

						scene.userData.backgroundColor = new THREE.Color(r, g, b);
					break;

					case 'clipping':
						camera.near = parseInt(environment[i].getAttribute('near'));
						camera.far = parseInt(environment[i].getAttribute('far'));
					break;

					default:
						console.warn('THREE.XMLOgreLoader: unknow environement attribute ' + attr.name);
					break;
				}
			}
		}

		if(xml.getElementsByTagName('node').length > 0){
			var node = xml.getElementsByTagName('node')

			for(var i = 0, il = node.length; i < il; i++){
				scene.add(parseNode(node[i]))
			}
		}

		return scene;


		//sub functions
		function parseNode(node){
			var name	= "",
				visible	= true,
				pos		= vector3(0, 0, 0),
				scl		= vector3(0, 0, 0),
				rot		= new THREE.Quaternion(0, 0, 0, 0),
				ent		= 0,
				object	= null;

			if(node.getAttribute('name')){
				name = node.getAttribute('name');
			}

			if(node.getAttribute('visibility')){
				switch(node.getAttribute('visibility')){
					case 'visible':
						visible = true;
					break;

					case 'hidden':
						visible = false;
					break;

					case 'tree visible':
						visible = true;
					break;

					case 'tree hidden':
						visible = true;
					break;
				}
			}

			for(var j = 0, jl = node.children.length; j < jl; j++){
				var child = node.children[j];

				switch(child.nodeName){
					case 'position':
						pos = parseVector3(child);
					break;

					case 'scale':
						scl = parseVector3(child);
					break;

					case 'rotation':
						var qx = parseFloat(child.getAttribute('qx')),
							qy = parseFloat(child.getAttribute('qy')),
							qz = parseFloat(child.getAttribute('qz')),
							qw = parseFloat(child.getAttribute('qw')),

						rot = new THREE.Quaternion(qx, qy, qz, qw);
					break;

					case 'animations':
						console.warn("THREE.XMLOgreLoader: animations from scene not yet implemented.")
					break;

					case 'entity':
						ent = 1;
						object = parseEntity(child);
					break;
				}
			}

			//to do
			if(ent === 0){
				object = new THREE.PerspectiveCamera();
			}

			object.name			= name;
			object.position		= pos;
			object.quaternion	= rot;
			object.scale		= scl;
			object.visibe		= visible;

			return object;
		};

		function parseEntity(node){
			var object			= null,
				name			= "",
				description		= "default",
				id				= null,
				castShadows		= false,
				receiveShadows	= false,
				meshFile		= null;

			for(var i = 0, il = node.attributes.length; i < il; i++){
				var attr = node.attributes[i];

				switch(attr.name){
					case 'name':
						name = attr.value;
					break;

					case 'description':
						description = attr.value;
					break;

					case 'id':
						id = parseInt(attr.value);
					break;

					case 'castShadows':
						castShadows = parseBool(attr.value);
					break;

					case 'receiveShadows':
						receiveShadows = parseBool(attr.value);
					break;

					case 'meshFile':
						var loader = new THREE.XMLOgreLoader();
						meshFile = attr.value;

						loader.loadSync(texturePath + meshFile + '.xml', function(obj){
							object = obj;

							object.castShadow			= castShadows;
							object.receiveShadow		= receiveShadows;

							object.userData.description	= description;
							object.userData.meshFile	= meshFile;

						});
					break;
				}
			}

			for(var i = 0; i < node.children.length; i++){
				var child = node.children[i];

				switch(child.nodeName){
					case 'subentities':
						for(var j = 0; j < child.children.length; j++){
							var subentity = child.children[j];

							if(subentity.getAttribute('index') && subentity.getAttribute('materialName')){
								var index		= parseInt(subentity.getAttribute('index')),
									url			= texturePath + scope.file.replace('scene', 'material'),
									name		= subentity.getAttribute('materialName');

								object.children[index].material = parseMaterial(url, name);
							}
						}
					break;

					case 'boneAttachments':
						//to do
					break;

					case 'userData':
						//to do
					break;
				}
			}

			return object;
		};

		function parseMaterial(file, name){
			var loader = new THREE.MaterialLoader(),
				material;

			loader.loadSync(file, function(materials){
				if(!materials[name]){
					throw "THREE.XMLOgreLoader: material " + name + " does not exist.";
				}

				material = materials[name];
			});

			return material;
		};
	};


	//--------------------------------------------
	// THREE.MaterialLoader
	//--------------------------------------------
	THREE.MaterialLoader = function(showStatus){
		THREE.Loader.call(this, showStatus);
		this.withCredentials = false;
	};

	THREE.MaterialLoader.prototype = Object.create(THREE.Loader.prototype);

	THREE.MaterialLoader.prototype.load				= function(url, callback, basePath){
		var scope = this;

		basePath = basePath && (typeof basePath === 'string')? basePath : this.extractUrlBase(url);
		this.file = url.replace(basePath, '');

		this.onLoadStart();
		this.loadAjax(this, url, callback, basePath);
	};

	THREE.MaterialLoader.prototype.loadSync			= function(url, callback, basePath){
		var scope = this;

		basePath = basePath && (typeof basePath === 'string')? basePath : this.extractUrlBase(url);
		this.file = url.replace(basePath, '');


		this.onLoadStart();
		this.loadSyncAjax(this, url, callback, basePath);
	};

	THREE.MaterialLoader.prototype.loadAjax			= function(context, url, callback, basePath, callbackProgress){
		if(!url){
			throw "No URL given.";
		}

		var xhr,
			length	= 0;

		if(window.XMLHttpRequest){
			xhr = new XMLHttpRequest();
		}
		else if(window.ActiveXObject){
			try {
				xhr = new ActiveXObject('Msxml2.XMLHTTP');
			}
			catch(cErr){
				try {
					xhr = new ActiveXObject('Microsoft.XMLHTTP');
				}
				catch(cErr){
				}
			}
		}

		if(!xhr){
			console.err("Cannot create an XMLHTTP instance");
			return false;
		}

		xhr.onreadystatechange = function(){
			if(this.readyState === this.DONE){
				var cType = this.getResponseHeader('Content-Type'),
					mat;

				if(!cType === 'text/xml' && !cType === 'application/xml'){
					console.error('THREE.XMLOgreLoader: "' + url + '" is not an xml file');
					return;
				}

				if(this.status === 200){

					if(this.responseText){
						var materials = context.parseMaterials(this.responseText, basePath);
						callback(materials);
					}
					else {
						console.error('THREE.XMLOgreLoader: "' + url + '" seems to be unreachable or the file is empty.');
					}

				}
				else {
					console.error( 'THREE.XMLOgreLoader: Couldn\'t load "' + url + '" (' + this.status + ')' )
				}

			}
			else if(this.readyState === this.LOADING){
				if(callbackProgress){

					if(length === 0){
						length = this.getResponseHeader( 'Content-Length' );
					}

					callbackProgress({
						total: length,
						loaded: this.responseText.length
					});

				}
			}
			else if(this.readyState === this.HEADERS_RECEIVED){

				if(callbackProgress){
					length = this.getResponseHeader( 'Content-Length' );
				}

			}
		};

		xhr.open('GET', url, true);
		xhr.withCredentials = this.withCredentials;
		xhr.send();
	};

	THREE.MaterialLoader.prototype.loadSyncAjax		= function(context, url, callback, basePath, callbackProgress){

		if(!url){
			throw "No URL given.";
		}

		var xhr,
			length	= 0;

		if(window.XMLHttpRequest){
			xhr = new XMLHttpRequest();
		}
		else if(window.ActiveXObject){
			try {
				xhr = new ActiveXObject('Msxml2.XMLHTTP');
			}
			catch(cErr){
				try {
					xhr = new ActiveXObject('Microsoft.XMLHTTP');
				}
				catch(cErr){
				}
			}
		}

		if(!xhr){
			console.err("Cannot create an XMLHTTP instance");
			return false;
		}

		xhr.open('GET', url, false);
		xhr.send();

		var materials = context.parseMaterials(xhr.responseText, basePath);
		callback(materials);
	};

	THREE.MaterialLoader.prototype.parseMaterials	= function(txt, basePath){
		var params		= {},
			materials	= {},
			arr			= txt.split('\n');
			params		= parseMaterial(arr, 0);

		for(key in params){
			materials[key] = new THREE.MeshPhongGlowMaterial();
			materials[key].needsUpdate = true;
			materials[key].transparent = true;
			materials[key].wrapAround = true;

			if(params[key].texture_unit){
				loadTexture(params[key].texture_unit[0].texture, key, function(resp, id){
					materials[id].uniforms.map.value = resp;
				});

				if(params[key].texture_unit.length > 1){
					loadTexture(params[key].texture_unit[1].texture, key, function(resp, id){
						materials[id].uniforms.glowMap.value = resp;
					});

				}
			}

			if(params[key].ambient){
				materials[key].uniforms.ambient.value = new THREE.Color(params[key].ambient[0], params[key].ambient[1], params[key].ambient[2]);
			}

			if(params[key].diffuse){
				materials[key].uniforms.diffuse.value = new THREE.Color(params[key].diffuse[0], params[key].diffuse[1], params[key].diffuse[2]);
			}

			if(params[key].specular){
				materials[key].uniforms.specular.value = new THREE.Color(params[key].specular[0], params[key].specular[1], params[key].specular[2]);
			}

			if(params[key].emissive){
				materials[key].uniforms.emissive.value = new THREE.Color(params[key].emissive[0], params[key].emissive[1], params[key].emissive[2]);
			}

		}

		return materials;

		function parseMaterial(arr, index){
			var items = {};

			while(true){
				if(!arr[index]){
					return items;
				}

				var line	= arr[index].trim().split(/\s/);
					key		= line[0];

				index++;

				if(key === 'material'){
					resp		= parseTechnique(arr, index);
					index		= resp.index;
					items[line[1]]	= resp.items;
				}
			}
		};

		function parseTechnique(arr, index){
			var items = {};

			while(true){
				var line	= arr[index].trim().split(/\s/);
					key		= line[0];

				index++;

				switch(key){
					case 'pass':
						resp = parsePass(arr, index);
						return {items: resp.items, index: resp.index};
					break;

					case '}':
						index++;
						return {items: items, index: index};
					break;
				}
			}
		};

		function parsePass(arr, index){
			var items ={};

			while(true){
				var line	= arr[index].trim().split(/\s/);
					key		= line[0];

				index++;

				switch(key){
					case 'ambient':
						items[key] = [parseFloat(line[1]), parseFloat(line[2]), parseFloat(line[3]), parseFloat(line[4])];
					break;

					case 'diffuse':
						items[key] = [parseFloat(line[1]), parseFloat(line[2]), parseFloat(line[3]), parseFloat(line[4])];
					break;

					case 'specular':
						items[key] = [parseFloat(line[1]), parseFloat(line[2]), parseFloat(line[3]), parseFloat(line[4]), parseFloat(line[5])];
					break;

					case 'emissive':
						items[key] = [parseFloat(line[1]), parseFloat(line[2]), parseFloat(line[3]), parseFloat(line[4])];
					break;

					case 'scene_blend':
						items[key] = [line[1], line[2]];
					break;

					case 'texture_unit':
						if(!items[key]){
							items[key] = [];
						}

						var name	= key;
						resp		= parseTextures(arr, index);
						index		= resp.index;
						items[name].push(resp.items);
					break;

					case '}':
						index++;
						return {items: items, index: index};
					break;
				}
			}
		};

		function parseTextures(arr, index){
			var items ={};

			while(true){
				var line	= arr[index].trim().split(/\s/);
					key		= line[0];

				index++;

				switch(key){
					case 'texture':
						items[key] = line[1];
					break;

					case 'colour_op_ex':
						items[key] = [line[1], line[2], line[3]];
					break;

					case 'colour_op_multipass_fallback':
						items[key] = [line[1], line[2]];
					break;

					case '}':
						index++;
						return {items: items, index: index};
					break;
				}
			}
		};

		function loadTexture(file, key, callback){
			var xhr,
				loaded = 0;

			if(window.XMLHttpRequest){
				xhr = new XMLHttpRequest();
			}
			else if(window.ActiveXObject){
				try {
					xhr = new ActiveXObject('Msxml2.XMLHTTP');
				}
				catch(cErr){
					try {
						xhr = new ActiveXObject('Microsoft.XMLHTTP');
					}
					catch(cErr){
					}
				}
			}

			if(!xhr){
				console.err("Cannot create an XMLHTTP instance");
				return false;
			}

			xhr.onreadystatechange = function(){
				if(this.readyState === this.DONE){
					var cType = this.getResponseHeader('Content-Type'),
						texture;

					if(this.status === 200){

						var blob	= this.response;
						blob.type	= "image/png";
						var map		= new THREE.ImageUtils.loadTexture(window.URL.createObjectURL(blob));
						map.flipY	= false;
						loaded++;
						callback(map, key);

					}
					else {
						console.error( 'THREE.XMLOgreLoader: Couldn\'t load "' + basePath + file + '" (' + this.status + ')' )
					}

				}
			};

			xhr.open('GET', basePath + file, true);
			xhr.responseType = 'blob';
			xhr.send();

			function isLoaded(){
				if(loaded < 1){
					window.setTimeout(isLoaded(),1000)
				}
			}
		};
	};


	//--------------------------------------------
	// MeshPhongGlowMaterial Class (http://stackoverflow.com/questions/23717512/three-js-emissive-material-maps)
	//--------------------------------------------
	THREE.MeshPhongGlowMaterial = function(map, glow, normal, emissive, glowIntensity) {
		this.shader		= PhongGlowShader;
		this.uniforms	= THREE.UniformsUtils.clone(this.shader.uniforms);

		this.uniforms["map"].value				= map;
		this.uniforms["glowMap"].value			= glow;
		this.uniforms["normalMap"].value		= normal;
		this.uniforms["emissive"].value			= new THREE.Color(emissive || 0);
		this.uniforms["glowIntensity"].value	= (glowIntensity !== undefined) ? glowIntensity : 1;

		THREE.ShaderMaterial.call(this, {
			uniforms:		this.uniforms,
			fragmentShader:	this.shader.fragmentShader,
			vertexShader:	this.shader.vertexShader,
			lights:			true,
		});

		this.map		= true;
		this.normalMap	= (normal !== undefined && normal !== null);
	};

	THREE.MeshPhongGlowMaterial.prototype = inherit(THREE.ShaderMaterial, {
		constructor: THREE.MeshPhongGlowMaterial,

		clone: function() {
			var material = new MeshPhongGlowMaterial(
				this.uniforms["map"].value,
				this.uniforms["glowMap"].value,
				this.uniforms["normalMap"].value,
				this.uniforms["emissive"].value,
				this.uniforms["glowIntensity"].value
			);

			return material;
		},

		get emissive() {
			return this.uniforms["emissive"].value;
		},

		set glowIntensity(value) {
			this.uniforms["glowIntensity"].value = value;
		},

		get glowIntensity() {
			return this.uniforms["glowIntensity"].value
		},
	});


	//--------------------------------------------
	// Helpers
	//--------------------------------------------
	function parseVector3(node){
		return vector3(node.getAttribute('x'), node.getAttribute('y'), node.getAttribute('z'));
	};

	function parseUVW(node){
		return vector3(node.getAttribute('u'), node.getAttribute('v'), node.getAttribute('w'));
	};

	function parseUV(node){
		return vector2(node.getAttribute('u'), node.getAttribute('v'));
	};

	function parseU(node){
		return parseFloat(node.getAttribute('u'));
	};

	function parseRGB(node){
		return rgb2hex(parseInt(node.getAttribute('r')), parseInt(node.getAttribute('g')), parseInt(node.getAttribute('b')));
	};

	function parseBool(string){
		string = string.toLowerCase();
		return (string == "true");
	};

	function vector3(x, y, z){
		return new THREE.Vector3(parseFloat(x), parseFloat(y), parseFloat(z));
	};

	function vector4(x, y, z, w){
		return new THREE.Vector4(parseFloat(x), parseFloat(y), parseFloat(z), parseFloat(w));
	};

	function vector2(x, y){
		return new THREE.Vector2(parseFloat(x), parseFloat(y));
	};

	function face3(a, b, c, normals){
		return new THREE.Face3(a, b, c, normals);
	};

	function rgb2hex(rgb) {
		return ( rgb[ 0 ] * 255 << 16 ) + ( rgb[ 1 ] * 255 << 8 ) + rgb[ 2 ] * 255;
	};

	function assert(condition, message) {
		if (!condition) {
			message = message || "Assertion failed";
			if(typeof Error !== "undefined"){
				throw new Error(message);
			}
			throw message; // Fallback
		}
	};

	function StringToXml(data){
		var xml;

		if (window.ActiveXObject){
			xml = new ActiveXObject('Microsoft.XMLDOM');
			xml.async='false';
			xml.loadXML(data);
		}
		else {
			var parser = new DOMParser();
			xml = parser.parseFromString(data,'text/xml');
		}

		return xml;
	};

	function inherit(classObj, members) {
		var base = Object.create(classObj.prototype);

		Object.getOwnPropertyNames(members).forEach(function(prop) {
			var desc = Object.getOwnPropertyDescriptor(members, prop);

			if (desc.get !== undefined) {
				base.__defineGetter__(prop, desc.get);
			} else {
				base[prop] = members[prop];
			}

			if (desc.set !== undefined) {
				base.__defineSetter__(prop, desc.set);
			}
		});
		
		return base;
	};
})();