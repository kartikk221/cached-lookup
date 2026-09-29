const test = require('node:test');
const assert = require('node:assert/strict');
const CachedLookup = require('../index.js');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

async function with_clock(run) {
    const original = Date.now;
    let now = 1000;
    Date.now = () => now;
    try { await run((value) => { now = value; }); }
    finally { Date.now = original; }
}

test('zero age bypasses completed values and joins pending lookups', async () => {
    await with_clock(async () => {
        const pending = deferred();
        let calls = 0;
        const cache = new CachedLookup({}, () => ++calls === 1 ? 'first' : pending.promise);
        assert.equal(await cache.fresh('k'), 'first');
        const one = cache.cached(0, 'k');
        const two = cache.fresh('k');
        assert.strictEqual(one, two);
        assert.equal(cache.in_flight('k'), true);
        assert.equal(calls, 2);
        pending.resolve('second');
        assert.equal(await one, 'second');
        assert.equal(cache.cache.get('k').ttl, 60000);
        assert.equal(cache.updated_at('k'), 1000);
    });
});

test('a synchronous reentrant caller joins the same pending lookup', async () => {
    let cache, joined;
    let calls = 0;
    cache = new CachedLookup((key) => {
        calls++;
        joined = cache.fresh(key);
        return 'value';
    });

    const first = cache.fresh('k');
    assert.equal(calls, 1);
    assert.strictEqual(joined, first);
    assert.equal(await first, 'value');
    assert.equal(cache.in_flight('k'), false);
    cache.clear();
});

test('retention grows on hits while caller freshness remains independent', async () => {
    await with_clock(async (tick) => {
        let calls = 0;
        const cache = new CachedLookup({cache_ttl_ms: 10}, () => ++calls);
        assert.equal(await cache.cached(5, 'k'), 1);
        tick(1003);
        assert.equal(await cache.cached(100, 'k'), 1);
        assert.deepEqual(Object.keys(cache.cache.get('k')), ['args', 'value', 'ttl', 'timestamp']);
        assert.equal(cache.cache.get('k').ttl, 100);
        assert.equal(cache.cache.get('k').timestamp, 1000);
        assert.equal(cache.updated_at('k'), 1000);
        assert.equal(await cache.cached(2, 'k'), 2);
        assert.equal(cache.cache.get('k').ttl, 100);
        assert.equal(cache.cache.get('k').timestamp, 1003);
        assert.equal(cache.updated_at('k'), 1003);
        assert.equal(await cache.cached(1, 'k'), 2);
        tick(1104);
        assert.equal(cache.get('k'), 2);
        await cache._purge_stale_cache();
        assert.equal(cache.get('k'), undefined);
        assert.equal(await cache.fresh('k'), 3);
        assert.equal(cache.cache.get('k').ttl, 10);
    });
});

test('joining callers and rolling refresh keep the largest TTL', async () => {
    await with_clock(async (tick) => {
        const pending = [];
        const cache = new CachedLookup({cache_ttl_ms: 10}, () => {
            const lookup = deferred();
            pending.push(lookup);
            return lookup.promise;
        });
        const first = cache.fresh('k');
        const joined = cache.cached(100, 'k');
        assert.strictEqual(first, joined);
        pending[0].resolve('a');
        await first;
        assert.equal(cache.cache.get('k').ttl, 100);
        tick(1100);
        assert.equal(await cache.rolling(200, 'k'), 'a');
        assert.equal(cache.cache.get('k').ttl, 200);
        assert.equal(cache.updated_at('k'), 1000);
        tick(1201);
        assert.equal(await cache.rolling(1, 'k'), 'a');
        assert.equal(cache.in_flight('k'), true);
        assert.equal(await cache.rolling(300, 'k'), 'a');
        const refresh = cache.fresh('k');
        pending[1].resolve('b');
        await refresh;
        assert.equal(cache.cache.get('k').ttl, 300);
        assert.equal(cache.updated_at('k'), 1201);
        assert.equal(cache.get('k'), 'b');
        assert.equal(pending.length, 2);
    });
});

