// battles/content/quiz.js — questions for skill quiz duels.
// { q, code?, options: [4], answer: index of the right option, difficulty, explain }
// The answer index never leaves the server until the round ends.

const Q = (difficulty, q, options, answer, explain, code) => ({ difficulty, q, options, answer, explain, ...(code ? { code } : {}) });

const QUIZ = {
    JavaScript: [
        Q('easy', 'What does this log?', ['"53"', '8', '"8"', 'NaN'], 0, '`+` with a string concatenates: "5" + 3 → "53".', `console.log("5" + 3);`),
        Q('easy', 'What does this log?', ['2', '"2"', '"53"', 'NaN'], 0, '`-` only works on numbers, so "5" is converted: 5 − 3 = 2.', `console.log("5" - 3);`),
        Q('easy', 'Which declaration can NOT be reassigned?', ['const', 'let', 'var', 'function'], 0, '`const` bindings can\'t be reassigned (though objects they point to can still change).'),
        Q('medium', 'What does this log?', ['3 3 3', '0 1 2', '0 0 0', 'undefined ×3'], 0, '`var` is function-scoped: all three callbacks share one `i`, which is 3 when they run.', `for (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i));\n}`),
        Q('medium', 'What is the order of the logs?', ['A C B', 'A B C', 'C A B', 'B A C'], 0, 'Synchronous code runs first (A, C); the `.then` callback is a microtask that runs after.', `console.log('A');\nPromise.resolve().then(() => console.log('B'));\nconsole.log('C');`),
        Q('medium', 'What is `typeof null`?', ['"object"', '"null"', '"undefined"', '"number"'], 0, 'A famous historical quirk: `typeof null === "object"`.'),
        Q('medium', 'What does `[1, 2, 3].map(parseInt)` return?', ['[1, NaN, NaN]', '[1, 2, 3]', '[NaN, NaN, NaN]', '[1, 2, NaN]'], 0, 'map passes (value, index): parseInt("2", 1) and parseInt("3", 2) are NaN.'),
        Q('easy', 'Which method creates a NEW array without changing the original?', ['map', 'push', 'splice', 'sort'], 0, '`map` returns a new array; push, splice and sort mutate in place.'),
        Q('hard', 'What does this log?', ['true false', 'false false', 'true true', 'false true'], 0, '`==` converts types (0 == "" is true); `===` doesn\'t.', `console.log(0 == "", 0 === "");`),
        Q('medium', 'What does `const { a, ...rest } = { a: 1, b: 2, c: 3 }` put in `rest`?', ['{ b: 2, c: 3 }', '[2, 3]', '{ a: 1, b: 2, c: 3 }', 'undefined'], 0, 'Object rest collects the remaining own properties into a new object.'),
        Q('hard', 'What does this log?', ['undefined', 'ReferenceError', '1', 'null'], 0, '`var x` is hoisted (declared) to the top of the function, but its value is assigned later.', `function f() {\n  console.log(x);\n  var x = 1;\n}\nf();`),
        Q('easy', 'How do you check that `value` is an array?', ['Array.isArray(value)', 'typeof value === "array"', 'value instanceof Object', 'value.isArray()'], 0, '`typeof []` is "object"; `Array.isArray` is the reliable check.')
    ],
    TypeScript: [
        Q('easy', 'What does the `?` in `name?: string` mean?', ['The property is optional', 'The value may be null', 'It is a private field', 'It is read-only'], 0, '`?` makes the property optional: its type becomes `string | undefined`.'),
        Q('medium', 'Which type accepts any value but forces you to narrow it before use?', ['unknown', 'any', 'never', 'object'], 0, '`unknown` is the type-safe counterpart of `any`.'),
        Q('medium', 'What is `never` used for?', ['Values that can never occur', 'Optional values', 'Functions returning nothing', 'Any object'], 0, '`never` is the empty type: e.g. a function that always throws, or an exhausted union.'),
        Q('easy', 'What does `readonly` on a property do?', ['Prevents reassigning it after creation', 'Hides it from JSON', 'Makes it private', 'Makes it optional'], 0, 'TypeScript reports an error if you assign to a readonly property.'),
        Q('medium', 'What is `Partial<User>`?', ['User with every property optional', 'Half of the User type', 'User without methods', 'A User or null'], 0, '`Partial<T>` maps every property of T to optional.'),
        Q('medium', 'What type does TypeScript infer for `x`?', ['string | number', 'any', 'string', 'unknown'], 0, 'The conditional can produce either branch, so the type is the union.', `const x = Math.random() > 0.5 ? "a" : 1;`),
        Q('hard', 'What does `keyof { id: number; name: string }` produce?', ['"id" | "name"', 'string', 'number | string', '["id", "name"]'], 0, '`keyof` gives the union of the property names as string literal types.'),
        Q('easy', 'Do TypeScript types exist when the JavaScript runs?', ['No, they are erased at compile time', 'Yes, they are checked at runtime', 'Only interfaces remain', 'Only enums are erased'], 0, 'Types are erased; runtime checks need real code (e.g. typeof, zod).'),
        Q('medium', 'What does `as const` do to `["a", "b"]`?', ['Makes it a readonly tuple of literal types', 'Converts it to an object', 'Freezes it at runtime', 'Nothing'], 0, '`as const` infers `readonly ["a", "b"]` instead of `string[]`.'),
        Q('hard', 'Which utility type removes `null` and `undefined` from a type?', ['NonNullable<T>', 'Required<T>', 'Exclude<T>', 'Defined<T>'], 0, '`NonNullable<string | null>` is `string`.'),
        Q('medium', 'What is a type guard?', ['A check that narrows a type in a branch', 'A compiler flag', 'A runtime type check library', 'A decorator'], 0, 'e.g. `if (typeof x === "string")` or a function returning `x is Foo`.'),
        Q('easy', 'Which file configures the TypeScript compiler?', ['tsconfig.json', 'package.json', 'ts.config.js', '.tsrc'], 0, '`tsconfig.json` holds compiler options like `strict` and `target`.')
    ],
    React: [
        Q('easy', 'What does `useState` return?', ['The value and a setter', 'Only the value', 'A ref object', 'A promise'], 0, '`const [value, setValue] = useState(initial)`.'),
        Q('easy', 'Why does each item in a list need a `key`?', ['So React can match items between renders', 'For CSS styling', 'For accessibility', 'It is only needed for forms'], 0, 'Keys let React keep the right state and DOM nodes for each item when the list changes.'),
        Q('medium', 'When does an effect with `[]` as dependencies run?', ['Once after the first render', 'After every render', 'Before the first render', 'Never'], 0, 'With an empty array it runs after mount (and its cleanup on unmount).'),
        Q('medium', 'After `setCount(count + 1)` three times in one click handler (count was 0), what is count?', ['1', '3', '0', '2'], 0, 'All three read the same `count` (0). Use `setCount(c => c + 1)` to add 3.'),
        Q('medium', 'Which hook keeps a value between renders WITHOUT causing a re-render when it changes?', ['useRef', 'useState', 'useMemo', 'useEffect'], 0, 'Changing `ref.current` doesn\'t trigger a render.'),
        Q('easy', 'How do you pass data from a parent to a child component?', ['Props', 'Context only', 'Refs', 'Global variables'], 0, 'Props are the normal way; context helps for deeply nested data.'),
        Q('hard', 'What does `useMemo` do?', ['Caches a computed value until its dependencies change', 'Memoizes a whole component', 'Stores state permanently', 'Prevents effects from running'], 0, '`useMemo(() => expensive(a), [a])` recomputes only when `a` changes. (`React.memo` is for components.)'),
        Q('medium', 'Why should you not mutate state arrays (e.g. `todos.push(x)`)?', ['React compares references, so it may not re-render', 'Arrays are frozen', 'It throws an error', 'It is slower'], 0, 'Create a new array: `setTodos([...todos, x])`.'),
        Q('easy', 'What is JSX?', ['A syntax that compiles to React.createElement calls', 'A separate templating language', 'A CSS-in-JS library', 'A type system'], 0, 'JSX is syntax sugar that a compiler turns into function calls.'),
        Q('hard', 'What does a function returned from `useEffect` do?', ['Cleans up before the next effect and on unmount', 'Runs before the effect', 'Returns a value to the component', 'Nothing'], 0, 'Use it to unsubscribe, clear timers or abort requests.'),
        Q('medium', 'What is a "controlled" input?', ['Its value comes from React state', 'It is disabled', 'It uses a ref', 'It validates itself'], 0, '`<input value={text} onChange={e => setText(e.target.value)} />`.'),
        Q('medium', 'Where do React hooks have to be called?', ['At the top level of components or custom hooks', 'Inside loops for each item', 'Only inside useEffect', 'Anywhere'], 0, 'Hooks rely on call order, so no conditions or loops around them.')
    ],
    'Node.js': [
        Q('easy', 'Which object holds environment variables in Node.js?', ['process.env', 'global.env', 'require("env")', 'os.env'], 0, 'e.g. `process.env.PORT`.'),
        Q('medium', 'What is the event loop for?', ['Running callbacks when async work completes', 'Spawning threads', 'Compiling JavaScript', 'Garbage collection'], 0, 'Node runs JS on one thread; the event loop picks up completed I/O callbacks.'),
        Q('easy', 'Which command installs exactly the versions in package-lock.json?', ['npm ci', 'npm install --latest', 'npm update', 'npm audit'], 0, '`npm ci` is the reproducible install for CI and Docker.'),
        Q('medium', 'In Express, what does calling `next()` in middleware do?', ['Passes control to the next middleware/route', 'Ends the response', 'Restarts the request', 'Skips all routes'], 0, 'Middleware must call `next()` (or send a response) or the request hangs.'),
        Q('medium', 'How do you read JSON request bodies in Express?', ['app.use(express.json())', 'req.json()', 'JSON.parse(req)', 'It works without anything'], 0, 'The body parser middleware fills `req.body`.'),
        Q('hard', 'Which runs first?', ['process.nextTick callback', 'setTimeout(fn, 0) callback', 'setImmediate callback', 'They are random'], 0, 'nextTick callbacks run before the event loop continues to timers.'),
        Q('easy', 'What does `require` return?', ['The module\'s module.exports', 'A file path', 'A promise', 'The module source code'], 0, '`module.exports` (or the `exports` shortcut) is what `require` hands back.'),
        Q('medium', 'Why prefer `fs.promises.readFile` over `fs.readFileSync` in a web server?', ['It doesn\'t block other requests', 'It reads faster', 'It supports more file types', 'Sync is deprecated'], 0, 'Sync calls block the single JS thread for every user.'),
        Q('medium', 'What does the `^` in "express": "^4.18.2" allow?', ['Any 4.x.y version ≥ 4.18.2', 'Exactly 4.18.2', 'Any newer major version', 'Only patch updates'], 0, 'Caret allows minor and patch updates within the same major version.'),
        Q('hard', 'What status code should an API return when a resource is created?', ['201', '200', '204', '302'], 0, '201 Created, ideally with a Location header.'),
        Q('easy', 'Which module creates an HTTP server without frameworks?', ['http', 'net/http', 'server', 'express'], 0, '`http.createServer((req, res) => …)`.'),
        Q('medium', 'What is a stream in Node.js?', ['Data processed in chunks as it arrives', 'A WebSocket', 'A worker thread', 'A cached file'], 0, 'Streams let you handle large data without loading it all into memory.')
    ],
    Python: [
        Q('easy', 'What does this print?', ['[1, 2, 3, 4]', '[1, 2, [3, 4]]', 'Error', '[4, 3, 2, 1]'], 0, '`extend` adds each item; `append` would add the list as one item.', `a = [1, 2]\na.extend([3, 4])\nprint(a)`),
        Q('easy', 'What is `7 // 2`?', ['3', '3.5', '4', '1'], 0, '`//` is floor division.'),
        Q('medium', 'What does `[x * 2 for x in range(4) if x % 2]` produce?', ['[2, 6]', '[0, 2, 4, 6]', '[0, 4]', '[1, 3]'], 0, 'Only odd x (1, 3) pass the filter, then doubled.'),
        Q('medium', 'Why is `def f(items=[])` a classic bug?', ['The same list is reused across calls', 'Lists can\'t be defaults', 'It is a syntax error', 'It makes items immutable'], 0, 'Defaults are evaluated once; use `items=None` and create a list inside.'),
        Q('easy', 'Which type is immutable?', ['tuple', 'list', 'dict', 'set'], 0, 'Tuples can\'t be changed after creation.'),
        Q('medium', 'What does `with open("f.txt") as f:` guarantee?', ['The file is closed afterwards', 'The file exists', 'The file is read-only', 'The file is locked'], 0, 'The context manager closes the file even if an error happens.'),
        Q('hard', 'What does this print?', ['[[1], [1], [1]]', '[[1], [], []]', '[[], [], []]', 'Error'], 0, '`[[]] * 3` repeats the SAME inner list three times.', `grid = [[]] * 3\ngrid[0].append(1)\nprint(grid)`),
        Q('easy', 'How do you get the value for key "a" or 0 if it is missing?', ['d.get("a", 0)', 'd["a"] or 0', 'd.find("a", 0)', 'd.value("a")'], 0, '`dict.get` returns the default instead of raising KeyError.'),
        Q('medium', 'What does `*args` collect in a function definition?', ['Extra positional arguments as a tuple', 'Keyword arguments as a dict', 'All arguments as a list', 'Only the first argument'], 0, '`**kwargs` collects keyword arguments.'),
        Q('hard', 'What does `is` compare?', ['Whether two names point to the same object', 'Values', 'Types', 'Hashes'], 0, 'Use `==` for values; `is` mainly for `None`.'),
        Q('medium', 'What is a virtual environment for?', ['Separate package installs per project', 'Running Python in the browser', 'Faster execution', 'Type checking'], 0, '`python -m venv .venv` keeps each project\'s dependencies apart.'),
        Q('easy', 'What does `len("héllo")` return?', ['5', '6', '4', 'Error'], 0, 'Python strings count characters (code points), not bytes.')
    ],
    SQL: [
        Q('easy', 'Which clause filters groups after GROUP BY?', ['HAVING', 'WHERE', 'FILTER', 'ORDER BY'], 0, 'WHERE filters rows before grouping; HAVING filters the groups.'),
        Q('medium', 'A LEFT JOIN returns…', ['All left rows, with matches from the right (or NULL)', 'Only matching rows', 'All rows from both tables', 'Only unmatched left rows'], 0, 'Unmatched right-side columns come back as NULL.'),
        Q('easy', 'Which query counts rows in `users`?', ['SELECT COUNT(*) FROM users', 'SELECT SUM(*) FROM users', 'COUNT users', 'SELECT LENGTH(users)'], 0, '`COUNT(*)` counts rows.'),
        Q('medium', 'What does `WHERE email = NULL` return?', ['No rows', 'Rows with no email', 'All rows', 'An error'], 0, 'Comparisons with NULL are unknown; use `IS NULL`.'),
        Q('medium', 'What does an index mainly speed up?', ['Finding rows by the indexed columns', 'Inserting rows', 'Deleting tables', 'Backups'], 0, 'Reads get faster; writes get slightly slower.'),
        Q('hard', 'What does `COUNT(col)` skip that `COUNT(*)` doesn\'t?', ['Rows where col is NULL', 'Duplicate values', 'Rows with zeros', 'Nothing'], 0, 'COUNT(col) counts non-NULL values.'),
        Q('medium', 'How do you prevent SQL injection?', ['Use parameterized queries', 'Escape quotes by hand', 'Use uppercase keywords', 'Limit query length'], 0, 'Placeholders (`?`, `$1`) keep data separate from the SQL text.'),
        Q('easy', 'Which keyword removes duplicate rows from results?', ['DISTINCT', 'UNIQUE', 'DIFFERENT', 'SINGLE'], 0, '`SELECT DISTINCT city FROM users`.'),
        Q('hard', 'What does a transaction guarantee?', ['All its statements succeed or none do', 'Faster queries', 'Automatic backups', 'Row-level security'], 0, 'Atomicity: COMMIT applies everything, ROLLBACK nothing.'),
        Q('medium', 'Which window function numbers rows within each group?', ['ROW_NUMBER() OVER (PARTITION BY …)', 'COUNT() GROUP BY', 'RANK BY', 'NUMBER()'], 0, 'Window functions keep every row while computing per-group values.'),
        Q('easy', 'Which statement changes existing rows?', ['UPDATE', 'ALTER', 'INSERT', 'MODIFY'], 0, '`ALTER` changes the table structure, not the data.'),
        Q('hard', 'What is a foreign key?', ['A column that must match a key in another table', 'An encrypted column', 'A primary key from another database', 'A unique index'], 0, 'It enforces relationships, e.g. orders.user_id → users.id.')
    ],
    MongoDB: [
        Q('easy', 'What does MongoDB store records as?', ['Documents (BSON)', 'Rows', 'Key-value strings only', 'XML'], 0, 'Documents are JSON-like objects in collections.'),
        Q('easy', 'Which field does every document have by default?', ['_id', 'id', 'key', 'uuid'], 0, '`_id` is the primary key, an ObjectId by default.'),
        Q('medium', 'Which operator matches values in a list?', ['$in', '$any', '$contains', '$list'], 0, '`{ status: { $in: ["a", "b"] } }`.'),
        Q('medium', 'What does `$inc` do in an update?', ['Increases a number atomically', 'Inserts a document', 'Includes a field in results', 'Creates an index'], 0, '`{ $inc: { views: 1 } }` avoids read-modify-write races.'),
        Q('hard', 'What is the aggregation pipeline?', ['A sequence of stages that transform documents', 'A replication setup', 'A backup tool', 'A sharding key'], 0, 'Stages like $match, $group, $sort, $project.'),
        Q('medium', 'What does `$push` do?', ['Appends to an array field', 'Inserts a new document', 'Moves a document', 'Sends a notification'], 0, '`$addToSet` appends only if the value isn\'t already there.'),
        Q('easy', 'Which method finds one document?', ['findOne', 'getOne', 'selectOne', 'first'], 0, '`db.users.findOne({ email })`.'),
        Q('hard', 'Why add an index on a field you query a lot?', ['To avoid scanning every document', 'To make it unique', 'To encrypt it', 'To save disk space'], 0, 'Without an index MongoDB does a collection scan.'),
        Q('medium', 'What does `upsert: true` do?', ['Inserts when nothing matches the update', 'Updates every document', 'Undoes the last update', 'Updates only if newer'], 0, 'Update-or-insert in one operation.'),
        Q('medium', 'What does a projection like `{ password: 0 }` do?', ['Leaves the password field out of results', 'Deletes the password', 'Sorts by password', 'Encrypts the password'], 0, 'Projections choose which fields come back.'),
        Q('easy', 'Which library is the popular Node.js ODM for MongoDB?', ['Mongoose', 'Sequelize', 'Prisma Mongo', 'Knex'], 0, 'Mongoose adds schemas, validation and models.'),
        Q('hard', 'What does `$lookup` do?', ['Joins documents from another collection', 'Searches text', 'Looks up an index', 'Finds duplicates'], 0, 'It is the aggregation stage for left-outer-join-like lookups.')
    ],
    Git: [
        Q('easy', 'Which command stages changes for the next commit?', ['git add', 'git commit', 'git push', 'git stage-all'], 0, '`git add` moves changes to the staging area.'),
        Q('easy', 'What does `git pull` do?', ['Fetches and merges remote changes', 'Uploads your commits', 'Creates a branch', 'Deletes local changes'], 0, '`git pull` = `git fetch` + `git merge` (or rebase).'),
        Q('medium', 'How do you undo the last commit but keep its changes?', ['git reset --soft HEAD~1', 'git reset --hard HEAD~1', 'git revert --all', 'git checkout HEAD'], 0, '`--soft` moves the branch back and keeps changes staged.'),
        Q('medium', 'What does `git stash` do?', ['Temporarily shelves uncommitted changes', 'Deletes a branch', 'Squashes commits', 'Pushes to a backup'], 0, '`git stash pop` brings them back.'),
        Q('medium', 'What is the difference between merge and rebase?', ['Rebase rewrites commits onto a new base; merge adds a merge commit', 'They are identical', 'Merge deletes history', 'Rebase only works on main'], 0, 'Rebase gives linear history but rewrites commits.'),
        Q('easy', 'Which file lists paths Git should ignore?', ['.gitignore', '.gitkeep', '.ignore', 'git.config'], 0, 'e.g. node_modules/ and .env.'),
        Q('hard', 'What does `git revert <commit>` do?', ['Creates a new commit that undoes it', 'Deletes the commit from history', 'Moves HEAD to it', 'Restores a deleted branch'], 0, 'Safe for shared branches: history isn\'t rewritten.'),
        Q('medium', 'What is a merge conflict?', ['Both branches changed the same lines', 'A failed push', 'A missing remote', 'A detached HEAD'], 0, 'Git asks you to choose between the <<<<<<< sections.'),
        Q('easy', 'Which command creates and switches to a new branch?', ['git switch -c feature', 'git branch --go feature', 'git new feature', 'git checkout feature --create'], 0, '`git checkout -b feature` works too.'),
        Q('hard', 'What does "detached HEAD" mean?', ['HEAD points at a commit, not a branch', 'The repo is corrupted', 'The remote is gone', 'You have no commits'], 0, 'New commits there aren\'t on any branch unless you create one.'),
        Q('medium', 'Why should you never commit a .env file?', ['It usually contains secrets', 'Git can\'t store it', 'It breaks builds', 'It is too large'], 0, 'Secrets in history are hard to remove; rotate them if leaked.'),
        Q('medium', 'What does `git log --oneline` show?', ['One line per commit: short hash and message', 'Only the last commit', 'Changed lines', 'Branch names only'], 0, 'A compact history view.')
    ],
    Docker: [
        Q('easy', 'What is the difference between an image and a container?', ['A container is a running instance of an image', 'They are the same', 'An image runs; a container is a file', 'Containers are only for Windows'], 0, 'Images are templates; containers are processes created from them.'),
        Q('easy', 'Which file describes how to build an image?', ['Dockerfile', 'docker.json', 'compose.yml', 'image.txt'], 0, 'docker-compose.yml describes multi-container setups instead.'),
        Q('medium', 'Why copy package.json and install BEFORE copying the rest of the code?', ['So the install layer is cached when only code changes', 'npm needs it first', 'It makes the image smaller', 'Docker requires that order'], 0, 'Layer caching: unchanged layers are reused.'),
        Q('medium', 'What does `-p 8080:3000` do?', ['Maps host port 8080 to container port 3000', 'Maps container 8080 to host 3000', 'Opens both ports', 'Sets the process ID'], 0, 'Format is host:container.'),
        Q('medium', 'How do you keep database data when a container is removed?', ['Use a volume', 'Use a bigger image', 'Use --restart always', 'Commit the container'], 0, 'Volumes live outside the container\'s writable layer.'),
        Q('hard', 'What is a multi-stage build for?', ['Building in one stage and shipping a smaller final image', 'Running several containers', 'Building for several OSes', 'Parallel builds'], 0, 'Copy only the build output into a slim final stage.'),
        Q('easy', 'Which command lists running containers?', ['docker ps', 'docker ls', 'docker images', 'docker run --list'], 0, '`docker ps -a` also shows stopped ones.'),
        Q('medium', 'What does `.dockerignore` do?', ['Excludes files from the build context', 'Ignores failed builds', 'Hides containers', 'Skips layers'], 0, 'Keeps node_modules, .git and secrets out of the build.'),
        Q('hard', 'What is the difference between CMD and ENTRYPOINT?', ['ENTRYPOINT is the fixed command; CMD gives default arguments', 'They are identical', 'CMD runs at build time', 'ENTRYPOINT only works in compose'], 0, 'CMD is easily overridden by `docker run image other-cmd`.'),
        Q('medium', 'Why run containers as a non-root user?', ['To limit damage if the app is compromised', 'For speed', 'Docker requires it', 'To use less memory'], 0, 'Least privilege: `USER node` in the Dockerfile.'),
        Q('easy', 'What does `docker compose up` do?', ['Starts all services defined in the compose file', 'Updates Docker', 'Builds one image', 'Uploads images'], 0, 'Add `-d` to run in the background.'),
        Q('medium', 'Why use `node:20-alpine` instead of `node:20`?', ['Alpine images are much smaller', 'Alpine is faster at runtime', 'It includes more tools', 'It is required for Node 20'], 0, 'Smaller images download and start faster.')
    ],
    HTML: [
        Q('easy', 'Which element should contain the main navigation links?', ['<nav>', '<menu>', '<navigation>', '<links>'], 0, 'Semantic elements help screen readers and SEO.'),
        Q('easy', 'Which attribute gives an image a text alternative?', ['alt', 'title', 'caption', 'desc'], 0, 'Screen readers read `alt`; use alt="" for decorative images.'),
        Q('medium', 'What does `<label for="email">` connect to?', ['The input with id="email"', 'The input with name="email"', 'Any email input', 'The form'], 0, 'Clicking the label focuses the input, and screen readers announce it.'),
        Q('medium', 'Which input type shows a numeric keypad on phones and validates numbers?', ['type="number"', 'type="digits"', 'type="text" pattern', 'type="numeric"'], 0, 'Or `inputmode="numeric"` for digits that aren\'t quantities (like PINs).'),
        Q('easy', 'How many <h1> headings should a page usually have?', ['One main heading', 'One per section, minimum three', 'None', 'As many as you like for SEO'], 0, 'One clear main heading, then h2/h3 for structure.'),
        Q('medium', 'What does the `defer` attribute on a script do?', ['Runs it after the HTML is parsed, in order', 'Runs it immediately', 'Loads it only on click', 'Disables it'], 0, '`async` runs as soon as loaded, not in order.'),
        Q('hard', 'Which element is right for a clickable action that isn\'t navigation?', ['<button>', '<a href="#">', '<div onclick>', '<span role="link">'], 0, 'Buttons are keyboard-accessible and announced correctly.'),
        Q('easy', 'Which tag makes a link open in a new tab?', ['<a target="_blank">', '<a new>', '<a tab="new">', '<link>'], 0, 'Add rel="noopener" (modern browsers do it by default).'),
        Q('medium', 'What is the `<meta name="viewport">` tag for?', ['Making the page scale correctly on phones', 'SEO keywords', 'Setting the page title', 'Loading fonts'], 0, '`width=device-width, initial-scale=1`.'),
        Q('medium', 'Which element groups form fields with a caption?', ['<fieldset> with <legend>', '<group>', '<section> with <h2>', '<formgroup>'], 0, 'Useful for radio groups.'),
        Q('hard', 'What does the `required` attribute do?', ['Blocks form submission until the field is filled', 'Adds a red border', 'Validates on the server', 'Makes the field read-only'], 0, 'Built-in validation; always validate on the server too.'),
        Q('easy', 'Which element is for a self-contained article or post?', ['<article>', '<post>', '<section>', '<content>'], 0, '<section> groups related content; <article> stands on its own.')
    ],
    CSS: [
        Q('easy', 'Which property makes a flex container stack its children vertically?', ['flex-direction: column', 'align-items: column', 'display: vertical', 'flex-wrap: column'], 0, 'The default direction is row.'),
        Q('medium', 'Which selector is more specific?', ['#header .title', '.header .title', 'header .title', 'div.title'], 0, 'IDs outweigh classes, which outweigh element names.'),
        Q('medium', 'What does `box-sizing: border-box` change?', ['Width includes padding and border', 'Adds a border', 'Removes margins', 'Makes boxes inline'], 0, 'Makes sizing predictable; most resets set it everywhere.'),
        Q('easy', 'How do you center a block horizontally with a fixed width?', ['margin: 0 auto', 'text-align: center', 'align: center', 'float: center'], 0, 'Or use flexbox / grid centering.'),
        Q('medium', 'What is `position: absolute` positioned relative to?', ['The nearest positioned ancestor', 'The viewport always', 'Its parent always', 'The body'], 0, 'A "positioned" ancestor has position other than static.'),
        Q('hard', 'What does `1fr` mean in grid-template-columns?', ['One share of the remaining space', '1 font size', '1 frame', '1% of the width'], 0, '`1fr 2fr` splits free space 1:2.'),
        Q('medium', 'Which unit is relative to the root font size?', ['rem', 'em', 'px', 'vh'], 0, '`em` is relative to the element\'s own font size.'),
        Q('easy', 'Which property controls the space INSIDE an element\'s border?', ['padding', 'margin', 'gap', 'spacing'], 0, 'Margin is outside the border.'),
        Q('medium', 'How do you apply styles only on screens narrower than 600px?', ['@media (max-width: 600px)', '@screen small', '@media (width < 600)', ':mobile { }'], 0, 'Range syntax `(width < 600px)` is newer but also supported now.'),
        Q('hard', 'Which creates a new stacking context?', ['opacity: 0.9', 'display: block', 'margin: 10px', 'color: red'], 0, 'Also transforms, position + z-index, filters…'),
        Q('medium', 'What does `gap` do in flexbox and grid?', ['Sets space between items', 'Sets outer margin', 'Adds a border gap', 'Hides overflow'], 0, 'No more margin hacks between items.'),
        Q('easy', 'How do you select every element with class "card"?', ['.card', '#card', 'card', '*card'], 0, '`#` is for ids.')
    ],
    Linux: [
        Q('easy', 'Which command lists files including hidden ones?', ['ls -a', 'ls -h', 'dir /all', 'list --hidden'], 0, 'Hidden files start with a dot.'),
        Q('easy', 'Which command shows the current directory?', ['pwd', 'cwd', 'dir', 'where'], 0, 'Print Working Directory.'),
        Q('medium', 'What does `chmod +x script.sh` do?', ['Makes the file executable', 'Deletes it', 'Changes its owner', 'Hides it'], 0, 'Then run it with ./script.sh.'),
        Q('medium', 'What does the `|` operator do?', ['Sends one command\'s output into another', 'Runs commands in parallel', 'Logical OR', 'Redirects to a file'], 0, 'e.g. `cat log | grep ERROR`.'),
        Q('medium', 'What is the difference between `>` and `>>`?', ['> overwrites the file; >> appends', 'They are identical', '>> overwrites; > appends', '> is for errors'], 0, '`2>` redirects errors.'),
        Q('easy', 'Which command searches text in files?', ['grep', 'find', 'seek', 'look'], 0, '`find` searches for files by name/attributes.'),
        Q('hard', 'What does `kill -9 <pid>` send?', ['SIGKILL: stop immediately, no cleanup', 'SIGTERM: ask nicely', 'SIGHUP: reload', 'SIGINT: Ctrl+C'], 0, 'Try plain `kill` (SIGTERM) first.'),
        Q('medium', 'Which command shows running processes live?', ['top', 'ps live', 'proc', 'tasks'], 0, '`htop` is a friendlier alternative.'),
        Q('medium', 'What does `sudo` do?', ['Runs a command as another user (usually root)', 'Shuts down the system', 'Switches directory', 'Updates packages'], 0, '"superuser do".'),
        Q('hard', 'What does `$?` contain in a shell?', ['The exit code of the last command', 'The current PID', 'The last argument', 'The script name'], 0, '0 means success.'),
        Q('easy', 'Which key combination stops a running command in the terminal?', ['Ctrl+C', 'Ctrl+Z', 'Ctrl+D', 'Esc'], 0, 'Ctrl+Z suspends it instead; Ctrl+D sends end-of-input.'),
        Q('medium', 'What does `tail -f app.log` do?', ['Shows new lines as they are written', 'Shows the first lines', 'Deletes old lines', 'Formats the log'], 0, 'Great for watching logs live.')
    ]
};

const SKILLS = Object.keys(QUIZ);

module.exports = { QUIZ, SKILLS };
