// Pre-builds the sandbox environment images (otherwise each is built on first use).
// Usage: npm run sandbox:build            -> all environments
//        npm run sandbox:build -- node ml -> only those
const { ENVIRONMENTS } = require('../sandbox/config');
const driver = require('../sandbox/dockerDriver');

(async () => {
    if (!(await driver.isAvailable())) {
        console.error('Docker is not reachable. Start Docker and try again.');
        process.exit(1);
    }
    const wanted = process.argv.slice(2);
    const ids = wanted.length ? wanted : Object.keys(ENVIRONMENTS);
    for (const id of ids) {
        console.log(`\n=== ${id}`);
        const image = await driver.ensureImage(id, (line) => console.log(line));
        console.log(`✅ ${image}`);
    }
})().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