test('failures preserve records and background rejections are handled', async () => {
    await with_clock(async (tick) => {
        const failure = new Error('failure');
        let calls = 0;
        const cache = new CachedLookup({cache_ttl_ms: 10}, () => ++calls === 1 ? 'old' : Promise.reject(failure));
        await cache.cached(100, 'k');
        tick(1200);
        await assert.rejects(cache.cached(1, 'k'), (error) => error === failure);
        assert.equal(cache.get('k'), 'old');
        assert.equal(cache.updated_at('k'), 1000);
        assert.equal(cache.cache.get('k').ttl, 100);
        assert.equal(await cache.rolling(0, 'k'), 'old');
        await new Promise(setImmediate);
        assert.equal(cache.in_flight('k'), false);
        assert.equal(cache.get('k'), 'old');
    });
});

test('sweeps use individual deadlines, original event arguments, and preserve pending work', async () => {
    await with_clock(async (tick) => {
        const pending = deferred();
        const cache = new CachedLookup({cache_ttl_ms: 10, cache_sweep_iterations: 1}, (key) => key === 'pending' ? pending.promise : key);
        const purged = [];
        cache.on('purge', (...args) => purged.push(args));
        await cache.fresh('short');
        await cache.cached(30, 'long');
        const promise = cache.fresh('pending');
        tick(1010);
        await cache._purge_stale_cache();
        assert.deepEqual(purged, [['short', 'short']]);
        assert.equal(cache.get('long'), 'long');
        assert.equal(cache.in_flight('pending'), true);
        tick(1030);
        await cache._purge_stale_cache();
        assert.deepEqual(purged[1], ['long', 'long']);
        pending.resolve('done');
        await promise;
        assert.equal(cache.cache.get('pending').ttl, 10);
        assert.equal(cache.expire('pending'), true);
        await cache.fresh('short');
        cache.clear();
        assert.equal(cache.cache.size, 0);
    });
});

test('automatic interval purges fresh-only records and stops when empty', async () => {
    const cache = new CachedLookup({cache_ttl_ms: 5}, () => 'value');
    await cache.fresh('k');
    assert.equal(cache.cache.get('k').ttl, 5);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(cache.cache.size, 0);
    assert.equal(cache.get('k'), undefined);
});

test('cached-first requests share a lookup and expire and clear reset TTL history', async () => {
    await with_clock(async () => {
        const pending = [];
        const cache = new CachedLookup({cache_ttl_ms: 10}, () => {
            const lookup = deferred();
            pending.push(lookup);
            return lookup.promise;
        });
        const first = cache.cached(20, 'k');
        assert.strictEqual(cache.fresh('k'), first);
        assert.strictEqual(cache.cached(80, 'k'), first);
        pending[0].resolve('a');
        await first;
        assert.equal(cache.cache.get('k').ttl, 80);
        cache.expire('k');
        const second = cache.fresh('k');
        pending[1].resolve('b');
        await second;
        assert.equal(cache.cache.get('k').ttl, 10);
        await cache.cached(90, 'k');
        cache.clear();
        const third = cache.fresh('k');
        pending[2].resolve('c');
        await third;
        assert.equal(cache.cache.get('k').ttl, 10);
    });
});

test('large sweeps yield and overlapping sweeps leave records and promises intact', async () => {
    await with_clock(async (tick) => {
        const pending = deferred();
        const cache = new CachedLookup({cache_ttl_ms: 10, cache_sweep_iterations: 1}, (key) => key === 'pending' ? pending.promise : key);
        for (let i = 0; i < 10; i++) await cache.fresh(i);
        const flight = cache.fresh('pending');
        tick(1010);
        const sweep = cache._purge_stale_cache();
        const overlap = cache._purge_stale_cache();
        await overlap;
        assert.equal(cache.in_flight('pending'), true);
        await sweep;
        assert.equal(cache.cache.size, 0);
        pending.resolve('value');
        await flight;
        assert.equal(cache.get('pending'), 'value');
    });
});

