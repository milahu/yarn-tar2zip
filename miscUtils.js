import { npath, xfs} from '@yarnpkg/fslib';
import {UsageError}               from 'clipanion';
import isEqual                    from 'lodash/isEqual';
import mergeWith                  from 'lodash/mergeWith';
import micromatch                 from 'micromatch';
import pLimit, {}            from 'p-limit';
import semver                     from 'semver';
import { Transform}      from 'stream';

/**
 * @internal
 */
export function isTaggedYarnVersion(version) {
  return !!(semver.valid(version) && version.match(/^[^-]+(-rc\.[0-9]+)?$/));
}

export function plural(n, {one, more, zero = more}) {
  return n === 0 ? zero : n === 1 ? one : more;
}

export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
}

export function overrideType(val) {
}

export function assertNever(arg) {
  throw new Error(`Assertion failed: Unexpected object '${arg}'`);
}

export function validateEnum(def, value) {
  const values = Object.values(def);

  if (!values.includes(value ))
    throw new UsageError(`Invalid value for enumeration: ${JSON.stringify(value)} (expected one of ${values.map(value => JSON.stringify(value)).join(`, `)})`);

  return value ;
}

export function mapAndFilter(iterable, cb) {
  const output = [];

  for (const value of iterable) {
    const out = cb(value);
    if (out !== mapAndFilterSkip) {
      output.push(out);
    }
  }

  return output;
}

const mapAndFilterSkip = Symbol();
mapAndFilter.skip = mapAndFilterSkip;

export function mapAndFind(iterable, cb) {
  for (const value of iterable) {
    const out = cb(value);
    if (out !== mapAndFindSkip) {
      return out;
    }
  }

  return undefined;
}

const mapAndFindSkip = Symbol();
mapAndFind.skip = mapAndFindSkip;

export function isIndexableObject(value) {
  return typeof value === `object` && value !== null;
}














export async function allSettledSafe(promises) {
  const results = await Promise.allSettled(promises);
  const values = [];

  for (const result of results) {
    if (result.status === `rejected`) {
      throw result.reason;
    } else {
      values.push(result.value);
    }
  }

  return values;
}

/**
 * Converts Maps to indexable objects recursively.
 */
export function convertMapsToIndexableObjects(arg) {
  if (arg instanceof Map)
    arg = Object.fromEntries(arg);

  if (isIndexableObject(arg)) {
    for (const key of Object.keys(arg)) {
      const value = arg[key];
      if (isIndexableObject(value)) {
        // @ts-expect-error: Apparently nothing in this world can be used to index type 'T & { [key: string]: unknown; }'
        arg[key] = convertMapsToIndexableObjects(value);
      }
    }
  }

  return arg ;
}






export function getFactoryWithDefault(map, key, factory) {
  let value = map.get(key);

  if (typeof value === `undefined`)
    map.set(key, value = factory());

  return value;
}

export function getArrayWithDefault(map, key) {
  let value = map.get(key);

  if (typeof value === `undefined`)
    map.set(key, value = []);

  return value;
}

export function getSetWithDefault(map, key) {
  let value = map.get(key);

  if (typeof value === `undefined`)
    map.set(key, value = new Set());

  return value;
}

export function getMapWithDefault(map, key) {
  let value = map.get(key);

  if (typeof value === `undefined`)
    map.set(key, value = new Map());

  return value;
}

// Executes a chunk of code and calls a cleanup function once it returns (even
// if it throws an exception)

export async function releaseAfterUseAsync(fn, cleanup) {
  if (cleanup == null)
    return await fn();

  try {
    return await fn();
  } finally {
    await cleanup();
  }
}

// Executes a chunk of code but slightly modify its exception message if it
// throws something

export async function prettifyAsyncErrors(fn, update) {
  try {
    return await fn();
  } catch (error) {
    error.message = update(error.message);
    throw error;
  }
}

// Same thing but synchronous

export function prettifySyncErrors(fn, update) {
  try {
    return fn();
  } catch (error) {
    error.message = update(error.message);
    throw error;
  }
}

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

// A stream implementation that buffers a stream to send it all at once

export class BufferStream extends Transform {
    chunks = [];

  _transform(chunk, encoding, cb) {
    if (encoding !== `buffer` || !Buffer.isBuffer(chunk))
      throw new Error(`Assertion failed: BufferStream only accept buffers`);

    this.chunks.push(chunk );

    cb(null, null);
  }

