#!/usr/bin/env bash

declare -A versions_of_checksum

for lockfile in yarn.lock.*; do
  #yarnVersion=${lockfile:10}
  majorVersion=$(grep -m1 -A2 "^__metadata:" $lockfile | grep -m1 version | cut -d' ' -f4)
  cacheKey=$(grep -m1 -A2 "^__metadata:" $lockfile | grep -m1 cacheKey | cut -d' ' -f4)
  version="$majorVersion.$cacheKey"
  checksum=$(grep -m1 "^  checksum: " $lockfile | cut -d' ' -f4)
  checksum=${checksum#*/} # remove the cacheKey prefix, for example "10c0/" for compression=0
  versions_of_checksum[$checksum]+=" $version"
done

# sort by yarn version in checksum-by-yarn-version.txt
#for checksum in "${!versions_of_checksum[@]}"; do
for checksum in $(cat checksum-by-yarn-version.txt | cut -d' ' -f1); do
  versions="${versions_of_checksum[$checksum]}"
  versions=$(printf "%s\n" $versions | sort --unique | xargs echo)
  #echo "$versions $checksum"
  echo "$checksum $versions"
done
# |
#sort --version-sort --reverse |
#sed -E 's/(.+) ([^ ]+)$/\2 \1/'
