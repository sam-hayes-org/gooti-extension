#!/bin/bash

version=$( cat package.json | jq '.custom.chrome.version' | tr -d '"')

jq '.version = $newVersion' --arg newVersion $version ./projects/chrome/public/manifest.json > ./projects/chrome/public/tmp.manifest.json && mv ./projects/chrome/public/tmp.manifest.json ./projects/chrome/public/manifest.json

echo $version