  _flush(cb) {
    cb(null, Buffer.concat(this.chunks));
  }
}







export function makeDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });

  return {promise, resolve: resolve, reject: reject};
}

export class AsyncActions {
   deferred = new Map();
   promises = new Map();

   limit;

  constructor(limit) {
    this.limit = pLimit(limit);
  }

  set(key, factory) {
    let deferred = this.deferred.get(key);
    if (typeof deferred === `undefined`)
      this.deferred.set(key, deferred = makeDeferred());

    const promise = this.limit(() => factory());
    this.promises.set(key, promise);

    promise.then(() => {
      if (this.promises.get(key) === promise) {
        deferred.resolve();
      }
    }, err => {
      if (this.promises.get(key) === promise) {
        deferred.reject(err);
      }
    });

    return deferred.promise;
  }

  reduce(key, factory) {
    const promise = this.promises.get(key) ?? Promise.resolve();
    this.set(key, () => factory(promise));
  }

  async wait() {
    await Promise.all(this.promises.values());
  }
}

// A stream implementation that prints a message if nothing was output

export class DefaultStream extends Transform {
    ifEmpty;

   active = true;

  constructor(ifEmpty = Buffer.alloc(0)) {
    super();

    this.ifEmpty = ifEmpty;
  }

  _transform(chunk, encoding, cb) {
    if (encoding !== `buffer` || !Buffer.isBuffer(chunk))
      throw new Error(`Assertion failed: DefaultStream only accept buffers`);

    this.active = false;
    cb(null, chunk);
  }

  _flush(cb) {
    if (this.active && this.ifEmpty.length > 0) {
      cb(null, this.ifEmpty);
    } else {
      cb(null);
    }
  }
}

// Webpack has this annoying tendency to replace dynamic requires by a stub
// code that simply throws when called. It's all fine and dandy in the context
// of a web application, but is quite annoying when working with Node projects!

const realRequire = eval(`require`);

function dynamicRequireNode(path) {
  return realRequire(npath.fromPortablePath(path));
}

/**
 * Requires a module without using the module cache
 */
function dynamicRequireNoCache(path) {
  const physicalPath = npath.fromPortablePath(path);

  const currentCacheEntry = realRequire.cache[physicalPath];
  delete realRequire.cache[physicalPath];

  let result;
  try {
    result = dynamicRequireNode(physicalPath);

    const freshCacheEntry = realRequire.cache[physicalPath];

    const dynamicModule = eval(`module`) ;
    const freshCacheIndex = dynamicModule.children.indexOf(freshCacheEntry);

    if (freshCacheIndex !== -1) {
      dynamicModule.children.splice(freshCacheIndex, 1);
    }
  } finally {
    realRequire.cache[physicalPath] = currentCacheEntry;
  }

  return result;
}

const dynamicRequireFsTimeCache = new Map


();

/**
 * Requires a module without using the cache if it has changed since the last time it was loaded
 */
function dynamicRequireFsTime(path) {
  const cachedInstance = dynamicRequireFsTimeCache.get(path);
  const stat = xfs.statSync(path);

  if (cachedInstance?.mtime === stat.mtimeMs)
    return cachedInstance.instance;

  const instance = dynamicRequireNoCache(path);
  dynamicRequireFsTimeCache.set(path, {mtime: stat.mtimeMs, instance});
  return instance;
}

export var CachingStrategy; (function (CachingStrategy) {
  const NoCache = 0; CachingStrategy[CachingStrategy["NoCache"] = NoCache] = "NoCache";
  const FsTime = NoCache + 1; CachingStrategy[CachingStrategy["FsTime"] = FsTime] = "FsTime";
  const Node = FsTime + 1; CachingStrategy[CachingStrategy["Node"] = Node] = "Node";
})(CachingStrategy || (CachingStrategy = {}));



export function dynamicRequire(path, {cachingStrategy = CachingStrategy.Node} = {}) {
  switch (cachingStrategy) {
    case CachingStrategy.NoCache:
      return dynamicRequireNoCache(path);

    case CachingStrategy.FsTime:
      return dynamicRequireFsTime(path );

    case CachingStrategy.Node:
      return dynamicRequireNode(path);

    default: {
      throw new Error(`Unsupported caching strategy`);
    }
  }
}

