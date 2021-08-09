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
This package aims to simplify the task of throttling and implementing a caching system for an endpoint which may be calling another third party API under the hood with a usage limit. This package can also help to alleviate pressure when consuming data from databases by implementing a short lived cache. This package also implements an underlying promise queue for lookup calls thus only one expensive API call is made when cache has expired.

## Features
- Simple-to-use API
- Asynchronous By Nature
- Custom Parameters Support
- Lightweight/No Dependencies

## Installation
CachedLookup can be installed using node package manager (`npm`)
```
npm i cached-lookup
```

## Examples
Below are some example(s) making use of CachedLookup in various situations.

#### Enforcing a 1 Second Cache For An API Call To A Third-Party Currency API
```javascript
const CachedLookup = require('cached-lookup');
const CurrencyLookup = new CachedLookup({
    lifetime: 1000 // 1 Second Cache Lifetime
});

// Bind a handler which is used to retrieve fresh currency data from a third party API
// Note! The Handler Must Be Asynchronous Or Return A Promise
CurrencyLookup.set_lookup_handler((base_currency) => {
    return new Promise((resolve, reject) => {
        // get_currency_values is a function that calls a third party API that has a daily usage limit
        get_currency_values(base_currency)
        .then((results) => {
            // You can do some processing here
            
            // We resolve the promise so CachedLookup can take over and cache/resolve data
            resolve(results);
        })
        .catch((error) => {
            // We reject the promise so any pending CachedLookup.get() calls can be rejected with error
            reject(error);    
        });
    });
});

// Some webserver route utilizing the CachedLookup instance to serve currency data
webserver.get('/api/currency', async (request, response) => {
    let data = await CachedLookup.get('USD');
    return response.send(data);
});
```

## CachedLookup
Below is a breakdown of the `CachedLookup` class.

#### Constructor Options
* `lifetime` [`Number`]: Duration of cache lifetime in milliseconds.

#### CachedLookup Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `cached_value` | `Any` | Most recent resolved/cached vcalue |
| `last_update` | `Number` | Timestamp of last fresh lookup in milliseconds |
| `in_flight` | `Boolean` | Whether instance is currently looking up a fresh value |

#### CachedLookup Methods
* `get(...parameters)`: Consume most recent value from lookup instance.
    * **Returns** a `Promise` which is then resolved to the lookup value. 
    * **parameters** are directly passed to the `handler` set with `set_lookup_handler`.
    * **Note** this method will reject when the lookup handler also rejects.
* `set_lookup_handler(Function: handler)`: Sets the lookup handler which is used to perform fresh lookups.
    * **Note**: This method must either be asynchronous or return a `Promise`.
    * **Note**: The `parameters` are directly passed from the `parameters` specified in the original `get(...parameters)` call.
## License
[MIT](./LICENSE)