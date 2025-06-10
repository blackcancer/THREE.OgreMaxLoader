#!/usr/bin/env bash
# Simple script to install dependencies for THREE.OgreMaxLoader
set -e

# create package.json if not present
if [ ! -f package.json ]; then
  cat <<'JSON' > package.json
{
  "name": "three-ogremaxloader",
  "private": true,
  "type": "module",
  "dependencies": {
    "three": "^0.177.0"
  }
}
JSON
fi

npm install
