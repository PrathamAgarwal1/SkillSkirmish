// battles/content/bugs.js — CodeGuessr "Bug Locator": a file plus an error report; click the line
// that causes it. Score by how many lines away you were.
//
// Write each bug's line with a trailing ⟦bug⟧ marker; it's stripped and turned into the answer.
const MARK = '⟦bug⟧';

const raw = [
    {
        id: 'fetch-json', language: 'javascript', difficulty: 'easy',
        error: "TypeError: Cannot read properties of undefined (reading 'map')\n    at loadUsers (users.js:16)",
        explain: '`res.json()` returns a Promise. Without `await`, `data` is a Promise, so `data.users` is undefined.',
        code: `// users.js
import { renderTable } from './table.js';

const API = '/api/users';

function toRow(user) {
  return [user.id, user.name, user.email];
}

async function loadUsers() {
  const res = await fetch(API);
  if (!res.ok) {
    throw new Error('Request failed: ' + res.status);
  }
  const data = res.json();${MARK}
  return data.users.map(toRow);
}

loadUsers().then(renderTable);`
    },
    {
        id: 'off-by-one-loop', language: 'javascript', difficulty: 'easy',
        error: "TypeError: Cannot read properties of undefined (reading 'price')\n    at cartTotal (cart.js:9)",
        explain: 'The loop runs while `i <= items.length`, one step past the last item.',
        code: `// cart.js
const TAX = 0.08;

function cartTotal(items) {
  if (!items.length) return 0;

  let total = 0;
  for (let i = 0; i <= items.length; i++) {${MARK}
    total += items[i].price * items[i].qty;
  }
  return Math.round(total * (1 + TAX) * 100) / 100;
}

module.exports = { cartTotal };`
    },
    {
        id: 'react-state-mutation', language: 'javascript', difficulty: 'medium',
        error: 'Bug report: clicking "Add" adds the todo to the array, but the list on screen never updates.',
        explain: 'The array is mutated in place and the same reference is passed to `setTodos`, so React sees no change. Use `setTodos([...todos, text])`.',
        code: `import { useState } from 'react';

export default function Todos() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');

  function add() {
    if (!text.trim()) return;
    todos.push(text);${MARK}
    setTodos(todos);
    setText('');
  }

  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={add}>Add</button>
      <ul>
        {todos.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}`
    },
    {
        id: 'react-effect-loop', language: 'javascript', difficulty: 'medium',
        error: 'Warning: Maximum update depth exceeded. The page freezes after loading the profile.',
        explain: 'The effect has no dependency array, so it runs after every render, sets state, renders again... forever. Add `[userId]`.',
        code: `import { useEffect, useState } from 'react';

export function Profile({ userId }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(\`/api/users/\${userId}\`)
      .then((r) => r.json())
      .then(setUser)
      .catch((e) => setError(e.message));
  });${MARK}

  if (error) return <p>{error}</p>;
  if (!user) return <p>Loading…</p>;
  return <h1>{user.name}</h1>;
}`
    },
    {
        id: 'express-missing-await', language: 'javascript', difficulty: 'medium',
        error: 'GET /api/orders/42 → 200 {}  (expected the order with its items)',
        explain: '`Order.findById` returns a Promise. Without `await`, the handler serializes the Promise itself, which becomes `{}`.',
        code: `const express = require('express');
const Order = require('./models/Order');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const order = Order.findById(req.params.id).populate('items');${MARK}
    if (!order) {
      return res.status(404).json({ msg: 'Not found' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;`
    },
    {
        id: 'express-headers-sent', language: 'javascript', difficulty: 'medium',
        error: 'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client\n    at login (auth.js:17)',
        explain: 'The 401 response is sent but the function keeps going; it needs `return res.status(401)...`.',
        code: `// auth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ msg: 'Wrong email or password' });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    res.status(401).json({ msg: 'Wrong email or password' });${MARK}
  }
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  res.json({ token });
}

module.exports = { login };`
    },
    {
        id: 'js-this-callback', language: 'javascript', difficulty: 'hard',
        error: "TypeError: Cannot read properties of undefined (reading 'count')\n    at tick (timer.js:13)",
        explain: '`setInterval(this.tick, …)` passes the method without its object, so `this` is undefined inside `tick`. Use an arrow function or `.bind(this)`.',
        code: `// timer.js
class Timer {
  constructor(label) {
    this.label = label;
    this.count = 0;
  }

  start() {
    this.handle = setInterval(this.tick, 1000);${MARK}
  }

  tick() {
    this.count += 1;
    console.log(\`\${this.label}: \${this.count}s\`);
  }

  stop() {
    clearInterval(this.handle);
  }
}

new Timer('build').start();`
    },
    {
        id: 'js-sort-numbers', language: 'javascript', difficulty: 'easy',
        error: 'Test failed: topScores([5, 40, 100, 3]) → expected [100, 40, 5], got [5, 40, 3]',
        explain: '`sort()` without a comparator sorts as strings ("100" < "3" < "40" < "5"). Use `sort((a, b) => b - a)`.',
        code: `// scores.js
function topScores(scores, n = 3) {
  const copy = [...scores];
  copy.sort().reverse();${MARK}
  return copy.slice(0, n);
}

function average(scores) {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

module.exports = { topScores, average };`
    },
    {
        id: 'py-mutable-default', language: 'python', difficulty: 'medium',
        error: "Bug report: each new Cart() starts with the previous cart's items.\n>>> Cart().items\n['apple', 'pear']",
        explain: 'Default arguments are created once. Every Cart shares the same list; use `items=None` and create a new list inside.',
        code: `class Cart:
    def __init__(self, owner, items=[]):${MARK}
        self.owner = owner
        self.items = items

    def add(self, item):
        self.items.append(item)

    def total(self, prices):
        return sum(prices[i] for i in self.items)


a = Cart("ann")
a.add("apple")
a.add("pear")
b = Cart("bob")
print(b.items)`
    },
    {
        id: 'py-integer-division', language: 'python', difficulty: 'easy',
        error: 'AssertionError: average([1, 2]) == 1.5, got 1',
        explain: '`//` is floor division. Use `/` for a true average.',
        code: `def average(values):
    if not values:
        return 0
    return sum(values) // len(values)${MARK}


def median(values):
    s = sorted(values)
    mid = len(s) // 2
    if len(s) % 2:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2


assert average([1, 2]) == 1.5`
    },
    {
        id: 'py-key-error', language: 'python', difficulty: 'easy',
        error: "Traceback (most recent call last):\n  File \"stats.py\", line 14, in <module>\n  File \"stats.py\", in count_words\nKeyError: 'the'",
        explain: 'The first time a word appears it isn\'t in the dict yet. Use `counts.get(word, 0) + 1` or a defaultdict.',
        code: `import re


def count_words(text):
    counts = {}
    for word in re.findall(r"[a-z']+", text.lower()):
        counts[word] += 1${MARK}
    return counts


if __name__ == "__main__":
    text = open("book.txt").read()
    top = sorted(count_words(text).items(), key=lambda kv: -kv[1])
    print(top[:10])`
    },
    {
        id: 'py-loop-remove', language: 'python', difficulty: 'hard',
        error: 'Test failed: remove_negatives([-1, -2, 3]) → expected [3], got [-2, 3]',
        explain: 'Removing items from a list while iterating over it skips the next element. Build a new list instead.',
        code: `def remove_negatives(nums):
    for n in nums:
        if n < 0:
            nums.remove(n)${MARK}
    return nums


def clamp_all(nums, lo, hi):
    return [max(lo, min(hi, n)) for n in nums]


print(remove_negatives([-1, -2, 3]))`
    },
    {
        id: 'sql-where-aggregate', language: 'sql', difficulty: 'medium',
        error: 'ERROR: aggregate functions are not allowed in WHERE',
        explain: 'Filters on aggregates (`SUM(...)`) belong in `HAVING`, after `GROUP BY`.',
        code: `-- Customers who spent more than $1,000
SELECT c.id, c.name, SUM(o.total) AS spent
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE SUM(o.total) > 1000${MARK}
GROUP BY c.id, c.name
ORDER BY spent DESC;`
    },
    {
        id: 'sql-left-join-filter', language: 'sql', difficulty: 'hard',
        error: 'Bug report: the report should list ALL users with their 2024 order count (0 if none), but users without 2024 orders are missing.',
        explain: 'Filtering the right table in `WHERE` turns the LEFT JOIN into an inner join. Move the date condition into the `ON` clause.',
        code: `SELECT u.id,
       u.email,
       COUNT(o.id) AS orders_2024
FROM users u
LEFT JOIN orders o
  ON o.user_id = u.id
WHERE o.created_at >= '2024-01-01'${MARK}
GROUP BY u.id, u.email
ORDER BY orders_2024 DESC;`
    },
    {
        id: 'ts-optional-chaining', language: 'typescript', difficulty: 'medium',
        error: "TypeError: Cannot read properties of null (reading 'city')\n    at formatAddress (address.ts)",
        explain: '`user.address` can be null (it\'s typed `Address | null`), but line 12 reads `.city` without checking.',
        code: `interface Address {
  street: string;
  city: string;
}

interface User {
  name: string;
  address: Address | null;
}

export function formatAddress(user: User): string {
  const city = user.address!.city;${MARK}
  const street = user.address?.street ?? '';
  return street ? \`\${street}, \${city}\` : city;
}`
    },
    {
        id: 'java-string-equals', language: 'java', difficulty: 'easy',
        error: 'Bug report: logging in as "admin" never shows the admin panel, even with the right role.',
        explain: '`==` compares object references in Java. Strings must be compared with `.equals()`.',
        code: `public class Access {
    private final String role;

    public Access(String role) {
        this.role = role;
    }

    public boolean isAdmin() {
        return role == "admin";${MARK}
    }

    public boolean canEdit() {
        return isAdmin() || "editor".equals(role);
    }
}`
    },
    {
        id: 'go-defer-before-err', language: 'go', difficulty: 'hard',
        error: 'panic: runtime error: invalid memory address or nil pointer dereference\n  (only when the site is down)',
        explain: 'When `http.Get` fails, `resp` is nil, but `defer resp.Body.Close()` was already registered before checking `err`. Check the error first.',
        code: `package main

import (
	"fmt"
	"io"
	"net/http"
)

func fetchStatus(url string) (string, error) {
	resp, err := http.Get(url)
	defer resp.Body.Close()${MARK}
	if err != nil {
		return "", err
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%d (%d bytes)", resp.StatusCode, len(body)), nil
}`
    },
    {
        id: 'docker-copy-order', language: 'dockerfile', difficulty: 'medium',
        error: 'Bug report: every code change re-runs `npm ci` (3 minutes), even when package.json didn\'t change.',
        explain: 'Copying the whole project before `npm ci` invalidates the install layer on any change. Copy `package*.json` first, install, then copy the rest.',
        code: `FROM node:20-alpine

WORKDIR /app

COPY . .${MARK}
RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]`
    }
];

/** Strips the markers: { ...bug, code, answer: [line numbers, 1-based], lines } */
const BUGS = raw.map(b => {
    const lines = b.code.split('\n');
    const answer = [];
    const clean = lines.map((line, i) => {
        if (line.includes(MARK)) { answer.push(i + 1); return line.replace(MARK, ''); }
        return line;
    });
    if (!answer.length) throw new Error(`bug ${b.id} has no ${MARK} marker`);
    return { ...b, code: clean.join('\n'), answer, lines: clean.length };
});

module.exports = { BUGS };
