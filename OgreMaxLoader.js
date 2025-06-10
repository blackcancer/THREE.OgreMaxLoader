/*
	Product: THREE.OgreMaxLoader
	Description: Three.js loader for OgreMax xml file format
	License: http://creativecommons.org/licenses/by/3.0/legalcode

	FileVersion: 0.2							Date: 2017-06-20
	By Blackcancer

	website: http://initsysrev.net
	support: blackcancer@initsysrev.net
*/

import * as THREE from 'three';

THREE.Cache.enabled = true;

	//--------------------------------------------
	// THREE.OgreMaxLoader
	//--------------------------------------------
	THREE.OgreMaxLoader = function(manager){
		this.manager			= (manager !== undefined)? manager : new THREE.LoadingManager();
		this.internalManager	= new THREE.LoadingManager();
		this.objectRoot			= {};
		this.path				= "";
		this.url				= "";
	};

	THREE.OgreMaxLoader.prototype = {
		constructor: THREE.OgreMaxLoader,

		get texturePath(){
			if(this._texturePath === undefined){
				this._texturePath = '';
			}

			return this._texturePath;
		},

		get withCredentials(){
			if(this._withCredentials === undefined){
				this._withCredentials = false;
			}

			return this._withCredentials;
		},

		set texturePath(value){
			if(typeof value !== 'string'){
				console.error("THREE.DotMaterialLoader.texturePath: Muste be a String!");
				return -1;
			}

			this._texturePath = value;
		},

		set withCredentials(value){
			if(typeof value !== boolean){
				console.error("THREE.XMLOgreLoader.withCredentials: Muste be a boolean!");
				return -1;
			}

			this._withCredentials = value;
		},

		load:	function(url, onLoad, onProgress, onError){
			var scope		= this,
				loader		= new THREE.FileLoader(scope.manager);

			onLoad		= onLoad		|| function(){};
			onProgress	= onProgress	|| function(){};
			onError		= onError		|| function(){};

			//Setup internal manager for eventual files like mesh, materials...
			this.internalManager.onStart	= function(url, itemsLoaded, itemsTotal){
				console.groupCollapsed('[OgreMaxLoader]');
				console.log("[OgreMaxLoader] Started loading " + url);
				console.log("\t\tLoaded: " + itemsLoaded + "/" + itemsTotal);
			};

			this.internalManager.onLoad		= function(){
				console.log("[OgreMaxLoader] All files loaded!");
				console.groupEnd();

				//if scene file is loaded
				if(scope.objectRoot.scene){
					var group = scope.objectRoot.scene.children[0],
						fname;

					fname = scope.url.split('/');
					fname = fname[fname.length -1];
					fname = fname.split('.');

					if(fname > 2){
						fname = fname.pop();
						fname = fname.join('.');
					}
					else{
						fname = fname[0];
					}

					if(group){
						for(var i = 0, il = group.children.length; i < il; i++){
							var object = group.children[i];

							for(var j = 0, jl = object.children.length; j < jl; j++){
								var mesh = object.children[j];

								if(mesh.name && scope.objectRoot[fname]){
									var materials = scope.objectRoot[fname].materials;
									mesh.material = materials
								}
							}
						}
					}

					scope.manager.itemEnd(url)
					onLoad(scope.objectRoot.scene);
				}

				//if mesh file is loaded
				if(scope.objectRoot.mesh){
					var mesh = scope.objectRoot.mesh;

					//if has a skeleton file
					if(scope.objectRoot.skeletonFile){
						var skeleton = scope.objectRoot.skeletonFile;

						mesh.geometry.animations = skeleton.anim;
						mesh.geometry.bones = skeleton.skel.bones;
						mesh.add(skeleton.skel.bones[0]);
						mesh.bind(skeleton.skel);
					}

					scope.manager.itemEnd(url)
					onLoad(mesh);
				}

				//if skeleton file is loaded
				if(scope.objectRoot.skeleton){
					scope.manager.itemEnd(url)
					onLoad(scope.objectRoot.skeleton);
				}
			};

			this.internalManager.onProgress	= function(url, itemsLoaded, itemsTotal){
				console.log("[OgreMaxLoader] Loading " + url);
				console.log("\t\tLoaded: " + itemsLoaded + "/" + itemsTotal);

				onProgress(itemsLoaded, itemsTotal);
			};

                        this.internalManager.onError = function(url){
                                const error = new Error("[OgreMaxLoader] Error loading " + url);
                                console.error(error);
                                onError(error);
                        };

			//Setup loader functions
			function onFileLoaded(response){
				var parser	= new DOMParser(),
					xml		= parser.parseFromString(response,'text/xml'),
					object;

				data = scope.parse(xml);

				if(data.scene){
					scope.objectRoot.scene = data.scene;
				}

				if(data.mesh){
					scope.objectRoot.mesh = data.mesh;
				}

				if(data.skeleton){
					scope.objectRoot.skeleton = data.skeleton;
				}

				scope.internalManager.itemEnd(url);
			};

			//TODO
			function onFileProgress(event){
			};

			//TODO
			function onFileError(event){
				scope.internalManager.itemError(url);
			};

			this.path	= THREE.Loader.prototype.extractUrlBase(url);
			this.url	= url; //will be used for throwing error

			this.manager.itemStart(url);
			this.internalManager.itemStart(url);

			loader.setWithCredentials(this.withCredentials);
			loader.load(url, onFileLoaded, onFileProgress, onFileError);
		},

		parse:	function(xml){
			var scope		= this,
				name		= xml.documentElement.nodeName,
				data		= {};

			switch(name){
				//if node <scene>
				case 'scene':
					data.scene = parseScene(xml.documentElement);
				break;

				//if node <mesh>
				case 'mesh':
					data.mesh = parseMesh(xml.documentElement);
				break;

				//if node <skeleton>
				case 'skeleton':
					data.skeleton = parseSkeleton(xml.documentElement);
				break;

				default:
					console.error('THREE.XMLOgreLoader.parse(): Unknown node <' + name + '>');
					console.error('	Cannot parse xml file', scope.url);
				break;
			}

			return data;

			//--------------------------------------------
			//Parsing Scene File
			/**
			* parseScene(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element who contain <position>, <rotation> and <scale>
			*
			* @return	
			**/
			function parseScene(XMLNode){
				var scene	= new THREE.Scene(),
					up		= XMLNode.getAttribute('upAxis') || 'y',
					node	= XMLNode.getElementsByTagName('nodes')[0];

				//Set the Up axis
				switch(up){
					case 'x':
						scene.up = new THREE.Vector3(1, 0, 0);
						break;

					case 'y':
						scene.up = new THREE.Vector3(0, 1, 0);
						break;

					case 'z':
						scene.up = new THREE.Vector3(0, 0, 1);
						break;

					default:
						scene.up = new THREE.Vector3(0, 1, 0);
						break;
				}

				//Add informations in scene.userData
				scene.userData = {
					formatVersion:	attrFloat(XMLNode, 'formatVersion',		0.0),
					minOgreVersion:	attrFloat(XMLNode, 'minOgreVersion',	0.0),
					ogreMaxVersion:	attrFloat(XMLNode, 'ogreMaxVersion',	0.0),
					unitsPerMeter:	attrFloat(XMLNode, 'unitsPerMeter',		1.0),
					unitType:		XMLNode.getAttribute('unitType')	|| "meters",
					author:			XMLNode.getAttribute('author')		|| undefined,
					application:	XMLNode.getAttribute('application')	|| undefined
				}

				//Log all informations about file
				console.groupCollapsed("[OgreMaxLoader] dotScene info:");
				console.log("Format Version:",	scene.userData.formatVersion);
				console.log("OgrMax Version:",	scene.userData.ogreMaxVersion);
				console.log("Author:",			scene.userData.author);
				console.log("Application:",		scene.userData.application);
				console.log("Unit type:",		scene.userData.unitType);
				console.log("scale:",			scene.userData.unitsPerMeter);

				//if <nodes> exist
				//Checked first to load files (mesh, skeleton) async
				//while we parse all the other part of <scene>
				if(node){
					//get Group from node
					var group = parseNodes(node);

					//add Group to Scene
					scene.add(group);
				}

				//if <environment> exist
				node = XMLNode.getElementsByTagName('environment')[0];
				if(node){
					//get Group from node
					var group = parseEnvironment(node);
					// scene.background = group.userData.background;

					//add Group to Scene
					scene.add(group)
				}

				console.groupEnd();
				return scene;
			};

			//Parsing Environment
			/**
			* parseEnvironment(XMLNode)
			*
			* @param	XMLDocument			XMLNode	: XML element <environment>
			*
			* @return	THREE.Group()		Group of THREE.Object3D() from XMLNode
			**/
			function parseEnvironment(XMLNode){
				var group	= new THREE.Group(),
					node	= XMLNode.getElementsByTagName('colourAmbient')[0];

				//if <colourAmbient> exist
				if(node){
					//create AmbientLight
					var ambient	= new THREE.AmbientLight()
						color	= attrColorRGB(node);

					//set AmbientLight color from node's attributes
					ambient.color = color;
					//add AmbientLight to Group
					group.add(ambient);
				}

				//if <colourBackground> exist
				node = XMLNode.getElementsByTagName('colourBackground')[0];
				if(node){
					//get Color from node's attributes
					var color = attrColorRGB(node);

					//add Color to Group userData
					group.userData.background = color;
				}

				//if <clipping> exist
				node = XMLNode.getElementsByTagName('clipping')[0];
				if(node){
					//get clipping values from node's attributes
					var clipping = {
						near: attrFloat(node, 'near', 0.0),
						far: attrFloat(node, 'far', 1.0)
					}

					//add clipping to Group userData
					group.userData.clipping = clipping;
				}

				//set name to Group for use of parent.getObjectByName(name)
				group.name = "environment";
				return group;
			};

			//Parsing Nodes
			/**
			* parseNodes(XMLNode)
			*
			* @param	XMLDocument		XMLNode	: XML element <nodes>
			*
			* @return	THREE.Group()	Group of XMLNode
			**/
			function parseNodes(XMLNode){
				var group	= new THREE.Group(),
					node	= XMLNode.getElementsByTagName('node');

				//for each <node>
				for(var i = 0, il = node.length; i < il; i++){
					//get Object3D from node
					var object = parseNode(node[i]);

					//add Object3D to Group
					group.add(object);
				}

				//set name to Group for use of parent.getObjectByName(name)
				group.name = "nodes";
				group.applyMatrix(attrMatrix(XMLNode));
				return group;
			};

			/**
			* parseNode(XMLNode)
			*
			* @param	XMLDocument			XMLNode	: XML element <node>
			*
			* @return	THREE.Object3D()	Object3D of XMLNode
			**/
			function parseNode(XMLNode){
				var object	= new THREE.Object3D(),
					node	= XMLNode.getElementsByTagName('entity')[0];

				//if <entity> exist
				if(node){
					parseEntity(node, object);
				}

				//if <node> exist
				node = XMLNode.getElementsByTagName('node')[0];
				if(node){
					//get Object3D from node
					var subNode = parseNode(node);

					//add Object3D to Object3D
					object.add(subNode);
				}

				//set name to Object for use of parent.getObjectByName(name)
				object.name			= XMLNode.getAttribute('name');
				object.visibility	= attrBool(XMLNode, 'visibility', object.visibility);
				object.applyMatrix(attrMatrix(XMLNode));
				return object;
			};

			//TODO
			/**
			* parseEntity(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element <entity>
			* @param	THREE.Object3D	object		: Object3D to populate
			*
			* @return	null
			**/
			function parseEntity(XMLNode, object){
				var internalLoader	= new THREE.OgreMaxLoader(scope.manager),
					url				= scope.path + XMLNode.getAttribute('meshFile') + '.xml',
					node			= XMLNode.getElementsByTagName('subentities')[0],
					boneAttachments, materialIndex;

				scope.internalManager.itemStart(url);
				internalLoader.load(url, onFileLoaded, onFileProgress, onFileError);

				//if <subentities> exist
				if(node){
					parseSubEntities(node);
				}

				//if <boneAttachments> exist
				node = XMLNode.getElementsByTagName('boneAttachments')[0];
				if(node){
					boneAttachments = parseBoneAttachments(node);
				}

				//Setup internalLoader functions
				function onFileLoaded(mesh){
					mesh.name		= XMLNode.getAttribute('name')	||		mesh.name;
					mesh.castShadow	= attrBool(XMLNode,	'castShadows',		mesh.castShadow);
					mesh.castShadow	= attrBool(XMLNode,	'receiveShadows',	mesh.receiveShadow);

					object.add(mesh);
					scope.internalManager.itemEnd(url);
				};

				//TODO
				function onFileProgress(event){
				};

				//TODO
				function onFileError(event){
					scope.internalManager.itemError(url);
				};
			};

			/**
			* parseSubEntities(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element <subentities>
			* @param	String			name		: name of parent entity
			*
			* @return	Array			Array of materials name
			**/
			function parseSubEntities(XMLNode){
				var materialIndex	= [],
					node			= XMLNode.getElementsByTagName('subentity'),
					url, fname;

				fname = scope.url.split('/');
				fname = fname[fname.length -1];
				fname = fname.split('.');

				if(fname > 2){
					fname = fname.pop();
					fname = fname.join('.');
				}
				else{
					fname = fname[0];
				}

				url = scope.path + fname + ".material";

				var internalLoader = new THREE.DotMaterialLoader(scope.manager);

				scope.internalManager.itemStart(url);
				internalLoader.texturePath = scope.texturePath || scope.path;
				internalLoader.load(url, onFileLoaded, onFileProgress, onFileError);

				//Setup internalLoader functions
				function onFileLoaded(materials){

					for(var i = 0, il = node.length; i < il; i++){
						var index		= attrInt(node[i], 'index'),
							material	= node[i].getAttribute('materialName');
							
						if(!materials[index] || materials[index].name != material){
							scope.internalManager.itemError(url);
							throw "Missing material at index " + index + ": " + material;
						}

						scope.objectRoot[fname] = {};
						scope.objectRoot[fname].materials = materials;
					}

					scope.internalManager.itemEnd(url);
				};

				//TODO
				function onFileProgress(event){
				};

				//TODO
				function onFileError(event){
					scope.internalManager.itemError(url);
				};
			};

			/**
			* parseBoneAttachments(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element who contain <position>, <rotation> and <scale>
			*
			* @return	Object			Liste of bones attachments by name to get matrix
			**/
			function parseBoneAttachments(XMLNode){
				var attachments	= {},
					node		= XMLNode.getElementsByTagName('boneAttachment');

				for(var i = 0, il = node.length; i < il; i++){
					var bone = node[i].getAttribute('bone');

					attachments[bone] = attrMatrix(node[i]);
				}

				return attachments;
			};

			//--------------------------------------------
			//Parsing Mesh File
			/**
			* parseMesh(XMLNode)
			*
			* @param		XMLDocument			XMLNode			: XML element <mesh>
			*
			* @return		THREE.SkinnedMesh	THREE.SkinnedMesh from XMLNode
			**/
			function parseMesh(XMLNode){
				var geometry	= new THREE.Geometry(),
					meshes		= [],
					node		= XMLNode.getElementsByTagName('sharedgeometry')[0],
					mesh, sharedGeometry;

				geometry.merge = geomMerge;

				//if <sharedgeometry> exist
				if(node){
					sharedGeometry = parseGeometry(node);
				}

				//if <submeshes> exist
				node = XMLNode.getElementsByTagName('submeshes')[0];
				if(node){
					meshes = parseSubmeshes(node, sharedGeometry);
				}

				//if <submeshname> exist
				node = XMLNode.getElementsByTagName('submeshname')[0];
				if(node){
					meshes = parseSubmeshnames(node, meshes);
				}

				//merging all geometry for this mesh
				for(var i = 0, il = meshes.length; i < il; i++){
					geometry.mergeMesh(meshes[i]);
				}

				var material = new THREE.MeshPhongMaterial();

				material.skinning = true;
				material.morphTargets = true;
				material.specular.setHSL( 0, 0, 0.1 );
				material.color.setHSL( 0.6, 0, 0.6 );

				mesh = new THREE.SkinnedMesh(geometry, material);

				//if <skeletonlink> exist
				node = XMLNode.getElementsByTagName('skeletonlink')[0];
				if(node){
					var internalLoader = new THREE.OgreMaxLoader(scope.manager),
						url = scope.path + node.getAttribute('name') + '.xml';

					scope.internalManager.itemStart(url);
					internalLoader.load(url, onFileLoaded, onFileProgress, onFileError);

					function onFileLoaded(data){
						//record data in objectRoot to use later (when all files are loaded)
						scope.objectRoot.skeletonFile = {
							skel: data.skeleton,
							anim: data.animations
						};

						scope.internalManager.itemEnd(url);
					};

					function onFileProgress(event){
					};

					//TODO
					function onFileError(event){
						scope.internalManager.itemError(url);
					};
				}

				return mesh;
			};

			//Parsing Submeshes
			/**
			* parseSubmeshes(XMLNode, sharedGeometry)
			*
			* @param		XMLDocument		XMLNode			: XML element <submeshes>
			* @param		THREE.Geometry	sharedGeometry	: THREE.Geometry used for mesh from xml document
			*
			* @return		Array			Array of THREE.Mesh from XMLNode
			**/
			function parseSubmeshes(XMLNode, sharedGeometry){
				var meshes	= [],
					node	= XMLNode.getElementsByTagName('submesh');

				for(var i = 0, il = node.length; i < il; i++){
					meshes.push(parseSubmesh(node[i]));
				}

				return meshes;
			};

			/**
			* parseSubmesh(XMLNode, sharedGeometry)
			*
			* @param		XMLDocument		XMLNode	: XML element <submesh>
			* @param		THREE.Geometry	sharedGeometry	: THREE.Geometry used for mesh
			*
			* @return		THREE.Mesh		THREE.Mesh from XMLNode
			**/
			function parseSubmesh(XMLNode, sharedGeometry){
				var mesh		= new THREE.SkinnedMesh(new THREE.Geometry(), new THREE.MeshPhongMaterial()),
					normals		= [],
					uvs			= [],
					node		= XMLNode.getElementsByTagName('geometry')[0];

				mesh.userData.operationtype		= XMLNode.getAttribute('operationtype');
				mesh.userData.usesharedvertices	= attrBool(XMLNode, 'usesharedvertices');
				mesh.userData.use32bitindexes	= attrBool(XMLNode, 'use32bitindexes');

				if(node || mesh.userData.usesharedvertices){
					var data = (mesh.userData.usesharedvertices)? sharedGeometry : parseGeometry(node);

					if(data.vertices.length !== attrInt(node, 'vertexcount')){
						throw new Error("vertices(" + data.vertices.length + ") and vertexcount(" + attrInt(node, 'vertexcount') + ") should match");
					}

					mesh.geometry.vertices	= data.vertices;
					normals					= data.normals;
					uvs						= data.uvs;
				}
				else {
					throw new Error("No Geometry available for mesh");
				}

				node = XMLNode.getElementsByTagName('faces')[0];
				if(node){
					parseFaces(node, mesh.geometry, normals, uvs);
				}

				node = XMLNode.getElementsByTagName('boneassignments')[0];
				if(node){
					parseBoneassignments(node, mesh.geometry);
				}

				if(XMLNode.getAttribute('operationtype') === 'line_list'){
					mesh = new THREE.Line(mesh.geometry, mesh.material);
				}

				mesh.updateMorphTargets();

				return mesh;
			};

			//Parsing Geometry
			/**
			* parseGeometry(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <geometry> or <sharedgeometry>
			*
			* @return		Object			{Array vertices, Array normals, Array uvs}
			**/
			function parseGeometry(XMLNode){
				var count			= attrInt(XMLNode, 'vertexcount')
					vertices		= [],
					normals			= [],
					uvs				= [],
					node			= XMLNode.getElementsByTagName('vertexbuffer');

				for(var i = 0, il = node.length; i < il; i++){
					var vertexbuffer = parseVertexbuffer(node[i]);

					vertices	= vertices.concat(vertexbuffer.vertices);
					normals		= normals.concat(vertexbuffer.normals);
					uvs			= uvs.concat(vertexbuffer.uvs);
				}

				return {'vertices': vertices, 'normals': normals, 'uvs': uvs,};
			};

			/**
			* parseVertexbuffer(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <vertexbuffer>
			*
			* @return		Object			{Array vertices, Array normals, Array uvs}
			**/
			function parseVertexbuffer(XMLNode){
				var positions					= attrBool(XMLNode, 'positions', false),
					normals						= attrBool(XMLNode, 'normals', false),
					texture_coords				= attrInt(XMLNode, 'texture_coords', 0),
					texture_coord_dimensions	= [],
					vertices					= [],
					normals						= [],
					uvs							= [],
					node						= XMLNode.getElementsByTagName('vertex');

				for(var i = 0; i < texture_coords; i++){
					var dimension = XMLNode.getAttribute('texture_coord_dimensions_' + i);

					dimension = parseInt(dimension.replace('float', ''));
					texture_coord_dimensions[i] = dimension;
				}

				for(var i = 0, il = node.length; i < il; i++){
					vertex = parseVertex(node[i], positions, normals, texture_coords, texture_coord_dimensions);

					vertices	= vertices.concat(vertex.vertice);
					normals		= normals.concat(vertex.normal);
					uvs			= uvs.concat(vertex.uv);
				}

				return {'vertices': vertices, 'normals': normals, 'uvs': uvs,};
			}

			/**
			* parseVertex(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <vertex>
			*
			* @return		Object			{Array vertice, Array normal, Array uv};
			**/
			function parseVertex(XMLNode, positions, normals, texture_coords, texture_coord_dimensions){
				var vertice		= [],
					normal		= [],
					uv			= [];

				if(positions){
					var node = XMLNode.getElementsByTagName('position')[0];

					vertice.push(attrVector3(node));
				}

				if(normals){
					var node = XMLNode.getElementsByTagName('normal')[0];

					normal.push(attrVector3(node));
				}

				if(texture_coords > 0){
					var node = XMLNode.getElementsByTagName('texcoord');

					for(var i = 0; i < texture_coords; i++){
						switch(texture_coord_dimensions[i]){
							case 1:
								uv.push(attrU(node[i]));
							break;

							case 2:
								uv.push(attrUv(node[i]));
							break;

							case 3:
								uv.push(attrUvw(node[i]));
							break;
						}
					}
				}

				return {'vertice': vertice, 'normal': normal, 'uv': uv};
			}

			//Parsing Faces
			/**
			* parseFaces(XMLNode, geometry, normals, uvs)
			*
			* @param		XMLDocument		XMLNode		: XML element <faces>
			* @param		THREE.Geometry	geometry	: THREE.Geometry to edit
			* @param		Array			normals		: Array of normals to compute faces
			* @param		Array			uvs			: Array of uvs to compute face vertex uvs
			*
			* @return		null
			**/
			function parseFaces(XMLNode, geometry, normals, uvs){
				var node = XMLNode.getElementsByTagName('face');

				for(var i = 0, il = node.length; i < il; i++){
					var data = parseFace(node[i], normals, uvs);

					geometry.faces.push(data.face);
					geometry.faceVertexUvs[0].push(data.uvs);
				}

				geometry.computeBoundingBox();
				geometry.computeBoundingSphere();
				geometry.computeFaceNormals();
			};

			/**
			* parseFace(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <face>
			*
			* @return		Object			{THREE.Face3 face, Array uv}
			**/
			function parseFace(XMLNode, normals, uvs){
				var v1	= attrInt(XMLNode, 'v1'),
					v2	= attrInt(XMLNode, 'v2'),
					v3	= attrInt(XMLNode, 'v3'),
					nrm	= [normals[v1], normals[v2], normals[v3]],
					uv	= [uvs[v1], uvs[v2], uvs[v3]];

				return {'face': new THREE.Face3(v1, v2, v3, nrm), 'uvs': uv};
			};

			//Parsing Boneassignments
			/**
			* parseBoneassignments(XMLNode)
			*
			* @param		XMLDocument		XMLNode		: XML element <skeleton>
			* @param		THREE.Geometry	geometry	: THREE.Geometry to edit
			*
			* @return		null
			**/
			function parseBoneassignments(XMLNode, geometry){
				var assignment	= new Array(geometry.vertices.length),
					skinWeights	= [],
					skinIndices	= [],
					node		= XMLNode.getElementsByTagName('vertexboneassignment');


				for(var i = 0, il = node.length; i < il; i++){
					var vIndex	= attrInt(node[i], 'vertexindex'),
						bIndex	= attrInt(node[i], 'boneindex'),
						weight	= attrFloat(node[i], 'weight');

					if(!assignment[vIndex]){
						assignment[vIndex] = {'skinIndices': [], 'skinWeights': []};
					}
					assignment[vIndex].skinIndices.push(bIndex);
					assignment[vIndex].skinWeights.push(weight);
				}

				for(var i = 0, il = geometry.vertices.length; i < il; i++){
					var	a = assignment[i].skinIndices[0] ? assignment[i].skinIndices[0] : 0,
						b = assignment[i].skinIndices[1] ? assignment[i].skinIndices[1] : 0,
						c = assignment[i].skinIndices[2] ? assignment[i].skinIndices[2] : 0,
						d = assignment[i].skinIndices[3] ? assignment[i].skinIndices[3] : 0,

						x = assignment[i].skinWeights[0] ? assignment[i].skinWeights[0] : 0,
						y = assignment[i].skinWeights[1] ? assignment[i].skinWeights[1] : 0,
						z = assignment[i].skinWeights[2] ? assignment[i].skinWeights[2] : 0,
						w = assignment[i].skinWeights[3] ? assignment[i].skinWeights[3] : 0;


					geometry.skinIndices.push(new THREE.Vector4(a, b, c, d));
					geometry.skinWeights.push(new THREE.Vector4(x, y, z, w));
				}
			};

			//Parsing Submeshnames
			/**
			* parseSubmeshnames(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <skeleton>
			* @param		Array			meshes	: Array of THREE.Mesh to edit
			*
			* @return		Array			Array of THREE.Mesh edited
			**/
			function parseSubmeshnames(XMLNode, meshes){
				var node = XMLNode.getElementsByTagName('submeshname');

				for(var i = 0, il = node.length; i < il; i++){
					meshes = parseSubmeshname(XMLNode, meshes);
				}

				return meshes;
			};

			/**
			* parseSubmeshname(XMLNode)
			*
			* @param		XMLDocument		XMLNode		: XML element <skeleton>
			* @param		Array			meshes	: Array of THREE.Mesh to edit
			*
			* @return		Array			Array of THREE.Mesh edited
			**/
			function parseSubmeshname(XMLNode, meshes){
				var name	= XMLNode.getAttribute('name'),
					index	= attrInt(XMLNode, 'index');

				meshes[index].name = name;

				return meshes;
			};

			//--------------------------------------------
			//Parsing Skeleton File
			/**
			* parseSkeleton(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <skeleton>
			*
			* @return		Object			{THREE.Skeleton skeleton, Array animations}
			**/
			function parseSkeleton(XMLNode){
				var animations			= [],
					bones				= [],
					skeleton			= new THREE.Skeleton,
					node				= XMLNode.getElementsByTagName('bones')[0];

				if(node){
					bones = parseBones(node);
				}

				node = XMLNode.getElementsByTagName('bonehierarchy')[0];
				if(node){
					skeleton = new THREE.Skeleton(parseBonehierarchy(node, bones))
				}

				node = XMLNode.getElementsByTagName('animations')[0];
				if(node){
					animations = parseAnimations(node, bones);
				}

				return {'skeleton': skeleton, 'animations': animations};
			};

			//Parsing Bones
			/**
			* parseBones(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <bones>
			*
			* @return		Array			Array of THREE.Bone from XMLNode
			**/
			function parseBones(XMLNode){
				var bones	= [],
					node	= XMLNode.getElementsByTagName('bone');

				for(var i = 0, il = node.length; i < il; i++){
					var bone = parseBone(node[i]);
					bones[bone.name] = bone;
				}

				return bones;
			};

			/**
			* parseBone(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <bone>
			*
			* @return		THREE.Bone		Bone from XMLNode
			**/
			function parseBone(XMLNode){
				var bone	= new THREE.Bone(),
					node	= XMLNode.getElementsByTagName('position')[0];

				bone.name = XMLNode.getAttribute('name');
				bone.userData.index = attrInt(XMLNode, 'id');
				bone.applyMatrix(attrMatrix(XMLNode));
				return bone;
			};

			/**
			* parseBonehierarchy(XMLNode, bones)
			*
			* @param		XMLDocument		XMLNode	: XML element <bonehierarchy>
			* @param		Array			bones	: Array of THREE.Bone
			*
			* @return		Array			Array of THREE.Bone
			**/
			function parseBonehierarchy(XMLNode, bones){
				var newBones	= [],
					node		= XMLNode.getElementsByTagName('boneparent');

				//Retrive each parent and child trought <bonehierarchy> node
				for(var i = 0, il = node.length; i < il; i++){
					var parent		= bones[node[i].getAttribute('parent')],
						bone		= bones[node[i].getAttribute('bone')];

					//Add children bone (attribute bone) to his parent (attribute parent)
					parent.add(bone);
				}

				//Recreate bones array to match with THREE.Skeleton() requierment
				for(var k in bones){
					newBones[bones[k].userData.index] = bones[k];
				}

				return newBones;
			};

			//Parsing Animations
			/**
			* parseAnimation(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <animation>
			*
			* @return		Array			Array of THREE.AnimationClip from XMLNode
			**/
			function parseAnimations(XMLNode, bones){
				var animations	= [],
					node		= XMLNode.getElementsByTagName('animation');

				for(var i = 0, il = node.length; i < il; i++){
					animations.push(parseAnimation(node[i], bones));
				}

				return animations;
			};

			/**
			* parseAnimation(XMLNode)
			*
			* @param		XMLDocument				XMLNode	: XML element <animation>
			*
			* @return		THREE.AnimationClip		Animation clip from XMLNode
			**/
			function parseAnimation(XMLNode, bones){
				var name	= XMLNode.getAttribute('name') || "default",
					length	= attrFloat(XMLNode, 'length'),
					tracks	= parseTracks(XMLNode.getElementsByTagName('tracks')[0], bones);

				return new THREE.AnimationClip(name, length, tracks);
			};

			/**
			* parseTracks(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <tracks>
			*
			* @return		Array			Array of THREE.KeyframeTrack from XMLNode
			**/
			function parseTracks(XMLNode, bones){
				var tracks	= [],
					node	= XMLNode.getElementsByTagName('track');

				for(var i = 0, il = node.length; i < il; i++){
					tracks = tracks.concat(parseTrack(node[i], bones));
				}

				return tracks;
			};

			/**
			* parseTrack(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <track>
			*
			* @return		Array			Array of THREE.KeyframeTrack from XMLNode
			**/
			function parseTrack(XMLNode, bones){
				var boneName	= XMLNode.getAttribute('bone'),
					tracks		= [],
					node	= XMLNode.getElementsByTagName('keyframes')[0];

				if(boneName && node){
					var data = parseKeyframes(node, bones[boneName]);

					if(data.positions.times.length > 0){
						var times	= data.positions.times,
							values	= data.positions.values,
							track	= new THREE.VectorKeyframeTrack('.bones[' + boneName + '].position', times, values);

						tracks.push(track);
					}

					if(data.rotations.times.length > 0){
						var times	= data.rotations.times,
							values	= data.rotations.values,
							track	= new THREE.QuaternionKeyframeTrack('.bones[' + boneName + '].quaternion', times, values);

						tracks.push(track);
					}

					if(data.scales.times.length > 0){
						var times	= data.scales.times,
							values	= data.scales.values,
							track	= new THREE.VectorKeyframeTrack('.bones[' + boneName + '].scale', times, values);

						tracks.push(track);
					}
				}
				else if(!boneName){
					console.error('THREE.OgreMaxLoader.parseTrack(): bone attribute required!');
					console.error(XMLNode);
				}
				else if(!node){
					console.error('THREE.OgreMaxLoader.parseTrack(): node <keyframes> not found!');
					console.error(XMLNode);
				}

				return tracks;
			};

			/**
			* parseKeyframes(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <keyframes>
			*
			* @return		Object			{Object positions, Object rotations, Object scales}
			**/
			function parseKeyframes(XMLNode, bone){
				var positions	= {times: [],values: []},
					rotations	= {times: [],values: []},
					scales		= {times: [],values: []};

				//parse all keyframe values
				for(var i = 0, il = XMLNode.children.length; i < il; i++){
					var node = XMLNode.children[i];

					if(node.nodeName !== 'keyframe'){
						console.warn("THREE.OgreMaxLoader.parseKeyframes(): Unknown node name <" + node.nodeName + ">");
						continue;
					}

					var data = parseKeyframe(node),
						mPosition	= new THREE.Vector3(),
						mRotation	= new THREE.Quaternion(),
						mScale		= new THREE.Vector3();

					data.matrix.decompose(mPosition, mRotation, mScale);

					positions.times.push(data.time);
					rotations.times.push(data.time);
					scales.times.push(data.time);

					//Add translation to bone position to get final position
					mPosition.add(bone.position);

					//Multiply quaternion to bone quaternion to get the final rotation
					mRotation.multiplyQuaternions(bone.quaternion, mRotation).normalize();

					positions.values	= positions.values.concat(mPosition.toArray());
					rotations.values	= rotations.values.concat(mRotation.toArray());
					scales.values		= scales.values.concat(mScale.toArray());
				}

				return {'positions': positions, 'rotations': rotations, 'scales': scales};
			};

			/**
			* parseTracks(XMLNode)
			*
			* @param		XMLDocument		XMLNode	: XML element <keyframe>
			*
			* @return		Object			{time: Float time, matrix: THREE.Matrix4 Object}
			**/
			function parseKeyframe(XMLNode){
				return {'time': attrFloat(XMLNode, 'time'), 'matrix': attrMatrix(XMLNode)};
			};

			//--------------------------------------------
			//Basic parsers
			/**
			* attrColorRGB(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element <XMLNode r="x" g="x" b="x">
			*
			* @return	THREE.Color		Color value of XMLNode
			**/
			function attrColorRGB(XMLNode){
				return new THREE.Color(
					attrFloat(XMLNode, 'r'),
					attrFloat(XMLNode, 'g'),
					attrFloat(XMLNode, 'b')
				);
			};

			/**
			* attrMatrix(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element who contain <position>, <rotation> and <scale>
			*
			* @return	THREE.Matrix4	THREE.Matrix4 from XMLNode
			**/
			function attrMatrix(XMLNode){
				var matrix	= new THREE.Matrix4(),
					pos		= new THREE.Vector3(),
					scl		= new THREE.Vector3(1, 1, 1),
					rot		= new THREE.Quaternion(),
					node	= XMLNode.getElementsByTagName('scale')[0];

				if(node){
					if(node.factor){
						scl.set(
							attrFloat(XMLNode, 'factor'),
							attrFloat(XMLNode, 'factor'),
							attrFloat(XMLNode, 'factor')
						);
					}
					else {
						scl.copy(attrVector3(node));
					}
				}

				pos.copy(attrVector3((XMLNode.getElementsByTagName('position')[0] || XMLNode.getElementsByTagName('translate')[0])));
				rot.copy(attrQuaternion((XMLNode.getElementsByTagName('rotation')[0] || XMLNode.getElementsByTagName('rotate')[0])));

				return matrix.compose(pos, rot, scl);
			};

			/**
			* attrQuaternion(XMLNode)
			*
			* @param	XMLDocument			XMLNode		: XML element where we search for Quaternion
			*
			* @return	THREE.Quaternion	Quaternion value of XMLNode
			**/
			function attrQuaternion(XMLNode){
				// ! @need confirmation for angleX
				var quaternion = new THREE.Quaternion();

				if(!XMLNode){
					return quaternion
				}

				if(XMLNode.getAttribute('angle')){
					var angle	= attrFloat(XMLNode, 'angle'),
						axis;

					if(XMLNode.getAttribute('axisX')){
						axis = new THREE.Vector3(attrFloat(XMLNode, 'axisX'), attrFloat(XMLNode, 'axisY'), attrFloat(XMLNode, 'axisZ'));
					}
					else {
						axis = attrVector3(XMLNode.getElementsByTagName('axis')[0]);
					}

					quaternion.setFromAxisAngle(axis, angle);
				}
				else if(XMLNode.getAttribute('qx')){
					quaternion.x = attrFloat(XMLNode, 'qx');
					quaternion.y = attrFloat(XMLNode, 'qy');
					quaternion.z = attrFloat(XMLNode, 'qz');
					quaternion.w = attrFloat(XMLNode, 'qw');
				}
				else if(XMLNode.getAttribute('angleX')){
					var angleX			= attrFloat(XMLNode, 'axisX'),
						angleY			= attrFloat(XMLNode, 'axisY'),
						angleZ			= attrFloat(XMLNode, 'axisZ'),
						quaternionY	= new THREE.Quaternion(),
						quaternionZ	= new THREE.Quaternion();

					// Warning: There is no convention about the ordering of rotations!
					quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angleX);
					quaternionY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
					quaternionZ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleZ);

					quaternion.multiply(quaternionY);
					quaternion.multiply(quaternionZ);
				}

				return quaternion;
			};

			/**
			* attrVector3(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element <XMLNode x="x" y="x" z="x">
			*
			* @return	THREE.Vector3	Vector3 value of XMLNode
			**/
			function attrVector3(XMLNode){
				return new THREE.Vector3(
					attrFloat(XMLNode, 'x'),
					attrFloat(XMLNode, 'y'),
					attrFloat(XMLNode, 'z')
				);
			};

			/**
			* attrU(XMLNode)
			*
			* @param	XMLDocument		XMLNode		: XML element <XMLNode u="x">
			*
			* @return	float			U value of XMLNode
			**/
			function attrU(XMLNode){
				return attrFloat(XMLNode, 'u');
			};

			/**
			* attrUv(XMLNode)
			*
			* @param	XMLDocument		XMLNode	: XML element <XMLNode u="x" v="x">
			*
			* @return	THREE.Vector2	UV value of XMLNode
			**/
			function attrUv(XMLNode){
				return new THREE.Vector2(
					attrFloat(XMLNode, 'u'),
					attrFloat(XMLNode, 'v')
				);
			};

			/**
			* attrUvw(XMLNode)
			*
			* @param	XMLDocument		XMLNode	: XML element <XMLNode u="x" v="x" w="x">
			*
			* @return	THREE.Vector3	UVW value of XMLNode
			**/
			function attrUvw(XMLNode){
				return new THREE.Vector3(
					attrFloat(XMLNode, 'u'),
					attrFloat(XMLNode, 'v'),
					attrFloat(XMLNode, 'w')
				);
			};

			/**
			* attrBool(XMLNode, attr, defaultValue)
			*
			* @param	XMLDocument		XMLNode			: XML element where we search for attr
			* @param	string			attr			: Attribute name to search for
			* @param	boolean			defaultValue	: Default value to use if there's no attribute
			*
			* @return	boolean			attribute value or defaultValue
			**/
			function attrBool(XMLNode, attr, defaultValue){
				if(!XMLNode){
					return defaultValue || false;
				}
				else if(!XMLNode.getAttribute(attr)){
					return defaultValue || false;
				}

				return (XMLNode.getAttribute(attr).toLowerCase() == 'true');
			};

			/**
			* attrFloat(XMLNode, attr, defaultValue)
			*
			* @param	XMLDocument		XMLNode			: XML element where we search for attr
			* @param	string			attr			: Attribute name to search for
			* @param	float			defaultValue	: Default value to use if there's no attribute
			*
			* @return	float			attribute value or defaultValue
			**/
			function attrFloat(XMLNode, attr, defaultValue){
				if(!XMLNode){
					return defaultValue || 0.0;
				}
				else if(!XMLNode.getAttribute(attr)){
					return defaultValue || 0.0;
				}

				return parseFloat(XMLNode.getAttribute(attr));
			};

			/**
			* attrInt(XMLNode, attr, defaultValue)
			*
			* @param	XMLDocument		XMLNode			: XML element where we search for attr
			* @param	string			attr			: Attribute name to search for
			* @param	int			defaultValue	: Default value to use if there's no attribute
			*
			* @return	int			attribute value or defaultValue
			**/
			function attrInt(XMLNode, attr, defaultValue){
				if(!XMLNode){
					return defaultValue || 0;
				}
				else if(!XMLNode.getAttribute(attr)){
					return defaultValue || 0;
				}

				return parseInt(XMLNode.getAttribute(attr));
			};

			//geomMerge function edit for Submeshes
			/**
			* geomMerge(geometry, matrix, materialIndexOffset)
			* 
			* @param	THREE.Geometry	geometry			: THREE.Geometry to merge
			* @param	THREE.Matrix4	matrix				: Matrix used to position THREE.Geometry
			* @param	Int				materialIndexOffset	: Material index to apply on faces for THREE.MultiMaterial
			*
			* @return	null
			**/
			function geomMerge(geometry, matrix, materialIndexOffset){

				if(geometry instanceof THREE.Geometry === false){
					console.error( 'THREE.Geometry.merge(): geometry not an instance of THREE.Geometry.', geometry );
					return;
				}

				var normalMatrix,
					vertexOffset	= this.vertices.length,
					vertices1		= this.vertices,
					vertices2		= geometry.vertices,
					faces1			= this.faces,
					faces2			= geometry.faces,
					uvs1			= this.faceVertexUvs[ 0 ],
					uvs2			= geometry.faceVertexUvs[ 0 ],
					//added for OgreMaxLoader
					skinIndices1	= this.skinIndices,
					skinIndices2	= geometry.skinIndices,
					skinWeights1	= this.skinWeights,
					skinWeights2	= geometry.skinWeights;

				if(materialIndexOffset === undefined){
					materialIndexOffset = 0;
				}

				if(matrix !== undefined){
					normalMatrix = new THREE.Matrix3().getNormalMatrix( matrix );
				}

				// skinIndices && skinWeights
				for(var i = 0, il = vertices1.length; i < il; i++){
					if(!skinIndices1[i]){
						skinIndices1[i] = new THREE.Vector4();
					}

					if(!skinWeights1[i]){
						skinWeights1[i] = new THREE.Vector4();
					}
				}

				for(var i = 0, il = vertices2.length; i < il; i++){
					if(!skinIndices2[i]){
						skinIndices2[i] = new THREE.Vector4();
					}

					skinIndices1.push(skinIndices2[i]);
				}

				for(var i = 0, il = vertices2.length; i < il; i++){
					if(!skinWeights2[i]){
						skinWeights2[i] = new THREE.Vector4();
					}

					skinWeights1.push(skinWeights2[i]);
				}

				// vertices
				for(var i = 0, il = vertices2.length; i < il; i ++){
					var vertex		= vertices2[ i ],
						vertexCopy	= vertex.clone();

					if(matrix !== undefined){
						vertexCopy.applyMatrix4(matrix);
					}

					vertices1.push(vertexCopy);
				}

				// faces
				for(i = 0, il = faces2.length; i < il; i ++){
					var face				= faces2[ i ],
						faceVertexNormals	= face.vertexNormals,
						faceVertexColors	= face.vertexColors,
						faceCopy, normal, color;

					faceCopy = new THREE.Face3(face.a + vertexOffset, face.b + vertexOffset, face.c + vertexOffset);
					faceCopy.normal.copy(face.normal);

					if(normalMatrix !== undefined){
						faceCopy.normal.applyMatrix3(normalMatrix).normalize();
					}

					for(var j = 0, jl = faceVertexNormals.length; j < jl; j ++){
						normal = faceVertexNormals[j].clone();

						if(normalMatrix !== undefined){
							normal.applyMatrix3(normalMatrix).normalize();
						}

						faceCopy.vertexNormals.push(normal);
					}

					faceCopy.color.copy(face.color);

					for(var j = 0, jl = faceVertexColors.length; j < jl; j ++){
						color = faceVertexColors[j];
						faceCopy.vertexColors.push(color.clone());
					}

					faceCopy.materialIndex = face.materialIndex + materialIndexOffset;
					faces1.push(faceCopy);
				}

				// uvs
				for(i = 0, il = uvs2.length; i < il; i ++){
					var uv = uvs2[ i ], uvCopy = [];

					if(uv === undefined){
						continue;
					}

					for(var j = 0, jl = uv.length; j < jl; j ++){
						uvCopy.push( uv[ j ].clone() );
					}

					uvs1.push(uvCopy);
				}

				this.computeBoundingBox();
				this.computeBoundingSphere();
				this.computeFaceNormals();
			};
		}
	};


	//--------------------------------------------
	// THREE.DotMaterialLoader
	//--------------------------------------------
	THREE.DotMaterialLoader = function(manager){
		this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;
	}

	THREE.DotMaterialLoader.prototype = {
		constructor: THREE.DotMaterialLoader,

		get path(){
			if(this._path === undefined){
				this._path = '';
			}

			return this._path;
		},

		get statusDomElement(){
			if(this._statusDomElement === undefined){
				this._statusDomElement = document.createElement('div');
			}

			console.warn( 'THREE.DotMaterialLoader: .statusDomElement has been removed.' );
			return this._statusDomElement;
		},

		get texturePath(){
			if(this._texturePath === undefined){
				this._texturePath = '';
			}

			return this._texturePath;
		},

		get withCredentials(){
			if(this._withCredentials === undefined){
				this._withCredentials = false;
			}

			return this._withCredentials;
		},

		set path(value){
			if(typeof value !== 'string'){
				console.error("THREE.DotMaterialLoader.path: Muste be a String!");
				return -1;
			}

			this._path = value;
		},

		set texturePath(value){
			if(typeof value !== 'string'){
				console.error("THREE.DotMaterialLoader.texturePath: Muste be a String!");
				return -1;
			}

			this._texturePath = value;
		},

		set withCredentials(value){
			if(typeof value !== boolean){
				console.error("THREE.DotMaterialLoader.withCredentials: Muste be a boolean!");
				return -1;
			}

			this._withCredentials = value;
		},

		/**
		* THREE.DotMaterialLoader.load(url, onLoad, onProgress, onError)
		* 
		* @param	String		url		: Content of dotMaterial
		* @param	function	onLoad		: Function used on load complete
		* @param	function	onProgress	: Function used on progression
		* @param	function	onError		: Function used on error
		*
		* @return	Array	Array of THREE.MeshPhongMaterial
		**/
		load:	function(url, onLoad, onProgress, onError){
			var scope	= this,
				loader = new THREE.FileLoader(this.manager),
				file;

			onLoad		= onLoad		|| function(){};
			onProgress	= onProgress	|| function(){};
			onError		= onError		|| function(){};

			//if this.path is empty set it from URL 
			this.path	= (this.path !== '')? this.path : THREE.Loader.prototype.extractUrlBase(url);

			file		= url.split('/');
			file		= file[file.length - 1];
			this.url	= url;

			var texturePath = (this.texturePath !== '')? this.texturePath : this.path;

			loader.setWithCredentials(this.withCredentials);

			return loader.load(scope.url,
				function(response){	//function onLoad
					var materials	= scope.parse(response, texturePath);
					onLoad(materials);
				},
				onProgress,			//function onProgress
				onError				//function onError
			);
		},

		/**
		* THREE.DotMaterialLoader.parse(data, texturesPath)
		* 
		* @param	String	data			: Content of dotMaterial
		* @param	String	texturesPath	: Path where are stored textures
		*
		* @return	Array	Array of THREE.MeshPhongMaterial
		**/
		parse: function(data, texturePath){
			var params		= {},
				materials	= [],
				arr			= data.split('\n');

			params = parseMaterial(arr);

			for(key in params){
				var m = new THREE.MeshPhongMaterial();

				m.name			= key;
				m.needsUpdate	= true;
				m.transparent	= true;
				m.skinning		= true;
				m.morphTargets	= true;

				if(params[key].pass.texture_unit){
					var texLoader = new THREE.TextureLoader();

					texLoader.load(texturePath + params[key].pass.texture_unit[0].texture, function(texture){
						m.map = texture;
						m.map.flipY = false;
					});

					if(params[key].pass.texture_unit.length > 1){
						var emLoader = new THREE.TextureLoader();

						emLoader.load(texturePath + params[key].pass.texture_unit[1].texture, function(texture){
							m.emissiveMap = texture;
							m.emissiveMap.flipY = false;
						});
					}
				}

				if(params[key].pass.diffuse){
					var c = params[key].pass.diffuse;
					m.diffuse = new THREE.Color(c[0], c[1], c[2]);
				}

				if(params[key].pass.specular){
					var c = params[key].pass.specular;
					m.specular	= new THREE.Color(c[0], c[1], c[2]);
					m.shininess	= c[4];
				}

				if(params[key].pass.emissive || params[key].pass.ambient){
					var c = params[key].pass.emissive || params[key].pass.ambient;
					m.emissive = new THREE.Color(c[0], c[1], c[2]);
				}

				materials.push(m);
			}

			return materials;

			/**
			* parseMaterial(arr)
			* 
			* @param	Array	arr		: Array of Strings
			*
			* @return	object	Object of material parameters
			**/
			function parseMaterial(arr){
				var params	= {};

				for(var i = 0, il = arr.length; i < il; i++){
					var line	= arr[i].trim().split(/\s/),
						key		= line[0];

					if(key === 'material'){
						var data = parseTechnique(arr, i++);

						i				= data.index;
						params[line[1]]	= data.params;
					}
				}

				return params;
			};

			/**
			* parseTechnique(arr, index)
			* 
			* @param	Array	arr		: Array of Strings
			* @param	Int		index	: Current array index
			*
			* @return	object	{params, index}
			**/
			function parseTechnique(arr, index){
				var params	= {};

				for(var i = index, il = arr.length; i < il; i++){
					var line	= arr[i].trim().split(/\s/),
						key		= line[0];

					switch(key){
						case 'pass':
							var data = parsePass(arr, i++);

							i				= data.index;
							params['pass']	= data.params;
						break;

						case '}':
							return {params: params, index: i++};
						break;
					}
				}
			};

			/**
			* parsePass(arr, index)
			* 
			* @param	Array	arr		: Array of Strings
			* @param	Int		index	: Current array index
			*
			* @return	object	{params, index}
			**/
			function parsePass(arr, index){
				var params	= {};

				for(var i = index, il = arr.length; i < il; i++){
					var line	= arr[i].trim().split(/\s/),
						key		= line[0];

					switch(key){
						case 'ambient':
							var r	= parseFloat(line[1]),
								g	= parseFloat(line[2]),
								b	= parseFloat(line[3]),
								a	= parseFloat(line[4]);

							params[key] = [r, g, b, a];
						break;

						case 'diffuse':
							var r	= parseFloat(line[1]),
								g	= parseFloat(line[2]),
								b	= parseFloat(line[3]),
								a	= parseFloat(line[4]);

							params[key] = [r, g, b, a];
						break;

						case 'specular':
							var r	= parseFloat(line[1]),
								g	= parseFloat(line[2]),
								b	= parseFloat(line[3]),
								a	= parseFloat(line[4]);

							params[key] = [r, g, b, a];
						break;

						case 'emissive':
							var r	= parseFloat(line[1]),
								g	= parseFloat(line[2]),
								b	= parseFloat(line[3]),
								a	= parseFloat(line[4]);

							params[key] = [r, g, b, a];
						break;

						case 'scene_blend':
							params[key] = [line[1], line[2]];
						break;

						case 'texture_unit':
							if(!params[key]){
								params[key] = [];
							}

							var data = parseTextureUnit(arr, i++);

							i = data.index;
							params[key].push(data.params);
						break;

						case '}':
							index++;
							return {params: params, index: i++};
						break;
					}
				}
			};

			/**
			* parseTextureUnit(arr, index)
			* 
			* @param	Array	arr		: Array of Strings
			* @param	Int		index	: Current array index
			*
			* @return	object	{params, index}
			**/
			function parseTextureUnit(arr, index){
				var params	= {};

				for(var i = index, il = arr.length; i < il; i++){
					var line	= arr[i].trim().split(/\s/),
						key		= line[0];

					switch(key){
						case 'texture':
							params[key] = line[1];
						break;

						case 'colour_op_ex':
							params[key] = [line[1], line[2], line[3]];
						break;

						case 'colour_op_multipass_fallback':
							params[key] = [line[1], line[2]];
						break;

						case '}':
							index++;
							return {params: params, index: i++};
						break;
					}
				}
                        };
                }
        };

export const OgreMaxLoader = THREE.OgreMaxLoader;
export const DotMaterialLoader = THREE.DotMaterialLoader;
