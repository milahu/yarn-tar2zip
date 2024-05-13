// berry/packages/yarnpkg-core/sources/tgzUtils.ts

// pnpm i @yarnpkg/fslib @yarnpkg/libzip

/*
called from
$ grep -r -w "return await tgzUtils.convertToZip" berry/packages/ | grep -v test
berry/packages/plugin-http/sources/TarballHttpFetcher.ts:    return await tgzUtils.convertToZip(sourceBuffer, {
berry/packages/plugin-file/sources/TarballFileFetcher.ts:    return await tgzUtils.convertToZip(sourceBuffer, {
berry/packages/plugin-github/sources/GithubFetcher.ts:      return await tgzUtils.convertToZip(packedBuffer, {
berry/packages/plugin-git/sources/GitFetcher.ts:      return await tgzUtils.convertToZip(sourceBuffer, {
berry/packages/plugin-npm/sources/NpmHttpFetcher.ts:    return await tgzUtils.convertToZip(sourceBuffer, {
berry/packages/plugin-npm/sources/NpmSemverFetcher.ts:    return await tgzUtils.convertToZip(sourceBuffer, {
*/

import { ppath, xfs,} from '@yarnpkg/fslib';
import { ZipFS}                                                 from '@yarnpkg/libzip';












export async function convertToZip(tgz, opts = {}) {
  const tmpFolder = await xfs.mktempPromise();
  const tmpFile = ppath.join(tmpFolder, `archive.zip`);

  const compressionLevel = opts.compressionLevel
    ?? opts.configuration?.get(`compressionLevel`)
    ?? `mixed`;

  const extractBufferOpts = {
    prefixPath: opts.prefixPath,
    stripComponents: opts.stripComponents,
  };

  const taskPool = opts.taskPool ?? getTaskPoolForConfiguration(opts.configuration);
  await taskPool.run({tmpFile, tgz, compressionLevel, extractBufferOpts});

  return new ZipFS(tmpFile, {level: opts.compressionLevel});
}


async function main() {
  const dst = process.argv[2];
  console.log("dst", dst);
}

main();
