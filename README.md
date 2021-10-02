# CachedLookup: A Simple Package To Cache And Save On Expensive API Calls

<div align="left">

[![NPM version](https://img.shields.io/npm/v/cached-lookup.svg?style=flat)](https://www.npmjs.com/package/cached-lookup)
[![NPM downloads](https://img.shields.io/npm/dm/cached-lookup.svg?style=flat)](https://www.npmjs.com/package/cached-lookup)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/kartikk221/cached-lookup.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/kartikk221/cached-lookup/context:javascript)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/cached-lookup)](https://github.com/kartikk221/cached-lookup/blob/master/LICENSE)

</div>

## Motivation
This package aims to simplify the task of implementing a short-lived caching system for an endpoint which may be calling another third party API under the hood with a usage/rate limit. This package can also help to alleviate pressure when consuming data from databases by implementing a short lived cache that does not scale relative to incoming requests. This package also implements an underlying promise queue for lookup calls thus only one expensive API call is made when multiple consumption requests are made while cache has expired.

## Features
- Simple-to-use API
- Asynchronous By Nature
- Extremely Lightweight

## Installation
CachedLookup can be installed using node package manager (`npm`)
```
npm i cached-lookup
```

## Examples
Below are some example(s) making use of CachedLookup in various situations.

#### Enforcing a 5 Second Cache For An API Call To A Third-Party Currency API
```javascript
const CachedLookup = require('cached-lookup');

// Create an instance that caches for 5 seconds
// This will ensure, new data is only fetched every 5 seconds
const CurrencyLookup = new CachedLookup(5000, async () => {
    // Hit some third-party API to retrieve fresh currency data
    const result = await get_currency_values();
    
    // Perform some local parsing of the resolved data
    const parsed = parse_data(result);

    // Return parsed data for cached-lookup to cache and serve instantly for the next 5 seconds
    return parsed;
});

// Some webserver route utilizing the CachedLookup instance to serve currency data
webserver.get('/api/currency', async (request, response) => {
    const data = await CurrencyLookup.get();
    return response.send(data);
});
```

## CachedLookup
Below is a breakdown of the `CachedLookup` class.

#### Constructor Parameters
* `new CachedLookup(Number: lifetime, Function: lookup)`: Creates a new CachedLookup instance.
  * `lifetime` [`Number`]: Duration of cache lifetime in milliseconds.
  * `lookup` [`Function`]: Lookup handler which is invocated to get fresh results.
    * **Note!** this callback can be either `synchronous` or `asynchronous`.
    * **Note!** you must return a value through this callback for the caching to work properly.

#### CachedLookup Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `cached_value` | `Any` | Most recent cached value |
| `expires_at` | `Number` | Timestamp of when cache will expire in milliseconds |
| `in_flight` | `Boolean` | Whether instance is currently looking up a fresh value |

#### CachedLookup Methods
* `get()`: Consume appropriate value from lookup instance. This method automatically handles resolving of cached/fresh data.
    * **Returns** a `Promise` which is then resolved to the lookup value. 
    * **Note** this method will reject when the lookup handler also rejects.
* `expire()`: Expires current cached value marking instance to fetch fresh value on next `get()` invocation.
## License
[MIT](./LICENSE)
