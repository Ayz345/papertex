/* @siglum/engine loads blake3-wasm lazily to speed up hashing large documents,
   and falls back to a pure-JS hash when the import fails. We take the fallback
   rather than ship a second wasm binary for a cache key. */
throw new Error('blake3-wasm intentionally omitted; using the built-in fallback hash');
