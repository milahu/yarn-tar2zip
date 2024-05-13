//import { nodeUtils}                                              from '@yarnpkg/core';
import { PortablePath, NodeFS, ppath, xfs, npath, constants, statUtils} from '@yarnpkg/fslib';
import { ZipFS}                                                 from '@yarnpkg/libzip';
import {PassThrough,}                                                 from 'stream';
//import tar                                                                     from 'tar';
import * as tar                                                                     from 'tar';
import fs from 'fs';

//import {AsyncPool, WorkerPool}                                       from './TaskPool';
//import * as miscUtils                                                          from './miscUtils.js';
//import {getContent as getZipWorkerSource}                                      from './worker-zip';





//console.log("tar", tar);




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
  //const tgzBuffer = Buffer.from(tgz.buffer, tgz.byteOffset, tgz.byteLength);
  const tgzBuffer = 

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

// https://betterprogramming.pub/a-memory-friendly-way-of-reading-files-in-node-js-a45ad0cc7bb6
function readBytes(fd, sharedBuffer) {
    return new Promise((resolve, reject) => {
        fs.read(
            fd, 
            sharedBuffer,
            0,
            sharedBuffer.length,
            null,
            (err) => {
                if(err) { return reject(err); }
                resolve();
            }
        );
    });
}

// https://betterprogramming.pub/a-memory-friendly-way-of-reading-files-in-node-js-a45ad0cc7bb6
async function* generateChunks(filePath, size) {
    const sharedBuffer = Buffer.alloc(size);
    const stats = fs.statSync(filePath); // file details
    const fd = fs.openSync(filePath); // file descriptor
    let bytesRead = 0; // how many bytes were read
    let end = size;

    for(let i = 0; i < Math.ceil(stats.size / size); i++) {
        await readBytes(fd, sharedBuffer);
        bytesRead = (i + 1) * size;
        if(bytesRead > stats.size) {
           // When we reach the end of file,
           // we have to calculate how many bytes were actually read
           end = size - (bytesRead - stats.size);
        }
        yield sharedBuffer.slice(0, end);
    }
}

//async function * parseTar(tgz) {
async function * parseTar(tgzPath) {
  // @ts-expect-error - Types are wrong about what this function returns
  const parser = new tar.Parser();

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

  const CHUNK_SIZE = 10000000; // 10MB

  //parser.end(tgz);
  for await(const chunk of generateChunks(tgzPath, CHUNK_SIZE)) {
    parser.write(chunk);
  }
  parser.end();

  for await (const entry of passthrough) {
    const it = entry ;
    yield it;
    it.resume();
  }
}


// berry/packages/yarnpkg-core/sources/miscUtils.ts
// Converts a Node stream into a Buffer instance
export async function bufferStream(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];

    stream.on(`error`, error => {
      reject(error);
    });

    stream.on(`data`, chunk => {
      chunks.push(chunk);
    });

    stream.on(`end`, () => {
      resolve(Buffer.concat(chunks));
    });
  });
}



//export async function extractArchiveTo(tgz, targetFs, {stripComponents = 0, prefixPath = PortablePath.dot} = {}) {
export async function extractArchiveTo(tgzPath, targetFs, {stripComponents = 0, prefixPath = PortablePath.dot} = {}) {
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

  //for await (const entry of parseTar(tgz)) {
  for await (const entry of parseTar(tgzPath)) {
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

        //targetFs.writeFileSync(mappedPath, await miscUtils.bufferStream(entry ), {mode});
        targetFs.writeFileSync(mappedPath, await bufferStream(entry ), {mode});
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

async function main() {
  //const data = {tmpFile, tgz, compressionLevel, extractBufferOpts};
  //convertToZipWorker(data);

  if (process.argv.length < 4) {
    console.error(`error: missing args`);
    return;
  }

  const tgzPath = process.argv[2];
  console.log(`reading ${tgzPath}`);

  //const tmpFile = "/run/user/1000/tgzUtils.js.archive.zip";
  const tmpFile = process.argv[3];
  console.log(`writing ${tmpFile}`);

  const compressionLevel = 0;

  const zipFs = new ZipFS(tmpFile, {create: true, level: compressionLevel, stats: statUtils.makeDefaultStats()});

  /*
  // Buffers sent through Node are turned into regular Uint8Arrays
  const tgzBuffer = Buffer.from(tgz.buffer, tgz.byteOffset, tgz.byteLength);
  await extractArchiveTo(tgzBuffer, zipFs, extractBufferOpts);
  */

  const extractBufferOpts = {
    prefixPath: process.argv[4],
    stripComponents: parseInt(process.argv[5] || 0),
  };

  await extractArchiveTo(tgzPath, zipFs, extractBufferOpts);

  zipFs.saveAndClose();
}

main();
