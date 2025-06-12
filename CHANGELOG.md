# Changelog

*All notable changes to ******OgreMaxLoader****** are documented in this file.*

This project follows **[Semantic Versioning](https://semver.org)** and the
**[Keep a Changelog](https://keepachangelog.com)** format.

---

## \[2.0.0] – 2025‑06‑11

### Added

* Complete rewrite in **ES2023** module syntax.
* Replaced deprecated `THREE.Geometry` with **`BufferGeometry`** and typed attributes (`position`, `normal`, `uv`, `skinIndex`, `skinWeight`).
* Robust error handling via custom `OgreMaxError` class (`E_IO`, `E_XML`, `E_FORMAT`, `E_RUNTIME`).
* Internal caches converted to `Map` / `WeakMap` for safer key management.
* Promise‑based `load()` API while preserving callback compatibility.

### Changed

* Public class renamed from `XMLOgreLoader` to **`OgreMaxLoader`**.
* Removed legacy synchronous methods `loadSync()`; use `await loader.load()` instead.
* Progress callback now receives `(loaded, total)` byte values (aligns with Three.js `FileLoader`).
* Quaternion parsing now supports **axis‑angle**, **explicit quaternion**, and **Euler fallback** representations.

### Fixed

* Incorrect material assignment when `submeshname` indices were sparse.
* Up‑axis conversion now correctly handles `x` and `z` cases.
* Several edge‑cases where missing XML nodes produced `TypeError` rather than clean fallback.

---

## \[1.0.0] – 2018‑04‑15

> *Maintenance release preparing the ground for BufferGeometry.*

### Added

* Support for Three.js r100+ loader utilities (`LoaderUtils.extractUrlBase`).
* Basic caching layer to avoid re‑parsing identical meshes.

### Changed

* Internal manager switched from events (`onStart`…) to callbacks matching latest Three.js pattern.

### Fixed

* Skeleton root bone offset when `boneparent` order differed from `<bone id>`. 

---

## \[0.1.0‑rev00001] – 2014‑12‑09

### Added

* Initial public release by **Blackcancer**.
* Basic support for Ogre XML models.
* Handled file types: `.scene`, `.mesh`, `.skeleton`, `.material`.
* Basic bone hierarchy support.
* *Animations: work in progress.*

---

## Unreleased

* None yet.

---

© 2014‑2025 – Original author Blackcancer · Modern rewrite [you@example.com](mailto:you@example.com)
Licensed under **Creative Commons BY 3.0**.