test('static TTL ignores larger caller ages while dynamic TTL grows', async () => {
    await with_clock(async (tick) => {
        let static_calls = 0;
        const fixed = new CachedLookup({cache_ttl_ms: 10, cache_ttl_static: true}, () => ++static_calls);
        const dynamic = new CachedLookup({cache_ttl_ms: 10}, () => 1);
        assert.equal(await fixed.cached(100, 'k'), 1);
        assert.equal(await dynamic.cached(100, 'k'), 1);
        assert.equal(fixed.cache.get('k').ttl, 10);
        assert.equal(dynamic.cache.get('k').ttl, 100);
        tick(1010);
        await fixed._purge_stale_cache();
        await dynamic._purge_stale_cache();
        assert.equal(fixed.get('k'), undefined);
        assert.equal(dynamic.get('k'), 1);
        assert.equal(await fixed.cached(100, 'k'), 2);
        assert.equal(fixed.cache.get('k').ttl, 10);
        fixed.clear();
        dynamic.clear();
    });
});

test('Infinity retains values without a sweep while caller freshness still applies', async () => {
    await with_clock(async (tick) => {
        const original = global.setInterval;
        let intervals = 0;
        global.setInterval = () => { intervals++; return {unref() {}}; };
        try {
            for (const cache_ttl_static of [false, true]) {
                tick(1000);
                let calls = 0;
                const cache = new CachedLookup({cache_ttl_ms: Infinity, cache_ttl_static}, () => ++calls);
                assert.equal(await cache.fresh('k'), 1);
                assert.equal(cache.cache.get('k').ttl, Infinity);
                tick(100000);
                assert.equal(cache.get('k'), 1);
                assert.equal(await cache.cached(1, 'k'), 2);
                assert.equal(cache.cache.get('k').ttl, Infinity);
                assert.equal(cache.expire('k'), true);
                await cache.fresh('k');
                cache.clear();
                assert.equal(cache.cache.size, 0);
            }
            assert.equal(intervals, 0);
        } finally {
            global.setInterval = original;
        }
    });
});

test('constructor accepts optional options and validates the new settings', async () => {
    const cache = new CachedLookup(undefined, () => 1);
    await cache.fresh('k');
    assert.equal(cache.options.cache_ttl_ms, 60000);
    assert.equal(cache.options.cache_ttl_static, false);
    assert.equal(cache.options.cache_sweep_iterations, 5000);
    cache.clear();
    assert.throws(() => new CachedLookup({cache_ttl_ms: 0}, () => 1), /positive integer/);
    assert.throws(() => new CachedLookup({cache_sweep_iterations: 0}, () => 1), /positive integer/);
    assert.throws(() => new CachedLookup({cache_ttl_static: 1}, () => 1), /Boolean/);
    const with_unknown = new CachedLookup({unknown_option: true}, () => 1);
    assert.deepEqual(with_unknown.options, {
        cache_ttl_ms: 60000,
        cache_ttl_static: false,
        cache_sweep_iterations: 5000,
    });
});

test('documented properties use getters while pending promises remain private', async () => {
    const lookup = (key) => key;
    const cache = new CachedLookup({}, lookup);
    const prototype = Object.getPrototypeOf(cache);
    for (const name of ['lookup', 'options', 'cache']) {
        assert.equal(Object.hasOwn(cache, name), false);
        assert.equal(typeof Object.getOwnPropertyDescriptor(prototype, name).get, 'function');
    }
    assert.strictEqual(cache.lookup, lookup);
    assert.equal(Object.isFrozen(cache.options), true);
    const records = cache.cache;
    await cache.fresh('key');
    assert.strictEqual(cache.cache, records);
    assert.equal('promises' in cache, false);
    assert.equal(records.get('key').value, 'key');
});
