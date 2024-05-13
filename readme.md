# yarn-tar2zip

[Yarn v2+ lockfile, how the validate new checksum](https://stackoverflow.com/questions/73709178/yarn-v2-lockfile-how-the-validate-new-checksum)

> in yarn v2+ lockfiles these checksums changed, and I cannot find any documentation on what this new checksum is

yarn converts the tar archive to a zip archive in [tgzUtils.ts](https://github.com/yarnpkg/berry/raw/master/packages/yarnpkg-core/sources/tgzUtils.ts) in `function convertToZipWorker`

i have extracted that code to [yarn-tar2zip](yarn-tar2zip.js)

```
git clone https://github.com/milahu/yarn-tar2zip
cd yarn-tar2zip
wget https://registry.yarnpkg.com/accepts/-/accepts-1.1.4.tgz
node yarn-tar2zip.js accepts-1.1.4.tgz accepts-1.1.4.zip 0 node_modules/accepts 1
sha512sum accepts-1.1.4.zip
# a62b5b81daa74afb...
```

different compression levels gives different hashes

```
$ for level in {0..9} mixed; do node yarn-tar2zip.js accepts-1.1.4.tgz accepts-1.1.4.zip $level node_modules/accepts 1 && echo $(sha512sum accepts-1.1.4.zip | cut -c1-16)... level $level; done 
a62b5b81daa74afb... level 0
dba06b0f2d426735... level 1
c52062c80ff68626... level 2
58bf79c58e60a184... level 3
d5d0cb2d0d444819... level 4
d8de36e109b1587c... level 5
d8de36e109b1587c... level 6
d85c1e68f82bee85... level 7
b61ac8a8d20dc121... level 8
2696a270c0fb2eda... level 9
2696a270c0fb2eda... level mixed
```

but i could not reproduce the `0c9d4ae055460b30...` checksum  
probably that was produced by an older yarn version

[accepts-1.1.4.tgz](https://registry.yarnpkg.com/accepts/-/accepts-1.1.4.tgz)

```
d71c96f7d41d0fed... yarnv1 resolved = sha1-base16
8EKM6XlFgqSpDcxk... yarnv1 integrity = sha512-base64
0c9d4ae055460b30... yarnv2 checksum = ???
```

yarnv2 checksum is no conventional hash (that would be too simple...)

some conventional hashes with 128 base16 chars, via `rhash --all --bsd`

```
c885a326ae0e9537... blake2b
7b9d86ad1662d28a... edon-r512
1b8a2658c0cee955... gost12-512
65d74927d41ea681... sha3-512
f0428ce9794582a4... sha512
97d47fcb3647a3f6... whirlpool
```

yarn.lock created by yarn 4.1.1

```
__metadata:
  version: 8
  cacheKey: 10c0

"accepts@npm:1.1.4":
  version: 1.1.4
  resolution: "accepts@npm:1.1.4"
  dependencies:
    mime-types: "npm:~2.0.4"
    negotiator: "npm:0.4.9"
  checksum: 10c0/a62b5b81daa74afb60295e616982b35e2bd183aaf263a35e235f3736058c37d6f5f6b9ce435e46099e4105ecdbe205b120a3b771afd11f3d2747a9522a14e130
  languageName: node
  linkType: hard
```

the `10c0/` prefix means: cache version 10, compression 0
