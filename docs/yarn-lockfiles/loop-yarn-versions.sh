#!/usr/bin/env bash

set -e
set -u

#corepack enable
# ... this will symlink corepack/dist/yarn.js to $PATH/yarn
# readlink -f $(which corepack)
# /nix/store/nx76dx71yjni4bajdn9pshxqs38lkj29-nodejs-22.0.0/lib/node_modules/corepack/dist/corepack.js
# ln -s /nix/store/nx76dx71yjni4bajdn9pshxqs38lkj29-nodejs-22.0.0/lib/node_modules/corepack/dist/yarn.js /home/user/.local/share/pnpm/yarn

while read yarn_version; do
  if echo "$yarn_version" | grep -q -E -- '-rc\.[0-9]+$'; then
    # ignore release candidates
    #echo "ignoring yarn version $yarn_version"
    continue
  fi
  out=yarn.lock.$yarn_version
  if [ -e $out ] && [ $(stat -c%s $out) = 0 ]; then
    # remove empty file
    echo "removing empty $out"
    rm $out
  fi
  if [ -e $out ]; then
    echo "keeping $out"
    continue
  fi
  #rm .yarnrc.yml # fix: Internal Error: ENOENT: no such file or directory
  yarn set version $yarn_version
  touch yarn.lock # fix: Usage Error: The nearest package directory (a) doesn't seem to be part of the project declared in y.
  # install to node_modules/ not .yarn/
  if ! grep -q "^nodeLinker: node-modules" .yarnrc.yml; then
    echo "nodeLinker: node-modules" >> .yarnrc.yml
  fi
  # https://github.com/parro-it/awesome-micro-npm-packages
  yarn add is-sorted
  mv yarn.lock $out
  echo done $out
done < yarn-versions.txt