// This function transforms an iterable into an array and sorts it according to
// the mapper functions provided as parameter. The mappers are expected to take
// each element from the iterable and generate a string from it, that will then
// be used to compare the entries.
//
// Using sortMap is more efficient than kinda reimplementing the logic in a sort
// predicate because sortMap caches the result of the mappers in such a way that
// they are guaranteed to be executed exactly once for each element.

export function sortMap(values, mappers) {
  const asArray = Array.from(values);

  if (!Array.isArray(mappers))
    mappers = [mappers];

  const stringified = [];

  for (const mapper of mappers)
    stringified.push(asArray.map(value => mapper(value)));

  const indices = asArray.map((_, index) => index);

  indices.sort((a, b) => {
    for (const layer of stringified) {
      const comparison = layer[a] < layer[b] ? -1 : layer[a] > layer[b] ? +1 : 0;

      if (comparison !== 0) {
        return comparison;
      }
    }

    return 0;
  });

  return indices.map(index => {
    return asArray[index];
  });
}

/**
 * Combines an Array of glob patterns into a regular expression.
 *
 * @param ignorePatterns An array of glob patterns
 *
 * @returns A `string` representing a regular expression or `null` if no glob patterns are provided
 */
export function buildIgnorePattern(ignorePatterns) {
  if (ignorePatterns.length === 0)
    return null;

  return ignorePatterns.map(pattern => {
    return `(${micromatch.makeRe(pattern, {
      windows: false,
      dot: true,
    }).source})`;
  }).join(`|`);
}

export function replaceEnvVariables(value, {env}) {
  const regex = /\${(?<variableName>[\d\w_]+)(?<colon>:)?(?:-(?<fallback>[^}]*))?}/g;

  return value.replace(regex, (...args) => {
    const {variableName, colon, fallback} = args[args.length - 1];

    const variableExist = Object.hasOwn(env, variableName);
    const variableValue = env[variableName];

    if (variableValue)
      return variableValue;
    if (variableExist && !colon)
      return variableValue;
    if (fallback != null)
      return fallback;

    throw new UsageError(`Environment variable not found (${variableName})`);
  });
}

export function parseBoolean(value) {
  switch (value) {
    case `true`:
    case `1`:
    case 1:
    case true: {
      return true;
    }

    case `false`:
    case `0`:
    case 0:
    case false: {
      return false;
    }

    default: {
      throw new Error(`Couldn't parse "${value}" as a boolean`);
    }
  }
}

export function parseOptionalBoolean(value) {
  if (typeof value === `undefined`)
    return value;

  return parseBoolean(value);
}

export function tryParseOptionalBoolean(value) {
  try {
    return parseOptionalBoolean(value);
  } catch {
    return null;
  }
}





export function isPathLike(value) {
  if (npath.isAbsolute(value) || value.match(/^(\.{1,2}|~)\//))
    return true;
  return false;
}





/**
 * Merges multiple objects into the target argument.
 *
 * **Important:** This function mutates the target argument.
 *
 * Custom classes inside the target parameter are supported (e.g. comment-json's `CommentArray` - comments from target will be preserved).
 *
 * @see toMerged for a version that doesn't mutate the target argument
 *
 */
export function mergeIntoTarget(target, ...sources) {
  // We need to wrap everything in an object because otherwise lodash fails to merge 2 top-level arrays
  const wrap = (value) => ({value});

  const wrappedTarget = wrap(target);
  const wrappedSources = sources.map(source => wrap(source));

  const {value} = mergeWith(wrappedTarget, ...wrappedSources, (targetValue, sourceValue) => {
    // We need to preserve comments in custom Array classes such as comment-json's `CommentArray`, so we can't use spread or `Set`s
    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      for (const sourceItem of sourceValue) {
        if (!targetValue.find(targetItem => isEqual(targetItem, sourceItem))) {
          targetValue.push(sourceItem);
        }
      }

      return targetValue;
    }

    return undefined;
  });

  return value;
}

/**
 * Merges multiple objects into a single one, without mutating any arguments.
 *
 * Custom classes are not supported (i.e. comment-json's comments will be lost).
 */
export function toMerged(...sources) {
  return mergeIntoTarget({}, ...sources);
}

export function groupBy(items, key) {
  const groups = Object.create(null);

  for (const item of items) {
    const groupKey = item[key];

    groups[groupKey] ??= [];
    groups[groupKey].push(item);
  }

  return groups;
}

export function parseInt(val) {
  return typeof val === `string` ? Number.parseInt(val, 10) : val;
}
