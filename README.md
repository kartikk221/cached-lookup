# CachedLookup: A Simple Package To Cache And Save On Expensive Lookups & Operations.

<div align="left">

[![NPM version](https://img.shields.io/npm/v/cached-lookup.svg?style=flat)](https://www.npmjs.com/package/cached-lookup)
[![NPM downloads](https://img.shields.io/npm/dm/cached-lookup.svg?style=flat)](https://www.npmjs.com/package/cached-lookup)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/blob/master/LICENSE)

</div>

## Motivation

CachedLookup simplifies short-lived caching for endpoints that call a third-party API, database, or other expensive operation. It also consolidates concurrent calls for the same arguments into one lookup, helping reduce repeated work and pressure on rate-limited services.

## Features

- Small API with no dependencies and TypeScript support
- One lookup for concurrent calls with the same arguments
- Caller-controlled freshness with `cached()` or stale-while-refresh behavior with `rolling()`
- Automatic cache sweeping with a fixed or growing per-key retention TTL

## Installation

```sh
npm i cached-lookup
```

## Quick start

```javascript
const CachedLookup = require('cached-lookup');

// Fetch concerts from a third-party API for a city.
const concerts = new CachedLookup(async (country, state, city) => {
    return get_city_concerts(country, state, city);
});

webserver.get('/api/concerts/:country/:state/:city', async (request, response) => {
    const { country, state, city } = request.path_parameters;

    // Accept a stored value only if it is at most 10 seconds old.
    const result = await concerts.cached(10_000, country, state, city);
    return response.json({ concerts: result });
});
```

The lookup handler can be synchronous or asynchronous. It must return a value; `undefined` is treated as a failed lookup. Arguments passed after `max_age_ms` are forwarded to the handler.

## Constructor

Use `new CachedLookup(lookup)` for defaults, or `new CachedLookup(options, lookup)` to configure retention. The options argument may be omitted.

| Option | Default | Meaning |
| :-- | --: | :-- |
| `cache_ttl_ms` | `60000` | Base retention TTL in milliseconds and interval between cache sweeps. Use `Infinity` to disable automatic purging. |
| `cache_ttl_static` | `false` | Keep every record's retention TTL fixed at `cache_ttl_ms` when `true`. |
| `cache_sweep_iterations` | `5000` | Records inspected synchronously before a sweep yields to the event loop. |

```javascript
const lookup = new CachedLookup({
    cache_ttl_ms: 30_000,
    cache_ttl_static: false,
    cache_sweep_iterations: 2000,
}, async (key) => fetch_value(key));
```

### Static versus dynamic TTL

`max_age_ms` in `cached()` and `rolling()` is the **maximum age that caller will accept**. A record's `ttl` is how long CachedLookup **retains it in memory**. These are separate decisions.

By default, `cache_ttl_static: false` allows a resident key's retention TTL to grow. Each request can raise that key's TTL to `max(cache_ttl_ms, max_age_ms)`. A smaller request never reduces it, and a cache hit does not change the last-store timestamp. Successful refreshes keep the highest TTL requested during that key's current residency. A pending lookup also collects the highest age requested by its callers. Purging, `expire()`, or `clear()` resets the key's TTL history.

With `cache_ttl_static: true`, every successful value has exactly `cache_ttl_ms` of retention, regardless of callers' `max_age_ms` values. A caller can still require a fresher value than that window, or ask to use an older value while it remains resident; the fixed retention deadline does not change. Once a sweep removes the record, the next request starts a new lookup.

For example, with `cache_ttl_ms: 30_000`, a `cached(120_000, key)` call can extend that key's retention to 120 seconds in dynamic mode. In static mode it stays at 30 seconds. In either mode, `cached(5_000, key)` accepts a value only while it is at most 5 seconds old.

### Keeping values until manually removed

Set `cache_ttl_ms: Infinity` to disable the sweep interval. CachedLookup still stores successful values and still applies each caller's `max_age_ms` freshness requirement, but completed records remain in memory until `expire()` or `clear()` removes them. This recreates the old no-purge behavior and is best reserved for a known, limited set of keys.

## Methods

| Method | Behavior |
| :-- | :-- |
| `cached(max_age_ms, ...args)` | Return a value within this caller's age limit, or wait for a shared fresh lookup. `cached(0)` bypasses completed values. |
| `rolling(max_age_ms, ...args)` | Return a resident value immediately and refresh it in the background when stale; wait for a lookup if no value is resident. `rolling(0)` retains this stale-return behavior. |
| `fresh(...args)` | Bypass completed values, join a lookup already in flight, and retain a successful result. |
| `get(...args)` | Read a resident value without starting a lookup. |
| `expire(...args)` | Remove one completed value and return whether it existed. |
| `in_flight(...args)` | Return whether a lookup for these arguments is pending. |
| `updated_at(...args)` | Return the last successful store timestamp in milliseconds, or `undefined`. |
| `clear()` | Remove all completed values. |

Lookup arguments may be booleans, numbers, strings, `null`, or arrays of these values. CachedLookup serializes them to identify a key. `cached()` rejects if its lookup fails; a failed background refresh from `rolling()` leaves the previous value in place.

## Events and records

`fresh` fires after a successful store; `purge` fires when a sweep removes a record. Both listeners receive `(value, ...originalArgs)`.

The `cache` property exposes a live map of completed records. Each record has `args` (original arguments for purge events), `value`, `ttl` (retention in milliseconds), and `timestamp` (last successful store). The `lookup`, `options`, and `cache` properties are exposed through getters. Pending promises are private; use `in_flight()` or retain the promise returned by `cached()` or `fresh()`.

A sweep runs once per finite `cache_ttl_ms` while the cache contains completed values. It removes each record when `now - timestamp >= ttl`, yielding after each `cache_sweep_iterations` records. Removal can lag a deadline by roughly one sweep interval plus event-loop delay. The interval stops when the cache is empty and is unreferenced on Node. Finite retention is bounded by time, but a high rate of unique keys can still increase memory use between sweeps; there is no entry-count or byte cap.

## Breaking changes from 5.5

- Every successful value, including one fetched only through `fresh()`, now has a finite retention TTL and is swept automatically by default. Set `cache_ttl_ms: Infinity` to retain values until manually removed.
- `cached(0)` now bypasses completed values. In the default dynamic mode, a resident key preserves its highest requested retention TTL across successful refreshes until removal.
- Constructor options `auto_purge`, `purge_age_factor`, and `max_purge_eloop_tick` were removed. Use `cache_ttl_ms`, `cache_ttl_static`, and `cache_sweep_iterations`. Unsupported option keys are ignored.
- Cache records now use `timestamp` and `ttl`; the old `updated_at` and `max_age` record fields were removed. The `updated_at()` method remains available.
- The previously public `promises` map is now private. Use `in_flight()` to check pending work or retain the promise returned by a lookup method.

## License

[MIT](./LICENSE)
