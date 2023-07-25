const crypto = require('crypto');
const CachedLookup = require('../index.js');
const { log, assert_log, async_wait, with_duration } = require('./operators.js');

// Track the last lookup arguments
let lookup_delay = 50;
let error_margin_ms = 50;
let last_lookup_arguments;
async function lookup_handler() {
    await async_wait(lookup_delay);
    last_lookup_arguments = Array.from(arguments);
    return Array.from(arguments).concat([crypto.randomUUID()]).join('');
}

let auto_purge = true;
async function test_instance() {
    const group = 'LOOKUP';
    const candidate = 'CachedLookup';
    const seralized = Array.from(arguments);
    log('LOOKUP', 'Testing With Arguments: ' + (seralized.length > 0 ? JSON.stringify(seralized) : 'None'));

    // Create a new CachedLookup instance
    const lookup = new CachedLookup(
        {
            auto_purge,
        },
        lookup_handler
    );

    // Flip the auto_purge flag
    auto_purge = !auto_purge;

    // Perform the first lookup
    let [cached_value_1, cached_duration_1] = await with_duration(lookup.cached(lookup_delay, ...arguments)); // This should be fresh
    let updated_at_1 = lookup.updated_at(...arguments);

    // Assert that the lookup arguments are the same as the last lookup arguments
    assert_log(
        group,
        candidate + ' - Lookup Handler Arguments Test',
        () => JSON.stringify(seralized) === JSON.stringify(last_lookup_arguments)
    );

    // Wait for the old value to expire and perform the second lookup
    await async_wait(lookup_delay + 1);
    let [cached_value_2, cached_duration_2] = await with_duration(lookup.cached(lookup_delay, ...arguments)); // This should be fresh
    let updated_at_2 = lookup.updated_at(...arguments);

    // Perform the third lookup instantly
    let [cached_value_3, cached_duration_3] = await with_duration(lookup.cached(lookup_delay, ...arguments)); // This should be cached
    let updated_at_3 = lookup.updated_at(...arguments);

    // Wait for the old value to expire and perform the fourth lookup
    await async_wait(lookup_delay + 1);
    let [cached_value_4, cached_duration_4] = await with_duration(lookup.cached(lookup_delay, ...arguments)); // This should be fresh

    // Perform the fifth lookup instantly
    let [cached_value_5, cached_duration_5] = await with_duration(lookup.cached(lookup_delay, ...arguments)); // This should be cached

    // Perform the first fresh lookup
    let [fresh_value_1, fresh_duration_1] = await with_duration(lookup.fresh(...arguments)); // This should be fresh

    // Perform the six and seventh cached lookup after expiring any existing cached value
    let expire_attempt_1 = lookup.expire(...arguments); // Should be true
    let expire_attempt_2 = lookup.expire(...arguments); // Should be false
    let [cached_value_6, cached_duration_6] = await with_duration(lookup.cached(lookup_delay, ...arguments)); // This should be fresh
    let [cached_value_7, cached_duration_7] = await with_duration(lookup.cached(lookup_delay, ...arguments)); // This should be cached

    // Assert that the CachedLookup.cached() method returned the correct values
    assert_log(
        group,
        candidate + '.cached() - Lookup Values Test',
        () =>
            cached_value_1 !== cached_value_2 &&
            cached_value_2 === cached_value_3 &&
            cached_value_3 !== cached_value_4 &&
            cached_value_4 == cached_value_5
    );

    // Assert that the CachedLookup.cached() lookup times were correct and in the correct order
    assert_log(group, candidate + '.cached() - Lookup Timings Test', () => {
        const times = [cached_duration_1, cached_duration_2, cached_duration_3, cached_duration_4, cached_duration_5];
        const sum = times.reduce((acc, curr) => acc + curr, 0);

        // The total duration of all lookups should be less than the time of 4 lookups
        // We do 2 fresh lookups with 2 delayed awaits of the same lookup delay + 1ms
        return sum <= (lookup_delay + 1) * 4;
    });

    // Assert that the CachedLookup.fresh() method returned the valid value and in valid time
    assert_log(
        group,
        candidate + '.fresh() - Lookup Values & Timings Test',
        () => fresh_value_1 !== cached_value_5 && fresh_duration_1 >= lookup_delay
    );

    // Assert that the CachedLookup.expire() method worked correctly
    assert_log(
        group,
        candidate + '.expire() - Lookup Values & Timings Test',
        () =>
            cached_value_5 !== cached_value_6 &&
            cached_value_6 === cached_value_7 &&
            cached_duration_6 >= lookup_delay &&
            cached_duration_7 < lookup_delay &&
            expire_attempt_1 &&
            !expire_attempt_2
    );

    // Assert that the CachedLookup cache values are expired
    await async_wait(
        lookup_delay * (lookup.options.auto_purge ? lookup.options.purge_age_factor : 1) + error_margin_ms
    );
    const args = Array.from(arguments);
    if (lookup.options.auto_purge) {
        assert_log(
            group,
            candidate + '.cached() - Cache Expiration/Cleanup Test',
            () =>
                lookup.cache.size === 0 && lookup.get(...args) === undefined && lookup.get(Math.random()) === undefined
        );
    } else {
        assert_log(
            group,
            candidate + '.cached() - Cache Retention Test',
            () =>
                lookup.cache.size === 1 && lookup.get(...args) !== undefined && lookup.get(Math.random()) === undefined
        );
    }

    // Determine if the CachedLookup instance is in flight by performing the second fresh lookup
    let in_flight_1 = lookup.in_flight(...arguments);
    let fresh_lookup_2_promise = with_duration(lookup.fresh(...arguments));
    let in_flight_2 = lookup.in_flight(...arguments);
    let in_flight_3 = lookup.in_flight(Math.random()); // This should be false
    await fresh_lookup_2_promise;

    // Assert that the CachedLookup.in_flight() method returned the correct values
    assert_log(
        group,
        candidate + '.in_flight() - Lookup States Test',
        () => !in_flight_1 && in_flight_2 && !in_flight_3
    );

    // Assert that the CachedLookup.updated_at() method returned the correct values
    assert_log(
        group,
        candidate + '.updated_at() - Cache Timestamps Test',
        () => updated_at_1 < updated_at_2 && updated_at_2 === updated_at_3
    );

    // Perform a rolling lookup test
    lookup.cache.clear();
    let rolling_start = Date.now();
    let rolling_lookup_1 = await lookup.rolling(lookup_delay, ...arguments);
    let rolling_finish_1 = Date.now() - rolling_start;

    rolling_start = Date.now();
    let rolling_lookup_2 = await lookup.rolling(lookup_delay, ...arguments);
    let rolling_finish_2 = Date.now() - rolling_start;

    await async_wait(lookup_delay + 1);
    rolling_start = Date.now();
    let rolling_lookup_3 = await lookup.rolling(lookup_delay, ...arguments);
    let rolling_finish_3 = Date.now() - rolling_start;

    await async_wait(lookup_delay + 1);
    rolling_start = Date.now();
    let rolling_lookup_4 = await lookup.rolling(lookup_delay, ...arguments);
    let rolling_finish_4 = Date.now() - rolling_start;

    // Assert that the CachedLookup.rolling() method returned the correct values
    assert_log(
        group,
        candidate + '.rolling() - Lookup Values Test',
        () =>
            // Ensure all the rolling lookup resolve times are constant and lower than the lookup delay
            rolling_finish_1 > lookup_delay &&
            rolling_finish_2 < lookup_delay &&
            rolling_finish_3 < lookup_delay &&
            rolling_finish_4 < lookup_delay &&
            // Ensure the values 1, 2, and 3 are same while 4 is different because value 3 should trigger the rolling lookup but resolve by the time 4 is called
            rolling_lookup_1 === rolling_lookup_2 &&
            rolling_lookup_2 === rolling_lookup_3 &&
            rolling_lookup_3 !== rolling_lookup_4
    );

    // Perform a clear test by setting random value and clearing
    await lookup.cached(lookup_delay, ...arguments);
    lookup.clear();
    assert_log(
        group,
        candidate + '.clear() - Cache Clear Test',
        () => lookup.cache.size === 0 && lookup.get(...args) === undefined
    );

    // Perform a test on the internal cache cleanup scheduler if auto_purge is enabled
    if (lookup.options.auto_purge) {
        await Promise.all([
            lookup.cached(lookup_delay * 3, Math.random()),
            lookup.cached(lookup_delay * 2, Math.random()),
            lookup.cached(lookup_delay, Math.random()),
        ]);
        assert_log(group, candidate + ' Cache Cleanup Scheduler Populated Test', () => lookup.cache.size === 3);

        // Wait for the cache cleanup scheduler to run and clear the cache
        await async_wait(
            lookup_delay * (lookup.options.auto_purge ? lookup.options.purge_age_factor : 1) * 4 + error_margin_ms
        );
        assert_log(group, candidate + ' Cache Cleanup Scheduler Cleared Test', () => lookup.cache.size === 0);
    }

    log('LOOKUP', 'Finished Testing CachedLookup');
    console.log('\n');
}

// Run tests with different argument sets
(async () => {
    // Run a test with no arguments
    await test_instance();

    // Run a test with 2 random arguments of supported types
    await test_instance(
        Math.random() > 0.5, // Boolean,
        Math.random() // Number
    );

    // Run a test with 4 random arguments of supported types
    await test_instance(
        Math.random() > 0.5, // Boolean,
        Math.random(), // Number
        crypto.randomUUID(), // String
        [
            // Array of supported argument types
            Math.random() > 0.5, // Boolean,
            Math.random(), // Number
            crypto.randomUUID(), // String
        ]
    );

    log('TESTING', 'Successfully Tested All Specified Tests For CachedLookup!');
    process.exit();
})();
