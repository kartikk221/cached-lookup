# CachedLookup: A Simple Package To Cache And Save On Expensive Lookups & Operations.

<div align="left">

[![NPM version](https://img.shields.io/npm/v/cached-lookup.svg?style=flat)](https://www.npmjs.com/package/cached-lookup)
[![NPM downloads](https://img.shields.io/npm/dm/cached-lookup.svg?style=flat)](https://www.npmjs.com/package/cached-lookup)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/kartikk221/cached-lookup.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/kartikk221/cached-lookup/context:javascript)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/blob/master/LICENSE)

</div>

## Motivation
This package aims to simplify the task of implementing a short-lived caching system for an endpoint which may be calling another third party API under the hood with a usage/rate limit. This package can also help to alleviate pressure when consuming data from databases or I/O network operations by implementing a short lived cache that does not scale relative to incoming requests.

## Features
- Simple-to-use API
- TypeScript Support
- Dynamic Cache Consumption
- CPU & Memory Efficient
- No Dependencies

## Installation
CachedLookup can be installed using node package manager (`npm`)
```
npm i cached-lookup
```

## How To Use?
Below is a small snippet that shows how to use a `CachedLookup` instance.

```javascript
const CachedLookup = require('cached-lookup');

// Create a cached lookup instance which fetches music concerts from different cities on a specific date
const ConcertsLookup = new CachedLookup(async (country, state, city) => {
    // Assume that the function get_city_concerts() is calling a Third-Party API which has a rate limit
    const concerts = await get_city_concerts(country, state, city);
    
    // Simply return the data and CachedLookup will handle the rest
    return concerts;
});

// Create some route which serves this data with a 10 second intermittent cache
webserver.get('/api/concerts/:country/:state/:city', async (request, response) => {
    // Retrieve the city value from the request - assume there is user validation done on this here
    const { country, state, city } = request.path_parameters;

    // Retrieve data from the CachedLookup with the cached() and pass the city in the call to the lookup handler
    // Be sure to specify the first parameter as the max_age of the cached value in milliseconds
    // In our case, 10 seconds would be 10,000 milliseconds
    const concerts = await ConcertsLookup.cached(1000 * 10, country, state, city);
    
    // Simply return the data to the user
    // Because we retrieved this data from the ConcertsLookup with the cached() method
    // We can safely assume that we will only perform up to 1 Third-Party API request per city every 10 seconds
    return response.json({
        concerts
    });
});
```

## CachedLookup
Below is a breakdown of the `CachedLookup` class.

#### Constructor Parameters
* `new CachedLookup(Function: lookup)`: Creates a new CachedLookup instance with default `options`.
* `new CachedLookup(Object?: options, Function(...arguments): lookup)`: Creates a new CachedLookup instance with custom `options`.
  * `options` [`Object`]: Constructor options for this instance.
    * `auto_purge` [`Boolean`]: Whether to automatically purge cache values when they have aged past their last known maximum age.
      * **Default**: `true`
    * `purge_age_factor` [`Number`]: The factor by which to multiply the last known maximum age of a cache value to determine the age at which it should be purged.
      * **Default**: `1`
  * `lookup` [`Function`]: Lookup handler which is called to get fresh values.
    * **Note!** this callback can be either `synchronous` or `asynchronous`.
    * **Note!** you must `return`/`resolve` a value through this callback for the caching to work properly.
    * **Note!** `arguments` passed to the methods below will be available in each call to this `lookup` handler.

#### CachedLookup Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `lookup`   | `function(...arguments)`    | Lookup handler of this instance.   |
| `cache`   | `Map<string, ValueRecord>`    | Internal map of cached values.   |
| `promises`   | `Map<string, Promise<T>>`    | Internal map of promises for pending lookups.   |

#### CachedLookup Methods
* `cached(Number: max_age, ...arguments)`: Returns the `cached` value for the provided set of `arguments` from the lookup handler.
    * **Returns** a `Promise` which is resolved to the `cached` value with a fall back to the `fresh` value.
    * **Note** the arameter `max_age` should be a `Number` in `milliseconds` to specify the maximum acceptable cache age.
    * **Note** this method will automatically fall back to a `fresh()` call if no viable cache value is available.
    * **Note** the returned `Promise` will **reject** when the lookup handler also rejects.
    * **Note** the provided `arguments` after the `max_age` will be available inside of the `lookup` handler function.
* `fresh(...arguments)`: Retrieves the `fresh` value for the provided set of arguments from the lookup handler.
  * **Returns** a `Promise` which is resolved to the `fresh` value.   
* `expire(...arguments)`: Expires the `cached` value for the provided set of arguments.
  * **Returns** a `Boolean` which specifies whether a `cached` value was expired or not.
* `in_flight(...arguments)`: Checks whether a `fresh` value is currently being resolved for the provided set of arguments.
  * **Returns** a `Boolean` to specify the result.
* `updated_at(...arguments)`: Returns the last value update `timestamp` in **milliseconds** for the provided set of arguments.
    * **Returns** a `Number` or `undefined` if no cached value exists.
* `clear()`: Clears all the cached values and resets the internal cache state.
* **Note** the `...arguments` are **optional** but must be of the following types: `Boolean`, `Number`, `String` or an `Array` of these types.

### ValueRecord Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `value`   | `T (Generic)`    | The cached value.   |
| `timeout`   | `null | Number`    | The expiry timeout id if one exists.   |
| `updated_at`   | `Number`    | Timestamp (In milliseconds) of when this value was cached.   |

## License
[MIT](./LICENSE)
