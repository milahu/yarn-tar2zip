import { PortablePath, ppath, npath, constants, statUtils} from '@yarnpkg/fslib';
import { ZipFS } from '@yarnpkg/libzip';
import { PassThrough } from 'stream';
import * as tar from 'tar';
import fs from 'fs';

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
  if (process.argv.length < 4) {
    console.error(`error: missing args`);
    console.error(`usage: node yarn-tar2zip.js tgzPath zipPath [compressionLevel prefixPath stripComponents]`);
    console.error(`example: node yarn-tar2zip.js hello-1.2.3.tgz hello-1.2.3.zip 0 node_modules/hello 1`);
    return;
  }

  const tgzPath = process.argv[2];

  const zipPath = process.argv[3];

  const compressionLevel = (process.argv[4] == "mixed") ? null : parseInt(process.argv[4] || 0);

  const zipFs = new ZipFS(zipPath, {create: true, level: compressionLevel, stats: statUtils.makeDefaultStats()});

  const extractBufferOpts = {
    prefixPath: process.argv[5],
    stripComponents: parseInt(process.argv[6] || 0),
  };

  await extractArchiveTo(tgzPath, zipFs, extractBufferOpts);

  zipFs.saveAndClose();
}

main();
