const CachedLookup = require('../../index.js');

const { async_wait } = require('../operators.js');

async function run_general_tests(options = {}) {
    // Destructure options
    const { num_argument_sets = 10, num_arguments = 20 } = options;

    // Create a new CachedLookup instance
    const instance = new CachedLookup(async (arg1, arg2, arg3, arg4, arg5) => {
        // Return the timestamp so timing can be measured
        await async_wait(1);
        return [arg1, arg2, arg3, arg4, arg5].join(':') + ':' + Date.now();
    });

    // Generate random argument sets
    const argument_sets = [[]];
    for (let i = 0; i < num_argument_sets; i++) {
        // Generate random argument sets
        const argument_set = [];
        for (let j = 0; j < num_arguments; j++) {
            // Generate random boolean
            let argument = Math.random() > 0.5;
            if (Math.random() > 0.5) {
                // Generate a random number
                argument = Math.random();
            } else if (!argument) {
                // Generate random string
                argument = Math.random().toString();
            }

            // Push the argument to the argument set
            argument_set.push(argument);
        }

        // Add the argument set to the list of argument sets - prevent duplicates
        if (!argument_sets.find((set) => set.join(',') === argument_set.join(','))) argument_sets.push(argument_set);
    }

    // Retrieve the values for each argument set
    const values = await Promise.all(argument_sets.map((args) => instance.cached(1000, ...args)));
    console.log(instance.cache);

    // Add a 10ms delay to to test timing and caching in next tests
    await async_wait(10);

    // Check the internal cache values for each argument set
    for (let i = 0; i < num_argument_sets; i++) {
        // Validate the internal cache value for each argument set
        const args = argument_sets[i];
        const cached_value = values[i];
        if (instance.cache[instance._arguments_to_identifier(args)].value !== values[i]) {
            throw new Error('CachedLookup.cached(max_age) -> Cache value does not match expected value.');
        }

        // Validate the instant and future timing for each value
        const [instant, cached, cached2] = await Promise.all([
            instance.cached(5, ...args), // This will become a fresh resolve
            instance.cached(1000, ...args),
            instance.cached(500, ...args),
        ]);
        if (instant === cached || cached !== cached2 || cached !== cached_value)
            throw new Error(
                'CachedLookup.cached(max_age) -> Cached value should not be the same as the instant value.'
            );

        // Validate that the internal cache value was updated after the instant value
        if (instance.cache[instance._arguments_to_identifier(args)].value !== instant)
            throw new Error('CachedLookup.cached(max_age) -> Cache value should be updated after the instant value.');
    }
}

module.exports = run_general_tests;
