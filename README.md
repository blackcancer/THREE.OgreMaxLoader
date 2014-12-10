three.XMLOgreLoader
==========

Description: An Ogre XML loader for THREE.js.  
License: [Creative Common](http://creativecommons.org/licenses/by/3.0/legalcode)  
Version: 0.1-rev00004  
Date: 2014-12-09  

By Blackcancer  
website: http://initsysrev.net  
support: blackcancer@initsysrev.net

### ==> CHANGELOG <==
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
Put XMLOgreLoader.js in your script's folder.  
Load the script with
`<script type="text/javascript" src="Path_of_the_scipt/XMLOgreLoader.js"></script>`

### ==> Usage <==
`var modLoader = new THREE.XMLOgreLoader();`  
Create a new instance of XMLOgreLoader to load *.scene, *.mesh, *.skeleton files.  

`modLoader.load(url, callback, texturePath);`  
This function load asynchronously.  
-	url: path of the xml file  
-	callback: callback function used at the end of this function  
-	texturePath: if diffrent of the url base, this path is used to load   texture.

`modLoader.loadSync(url, callback, texturePath);`  
This function load synchronously.  
-	url: path of the xml file  
-	callback: callback function used at the end of this function  
-	texturePath: if diffrent of the url base, this path is used to load texture.  
  
  
`var matLoader = new THREE.MaterialLoader();`  
Create a new instance of MaterialLoader to load *.material.  

`matLoader.load(url, callback, texturePath);`  
This function load asynchronously.  
-	url: path of the xml file  
-	callback: callback function used at the end of this function  
-	texturePath: if diffrent of the url base, this path is used to load   texture.

`matLoader.loadSync(url, callback, texturePath);`  
This function load synchronously.  
-	url: path of the xml file  
-	callback: callback function used at the end of this function  
-	texturePath: if diffrent of the url base, this path is used to load texture.  