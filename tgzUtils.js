import { nodeUtils}                                              from '@yarnpkg/core';
import { PortablePath, NodeFS, ppath, xfs, npath, constants, statUtils} from '@yarnpkg/fslib';
import { ZipFS}                                                 from '@yarnpkg/libzip';
import {PassThrough,}                                                 from 'stream';
import tar                                                                     from 'tar';

import {AsyncPool, WorkerPool}                                       from './TaskPool';
import * as miscUtils                                                          from './miscUtils';
import {getContent as getZipWorkerSource}                                      from './worker-zip';

 








function createTaskPool(poolMode, poolSize) {
  switch (poolMode) {
    case `async`:
      return new AsyncPool(convertToZipWorker, {poolSize});

    case `workers`:
      return new WorkerPool(getZipWorkerSource(), {poolSize});

    default: {
      throw new Error(`Assertion failed: Unknown value ${poolMode} for taskPoolMode`);
    }
  }
}

let defaultWorkerPool;

export function getDefaultTaskPool() {
  if (typeof defaultWorkerPool === `undefined`)
    defaultWorkerPool = createTaskPool(`workers`, nodeUtils.availableParallelism());

  return defaultWorkerPool;
}

const workerPools = new WeakMap();

export function getTaskPoolForConfiguration(configuration) {
  if (typeof configuration === `undefined`)
    return getDefaultTaskPool();

  return miscUtils.getFactoryWithDefault(workerPools, configuration, () => {
    const poolMode = configuration.get(`taskPoolMode`);
    const poolSize = configuration.get(`taskPoolConcurrency`);

    switch (poolMode) {
      case `async`:
        return new AsyncPool(convertToZipWorker, {poolSize});

      case `workers`:
        return new WorkerPool(getZipWorkerSource(), {poolSize});

      default: {
        throw new Error(`Assertion failed: Unknown value ${poolMode} for taskPoolMode`);
      }
    }
  });
}

export async function convertToZipWorker(data) {
  const {tmpFile, tgz, compressionLevel, extractBufferOpts} = data;

  const zipFs = new ZipFS(tmpFile, {create: true, level: compressionLevel, stats: statUtils.makeDefaultStats()});

  // Buffers sent through Node are turned into regular Uint8Arrays
  const tgzBuffer = Buffer.from(tgz.buffer, tgz.byteOffset, tgz.byteLength);
  await extractArchiveTo(tgzBuffer, zipFs, extractBufferOpts);

  zipFs.saveAndClose();

  return tmpFile;
}








export async function makeArchiveFromDirectory(source, {baseFs = new NodeFS(), prefixPath = PortablePath.root, compressionLevel, inMemory = false} = {}) {
  let zipFs;
  if (inMemory) {
    zipFs = new ZipFS(null, {level: compressionLevel});
  } else {
    const tmpFolder = await xfs.mktempPromise();
    const tmpFile = ppath.join(tmpFolder, `archive.zip`);

    zipFs = new ZipFS(tmpFile, {create: true, level: compressionLevel});
  }

  const target = ppath.resolve(PortablePath.root, prefixPath);
  await zipFs.copyPromise(target, source, {baseFs, stableTime: true, stableSort: true});

  return zipFs;
}












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

async function * parseTar(tgz) {
  // @ts-expect-error - Types are wrong about what this function returns
  const parser = new tar.Parse();

  const passthrough = new PassThrough({objectMode: true, autoDestroy: true, emitClose: true});

  parser.on(`entry`, (entry) => {
    passthrough.write(entry);
  });

  parser.on(`error`, error => {
    passthrough.destroy(error);
  });

  parser.on(`close`, () => {
    if (!passthrough.destroyed) {
      passthrough.end();
    }
  });

  parser.end(tgz);

  for await (const entry of passthrough) {
    const it = entry ;
    yield it;
    it.resume();
  }
}

export async function extractArchiveTo(tgz, targetFs, {stripComponents = 0, prefixPath = PortablePath.dot} = {}) {
  function ignore(entry) {
    // Disallow absolute paths; might be malicious (ex: /etc/passwd)
    if (entry.path[0] === `/`)
      return true;

    const parts = entry.path.split(/\//g);

    // We also ignore paths that could lead to escaping outside the archive
    if (parts.some((part) => part === `..`))
      return true;

    if (parts.length <= stripComponents)
      return true;

    return false;
  }

  for await (const entry of parseTar(tgz)) {
    if (ignore(entry))
      continue;

    const parts = ppath.normalize(npath.toPortablePath(entry.path)).replace(/\/$/, ``).split(/\//g);
    if (parts.length <= stripComponents)
      continue;

    const slicePath = parts.slice(stripComponents).join(`/`) ;
    const mappedPath = ppath.join(prefixPath, slicePath);

    let mode = 0o644;

    // If a single executable bit is set, normalize so that all are
    if (entry.type === `Directory` || ((entry.mode ?? 0) & 0o111) !== 0)
      mode |= 0o111;

    switch (entry.type) {
      case `Directory`: {
        targetFs.mkdirpSync(ppath.dirname(mappedPath), {chmod: 0o755, utimes: [constants.SAFE_TIME, constants.SAFE_TIME]});

        targetFs.mkdirSync(mappedPath, {mode});
        targetFs.utimesSync(mappedPath, constants.SAFE_TIME, constants.SAFE_TIME);
      } break;

      case `OldFile`:
      case `File`: {
        targetFs.mkdirpSync(ppath.dirname(mappedPath), {chmod: 0o755, utimes: [constants.SAFE_TIME, constants.SAFE_TIME]});

        targetFs.writeFileSync(mappedPath, await miscUtils.bufferStream(entry ), {mode});
        targetFs.utimesSync(mappedPath, constants.SAFE_TIME, constants.SAFE_TIME);
      } break;

      case `SymbolicLink`: {
        targetFs.mkdirpSync(ppath.dirname(mappedPath), {chmod: 0o755, utimes: [constants.SAFE_TIME, constants.SAFE_TIME]});

        targetFs.symlinkSync((entry ).linkpath, mappedPath);
        targetFs.lutimesSync(mappedPath, constants.SAFE_TIME, constants.SAFE_TIME);
      } break;
    }
  }

  return targetFs;
}
