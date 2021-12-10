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
- Asynchronous By Nature
- Customizable Cache Lifetime
- Extremely Lightweight
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

// Create an instance that caches for 5 seconds
// This will ensure, new data is only fetched every 5 seconds
const CurrencyLookup = new CachedLookup(async () => {
    // Hit some third-party API to retrieve fresh currency data
    const result = await get_currency_values();
    
    // Perform some local parsing of the resolved data
    const parsed = parse_data(result);

    // Return parsed data for cached-lookup to cache and serve instantly for the next 5 seconds
    return parsed;
});

// Some webserver route utilizing the CachedLookup instance to serve currency data
webserver.get('/api/currency', async (request, response) => {
    // This will return the cached value for 5 seconds before retrieving a fresh value
    const data = await CurrencyLookup.cached(5000);
    return response.send(data);
});
```

## CachedLookup
Below is a breakdown of the `CachedLookup` class.

#### Constructor Parameters
* `new CachedLookup(Function: lookup)`: Creates a new CachedLookup instance.
  * `lookup` [`Function`]: Lookup handler which is invocated to get fresh results.
    * **Note!** this callback can be either `synchronous` or `asynchronous`.
    * **Note!** you must return/resolve a value through this callback for the caching to work properly.

#### CachedLookup Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `value`   | `Any`    | Most recent cached value   |
| `updated_at` | `Number` | Unix timestamp in milliseconds of latest update |
| `in_flight` | `Boolean` | Whether instance is currently looking up a fresh value |

#### CachedLookup Methods
* `cached(Number: max_age)`: Consumes cached value with a fallback to fresh value if cached value has expired.
    * **Returns** a `Promise` which is then resolved to the lookup value.
    * **Note** parameter `max_age` should be a `Number` in `milliseconds` to specify the maximum acceptable cache age.
    * **Note** this method will reject when the lookup handler also rejects.
* `fresh()`: Retrieves fresh value from the lookup handler.
  * **Returns** a `Promise` which is then resolved to the lookup value.   
* `expire()`: Expires current cached value marking instance to fetch fresh value on next `cached()` invocation.

## License
[MIT](./LICENSE)
