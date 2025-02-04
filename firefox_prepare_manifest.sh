#!/bin/bash

version=$( cat package.json | jq '.custom.firefox.version' | tr -d '"')

jq '.version = $newVersion' --arg newVersion $version ./projects/firefox/public/manifest.json > ./projects/firefox/public/tmp.manifest.json && mv ./projects/firefox/public/tmp.manifest.json ./projects/firefox/public/manifest.json

echo $version