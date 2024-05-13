#!/usr/bin/env bash

declare -A versions_of_checksum

while read checksum version; do
  checksum=${checksum#*/} # remove the cacheKey prefix, for example "10c0/" for compression=0
  versions_of_checksum[$checksum]+=" $version"
done < <(
  grep -H checksum yarn.lock.* | sort --version-sort --reverse | sed -E 's/^yarn.lock.([^ ]+):  checksum: (.+)$/\2 \1/'
)

# sort by version
for checksum in "${!versions_of_checksum[@]}"; do
  versions="${versions_of_checksum[$checksum]}"
  echo "$versions $checksum"
done |
sort --version-sort --reverse |
sed -E 's/(.+) ([^ ]+)$/\2\1/'
