// battles/content/debug.js — "Debug race": both players get the same broken code; first to make
// every hidden test pass wins. Each entry reuses a task/problem (its tests and reference answers)
// and supplies buggy starter code with a known number of bugs.

const DEBUG = [
    {
        id: 'debug-slugify', base: 'slugify', bugs: 2, difficulty: 'easy',
        starter: {
            javascript: `function slugify(title) {
  return title
    .toLowerCase()
    .split(/[^a-z]+/)
    .join('-');
}
`,
            python: `import re


def slugify(title):
    parts = re.split(r"[^a-z]+", title.lower())
    return "-".join(parts)
`
        }
    },
    {
        id: 'debug-format-price', base: 'format-price', bugs: 3, difficulty: 'medium',
        starter: {
            javascript: `function formatPrice(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = cents;
  const dollars = Math.round(abs / 100)
    .toString()
    .replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  return \`\${sign}$\${dollars}.\${abs % 100}\`;
}
`,
            python: `def format_price(cents):
    sign = "-" if cents < 0 else ""
    amount = cents
    dollars = f"{round(amount / 100):,}"
    return f"{sign}\${dollars}.{amount % 100}"
`
        }
    },
    {
        id: 'debug-paginate', base: 'paginate', bugs: 2, difficulty: 'easy',
        starter: {
            javascript: `function paginate(items, page, perPage) {
  const totalPages = Math.ceil(items.length / perPage);
  return {
    items: items.slice(page * perPage, (page + 1) * perPage),
    page,
    total_pages: totalPages,
    has_next: page < totalPages,
  };
}
`,
            python: `import math


def paginate(items, page, per_page):
    total_pages = math.ceil(len(items) / per_page)
    return {
        "items": items[page * per_page:(page + 1) * per_page],
        "page": page,
        "total_pages": total_pages,
        "has_next": page < total_pages,
    }
`
        }
    },
    {
        id: 'debug-time-ago', base: 'time-ago', bugs: 3, difficulty: 'medium',
        starter: {
            javascript: `function timeAgo(seconds) {
  if (seconds <= 60) return 'just now';
  let n, unit;
  if (seconds < 3600) { n = Math.round(seconds / 60); unit = 'minute'; }
  else if (seconds < 86400) { n = Math.floor(seconds / 3600); unit = 'hour'; }
  else if (seconds < 604800) { n = Math.floor(seconds / 86400); unit = 'day'; }
  else { n = Math.floor(seconds / 604800); unit = 'week'; }
  return \`\${n} \${unit}\${n > 1 ? '' : 's'} ago\`;
}
`,
            python: `def time_ago(seconds):
    if seconds <= 60:
        return "just now"
    if seconds < 3600:
        n, unit = round(seconds / 60), "minute"
    elif seconds < 86400:
        n, unit = seconds // 3600, "hour"
    elif seconds < 604800:
        n, unit = seconds // 86400, "day"
    else:
        n, unit = seconds // 604800, "week"
    return f"{n} {unit}{'' if n > 1 else 's'} ago"
`
        }
    },
    {
        id: 'debug-valid-parentheses', base: 'valid-parentheses', bugs: 2, difficulty: 'easy',
        starter: {
            javascript: `function isValid(s) {
  const pairs = { ')': '(', ']': '[', '}': '(' };
  const stack = [];
  for (const c of s) {
    if (!pairs[c]) stack.push(c);
    else if (stack.pop() !== pairs[c]) return false;
  }
  return true;
}
`,
            python: `def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "("}
    stack = []
    for c in s:
        if c not in pairs:
            stack.append(c)
        elif not stack or stack.pop() != pairs[c]:
            return False
    return True
`
        }
    },
    {
        id: 'debug-mask-card', base: 'mask-card', bugs: 2, difficulty: 'medium',
        starter: {
            javascript: `function maskCard(number) {
  const digits = number.replace(' ', '');
  const masked = '*'.repeat(digits.length - 4) + digits.slice(-4);
  return masked.replace(/(.{4})/g, '$1 ');
}
`,
            python: `import re


def mask_card(number):
    digits = number.replace(" ", "", 1)
    masked = "*" * (len(digits) - 4) + digits[-4:]
    return re.sub(r"(.{4})", r"\\1 ", masked)
`
        }
    },
    {
        id: 'debug-compare-versions', base: 'compare-versions', bugs: 2, difficulty: 'medium',
        starter: {
            javascript: `function compareVersions(a, b) {
  const x = a.split('.');
  const y = b.split('.');
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] > y[i]) return 1;
    if (x[i] < y[i]) return -1;
  }
  return 0;
}
`,
            python: `def compare_versions(a, b):
    x = a.split(".")
    y = b.split(".")
    for i in range(min(len(x), len(y))):
        if x[i] > y[i]:
            return 1
        if x[i] < y[i]:
            return -1
    return 0
`
        }
    },
    {
        id: 'debug-password-rules', base: 'password-rules', bugs: 2, difficulty: 'easy',
        starter: {
            javascript: `function failedRules(password) {
  const failed = [];
  if (password.length < 8) failed.push('length');
  if (!/[a-z]/.test(password)) failed.push('uppercase');
  if (!/[0-9]/.test(password)) failed.push('number');
  if (!/[^A-Za-z]/.test(password)) failed.push('symbol');
  return failed;
}
`,
            python: `import re


def failed_rules(password):
    failed = []
    if len(password) < 8:
        failed.append("length")
    if not re.search(r"[a-z]", password):
        failed.append("uppercase")
    if not re.search(r"[0-9]", password):
        failed.append("number")
    if not re.search(r"[^A-Za-z]", password):
        failed.append("symbol")
    return failed
`
        }
    },
    {
        id: 'debug-top-words', base: 'top-words', bugs: 2, difficulty: 'medium',
        starter: {
            javascript: `function topWords(text, n) {
  const counts = new Map();
  for (const w of text.match(/[a-z]+/g) || []) {
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))
    .slice(0, n);
}
`,
            python: `import re


def top_words(text, n):
    counts = {}
    for w in re.findall(r"[a-z]+", text):
        counts[w] = counts.get(w, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]), reverse=True)
    return [list(kv) for kv in ranked[:n]]
`
        }
    },
    {
        id: 'debug-expenses', base: 'group-expenses', bugs: 1, difficulty: 'easy',
        starter: {
            javascript: `function totalsByCategory(expenses) {
  const totals = {};
  for (const e of expenses) {
    totals[e.category] = e.cents;
  }
  return totals;
}
`,
            python: `def totals_by_category(expenses):
    totals = {}
    for e in expenses:
        totals[e["category"]] = e["cents"]
    return totals
`
        }
    },
    {
        id: 'debug-duration', base: 'parse-duration', bugs: 2, difficulty: 'medium',
        starter: {
            javascript: `function toSeconds(text) {
  const units = { d: 86400, h: 360, m: 60, s: 1 };
  let total = 0;
  for (const [, n, u] of text.matchAll(/(\\d)([dhms])/g)) {
    total += Number(n) * units[u];
  }
  return total;
}
`,
            python: `import re


def to_seconds(text):
    units = {"d": 86400, "h": 360, "m": 60, "s": 1}
    total = 0
    for n, u in re.findall(r"(\\d)([dhms])", text):
        total += int(n) * units[u]
    return total
`
        }
    }
];

module.exports = { DEBUG };
