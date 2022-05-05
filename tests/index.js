// Retrieve all test scenarios
const run_general_tests = require('./scenarios/general.js');

// Run all test scenarios
(async () => {
    // Run all test scenarios
    await run_general_tests();
})();
