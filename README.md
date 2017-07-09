THREE.OgreMaxLoader  
==========  
  
Description: A OgreMax loader for THREE.js.  
License: [Creative Common](http://creativecommons.org/licenses/by/3.0/legalcode)  
Version: 0.2-rev00001  
Date: 2014-12-09  
  
By Blackcancer  
website: [http://initsysrev.net](http://initsysrev.net)  
support: [blackcancer@initsysrev.net](mailto:blackcancer@initsysrev.net)  
  
### ==> CHANGELOG <==  
0.2-rev00001:  
-	Rename of XMLOgreLoader to OgreMaxLoader to match with xml origine  
-	Rename of MaterialLoader to DotMaterialLoader to match with xml origine  
-	Complete rewrite of OgreMaxLoader to match with THREE.js Loaders  
-	Add of a minified version of OgreMaxLoader  
-	Add of a exemple of use of OgreMaxLoader  
-	Add DTD of dotscene, dotmesh and dotskeleton  
-	Add of skeleton  
-	Add of animations  
-	Add support of mobile (tested only on android but should work on ios too)  
-	Migrate materials to THREE.MeshPhongMaterial  
-	Remove old THREE.MeshPhongGlowMaterial (due to error on shader compilation)  
-	Remove old sync functions  
  
0.1-rev00004:  
-	Remove old StarOS dependence  
-	Add THREE.MeshPhongGlowMaterial for compatibility reason  
-	Encapsulate functions  
  
0.1-rev00001:  
-	basic support of XML Ogre modele.  
-	support *.scene, *.mesh, *.skeleton, *.material.  
-	basic bones support.  
-	animations WIP  
  
  
### ==> Installation <==
Install Three.js.  
Put OgreMaxLoader.js in your script's folder (or OgreMaxLoader.min.js).  
Load the script with  
`<script type="text/javascript" src="Path_of_the_scipt/OgreMaxLoader.js"></script>`  
  
  
### ==> Usage <==
`var modLoader = new THREE.OgreMaxLoader(<THREE.LoadingManager manager>);`  
Create a new instance of XMLOgreLoader to load *.scene, *.mesh, *.skeleton files.  
Manager arg is optional.  
  
`modLoader.texturePath = "Alternative_texture_path"`  
Is used to set a different path to load texture (not the material)  
  
`modLoader.load(url, onLoad, onProgress, onError);`  
This function load file at url.  
-	url: path of the xml file  
-	onLoad: callback function used when file is loaded and parsed  
-	onProgress: this function is called when a sub file is loaded (not yet implemented)  
-	onError: this function is called when errors happened (not yet implemented)  
  
  
`var matLoader = new THREE.DotMaterialLoader(<THREE.LoadingManager manager>);`  
Create a new instance of DotMaterialLoader to load *.material.  
Manager arg is optional.  
  
`matLoader.texturePath = "Alternative_texture_path"`  
Is used to set a different path to load texture  
  
`matLoader.load(url, onLoad, onProgress, onError);`  
This function load file at url.  
-	url: path of the xml file  
-	onLoad: callback function used when file is loaded and parsed  
-	onProgress: this function is called when a sub file is loaded (not yet implemented)  
-	onError: this function is called when errors happened (not yet implemented)  
  
  
### ==> TODO <==  
-	Force DTD validation  
-	Implement error and progress functions  
-	Rework DotMaterialLoader for a better support of dotmaterial files  