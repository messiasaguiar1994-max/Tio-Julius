#!/bin/sh
npx --yes esbuild src/jogo.js --bundle --minify --format=iife --outfile=public/jogo.bundle.js \
  --alias:three=./node_modules/three/build/three.module.js \
  --alias:three/addons=./node_modules/three/examples/jsm
