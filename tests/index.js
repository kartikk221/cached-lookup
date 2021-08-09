const CachedLookup = require('../index.js');
const RESULT_VALUE = 'Hello World';
const LOOKUP_PARAMETER = 'SOME_PARAMETER1';
const LOOKUP_PARAMETER_2 = 'SOME_PARAMETER2';
const LOOKUP_DELAY = 500;
const LOOKUP_CACHED_DMAX = LOOKUP_DELAY * 0.1;

function log(message, prefix = 'TESTS') {
    console.log(`[${prefix}] ${message}`);
}

function async_wait(time_msecs) {
    return new Promise((resolve, reject) => {
        setTimeout((res) => res(), time_msecs, resolve);
    });
}

async function simulated_lookup(value) {
    await async_wait(LOOKUP_DELAY);
    return value;
}

async function fresh_lookup_test(instance) {
    log(
        `[FRESH_LOOKUP] Performing Initial Lookup - Expecting ${LOOKUP_DELAY}ms Delay As This is a Fresh Lookup...`
    );

    const start_time = Date.now();
    let lookup_result = await instance.get(LOOKUP_PARAMETER, LOOKUP_PARAMETER_2);

    // Check for correct resolved value
    if (lookup_result !== RESULT_VALUE)
        throw new Error(
            'Failed FRESH_LOOKUP Test Due To Mismatching Resolved Values Than Simulated Value!'
        );

    // Check for correct elasped time to ensure simulated lookup was called
    if (Date.now() - start_time < LOOKUP_DELAY)
        throw new Error(
            'Failed FRESH_LOOKUP Test Due To The Lookup Time Being Less Than Expected Simulated Delay!'
        );

    log('[FRESH_LOOKUP] Successfully Passed Fresh Lookups Test!');
}

async function cached_lookups_test(instance, count) {
    log(
        `[CACHED_LOOKUPS] Performing Multiple Lookups - Expecting Instantaneous Resolves From Cache...`
    );

    for (let i = 0; i < count; i++) {
        (async () => {
            let start_ts = Date.now();
            let lookup_result = await instance.get(LOOKUP_PARAMETER, LOOKUP_PARAMETER_2);

            // Check for correct resolved value
            if (lookup_result !== RESULT_VALUE)
                throw new Error(
                    'Failed FRESH_LOOKUP Test Due To Mismatching Resolved Values Than Simulated Value!'
                );

            // Check for correct elasped time to ensure resolved value was from cache
            if (Date.now() - start_ts > LOOKUP_CACHED_DMAX)
                throw new Error(
                    'Encountered High Lookup Time For Expected Cached Lookups Which Should Be Extremely Fast!'
                );
        })();
    }

    log(`[CACHED_LOOKUPS] Successfully Passed Cached Lookups Test @ ${count} Iterations!`);
}

(async () => {
    log('Creating CachedLookup Instance With Lifetime Of 1000 Milliseconds...');
    const instance = new CachedLookup({
        lifetime: 1000,
    });

    // Set test lookup handler with parameter check
    instance.set_lookup_handler((param1, param2) => {
        if (param1 !== LOOKUP_PARAMETER || param2 !== LOOKUP_PARAMETER_2)
            throw new Error('Specified Lookup Parameter Do Not Match Expected Parameters!');

        return simulated_lookup(RESULT_VALUE);
    });

    await fresh_lookup_test(instance);
    await cached_lookups_test(instance, 100);

    log('[WAITING] Waiting 1050ms For Cache To Expire...');
    await async_wait(1050);

    log('[QUEUED_LOOKUP] Performing 5 Concurrent Fresh Lookups To Test Queued Lookups...');
    await Promise.all([
        fresh_lookup_test(instance),
        fresh_lookup_test(instance),
        fresh_lookup_test(instance),
        fresh_lookup_test(instance),
        fresh_lookup_test(instance),
    ]);

    log('[CACHED_LOOKUP_2] Performing Final Cached Lookups Test...');
    await cached_lookups_test(instance, 100);
})();
