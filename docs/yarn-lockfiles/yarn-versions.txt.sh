#!/usr/bin/env bash

# https://www.npmjs.com/package/@yarnpkg/cli?activeTab=versions

curl -sL https://registry.npmjs.org/@yarnpkg/cli |
jq -r '.versions | keys[]' |
sort --version-sort --reverse
