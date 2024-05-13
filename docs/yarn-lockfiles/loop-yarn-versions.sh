#!/usr/bin/env bash

set -e
set -u

#corepack enable
# ... this will symlink corepack/dist/yarn.js to $PATH/yarn
# readlink -f $(which corepack)
# /nix/store/nx76dx71yjni4bajdn9pshxqs38lkj29-nodejs-22.0.0/lib/node_modules/corepack/dist/corepack.js
# ln -s /nix/store/nx76dx71yjni4bajdn9pshxqs38lkj29-nodejs-22.0.0/lib/node_modules/corepack/dist/yarn.js /home/user/.local/share/pnpm/yarn

# disable .yarnrc.yml files in parent dirs
# TODO tell yarn to stop looking in parent dirs
d="$PWD"
version=$(date --utc +%Y%m%dT%H%M%S.%NZ)
while [ "$PWD" != "/" ]; do
  cd ..
  [ -e .yarnrc.yml ] || continue
  echo "moving $PWD/.yarnrc.yml to .yarnrc.yml.$version"
  mv .yarnrc.yml .yarnrc.yml.$version
done
cd "$d"

while read yarn_version; do
  if echo "$yarn_version" | grep -q -E -- '-rc\.[0-9]+$'; then
    # ignore release candidates
    #echo "ignoring yarn version $yarn_version"
    continue
  fi
  out=yarn.lock.$yarn_version
if false; then
  if [ -e $out ] && [ $(stat -c%s $out) = 0 ]; then
    # remove empty file
    echo "removing empty $out"
    rm $out
  fi
  if [ -e $out ]; then
    echo "keeping $out"
    continue
  fi
fi
  #rm .yarnrc.yml # fix: Internal Error: ENOENT: no such file or directory
  yarn set version $yarn_version
  sed -i -E 's|"packageManager": "[^"]+"|"packageManager": "yarn@'$yarn_version'"|' package.json
  #yarn_exe=./.yarn/releases/yarn-$yarn_version.cjs
  yarn_exe=yarn
  if [ "$(yarn --version)" != "$yarn_version" ]; then
  #if [ "$($yarn_exe --version)" != "$yarn_version" ]; then
  #if ! [ -e $yarn_exe ]; then
    echo "error: failed to set yarn version $yarn_version"
    continue
  fi
  touch yarn.lock # fix: Usage Error: The nearest package directory (a) doesn't seem to be part of the project declared in y.
  # install to node_modules/ not .yarn/
  if ! grep -q "^nodeLinker: node-modules" .yarnrc.yml; then
    echo "nodeLinker: node-modules" >> .yarnrc.yml
  fi
  # https://github.com/parro-it/awesome-micro-npm-packages
  #$yarn_exe add is-sorted
  $yarn_exe install
  mv yarn.lock $out
  echo done $out
#done < relevant-yarn-versions.txt
done < yarn-versions.txt
