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

import {FakeFS, PortablePath, NodeFS, ppath, xfs, npath, constants, statUtils} from '@yarnpkg/fslib';
import {ZipCompression, ZipFS}                                                 from '@yarnpkg/libzip';

export interface ExtractBufferOptions {
  prefixPath?: PortablePath;
  stripComponents?: number;
}

export interface ConvertToZipOptions extends ExtractBufferOptions {
  configuration?: Configuration;
  compressionLevel?: ZipCompression;
  taskPool?: ZipWorkerPool;
}

export async function convertToZip(tgz: Buffer, opts: ConvertToZipOptions = {}) {
  const tmpFolder = await xfs.mktempPromise();
  const tmpFile = ppath.join(tmpFolder, `archive.zip`);

  const compressionLevel = opts.compressionLevel
    ?? opts.configuration?.get(`compressionLevel`)
    ?? `mixed`;

  const extractBufferOpts: ExtractBufferOptions = {
    prefixPath: opts.prefixPath,
    stripComponents: opts.stripComponents,
  };

  const taskPool = opts.taskPool ?? getTaskPoolForConfiguration(opts.configuration);
  await taskPool.run({tmpFile, tgz, compressionLevel, extractBufferOpts});

  return new ZipFS(tmpFile, {level: opts.compressionLevel});
}

