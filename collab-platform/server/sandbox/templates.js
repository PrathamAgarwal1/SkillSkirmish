// sandbox/templates.js — starter files for every project type.
//
// Every template: runs in its sandbox environment on $PORT, works behind the preview subdomain
// (HMR / websockets included), and has a build/start setup that `Deploy` understands.
const json = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const file = (path, content) => ({ path, content });

// ─── React (Vite) ──────────────────────────────────────────
const VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // The IDE preview runs on its own subdomain — allow it
    allowedHosts: true,
    // Bind-mounted folders don't deliver file events on every OS; poll so edits hot-reload
    watch: { usePolling: true, interval: 300 },
  },
});
`;

const reactApp = [
    file('package.json', json({
        name: 'react-app',
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: { vite: '^6.0.0', '@vitejs/plugin-react': '^4.3.0' }
    })),
    file('vite.config.js', VITE_CONFIG),
    file('index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>React App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`),
    file('src/main.jsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
`),
    file('src/App.jsx', `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="app">
      <h1>React App</h1>
      <p>Edit <code>src/App.jsx</code> — changes hot-reload in the preview.</p>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
    </main>
  );
}
`),
    file('src/App.css', `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; }
.app { min-height: 100vh; display: grid; place-content: center; gap: 1rem; text-align: center; }
code { background: #0f3460; padding: 2px 6px; border-radius: 4px; }
button { padding: 10px 20px; font-size: 1rem; cursor: pointer; border-radius: 6px; border: none; background: #e94560; color: white; }
`)
];

// ─── MERN (one Express server; Vite runs inside it in dev, static build in production) ──
const mernStack = [
    file('package.json', json({
        name: 'mern-app',
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: {
            dev: 'node server/index.js',
            build: 'vite build',
            start: 'NODE_ENV=production node server/index.js'
        },
        dependencies: {
            express: '^4.21.0',
            mongoose: '^8.8.0',
            cors: '^2.8.5',
            dotenv: '^16.4.0',
            react: '^18.3.1',
            'react-dom': '^18.3.1'
        },
        devDependencies: { vite: '^6.0.0', '@vitejs/plugin-react': '^4.3.0' }
    })),
    file('vite.config.js', `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { allowedHosts: true, watch: { usePolling: true, interval: 300 } },
});
`),
    file('server/index.js', `import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import 'dotenv/config';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

// MongoDB is optional: add MONGO_URI under Project Settings → Environment to use a real database
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err.message));
} else {
  console.log('MONGO_URI not set — using in-memory storage');
}

if (isProduction) {
  // Serve the built React app
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // Development: Vite runs inside Express, so the API and React share one port (with hot reload)
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}

server.listen(PORT, '0.0.0.0', () => console.log(\`MERN app running on port \${PORT}\`));
`),
    file('server/routes/api.js', `import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

// Model is only used when MongoDB is connected; otherwise fall back to memory
const Todo = mongoose.models.Todo || mongoose.model('Todo', new mongoose.Schema({ text: String, done: Boolean }));
const memory = [{ _id: '1', text: 'Build something great', done: false }];
const useDb = () => mongoose.connection.readyState === 1;

router.get('/todos', async (req, res) => {
  res.json(useDb() ? await Todo.find() : memory);
});

router.post('/todos', async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (useDb()) return res.status(201).json(await Todo.create({ text, done: false }));
  const todo = { _id: String(Date.now()), text, done: false };
  memory.push(todo);
  res.status(201).json(todo);
});

export default router;
`),
    file('client/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MERN App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`),
    file('client/src/main.jsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
`),
    file('client/src/App.jsx', `import { useEffect, useState } from 'react';

export default function App() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    fetch('/api/todos').then(r => r.json()).then(setTodos);
  }, []);

  const add = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const todo = await res.json();
      setTodos(t => [...t, todo]);
      setText('');
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 480, margin: '4rem auto' }}>
      <h1>MERN Todos</h1>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, margin: '1rem 0' }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="New todo" style={{ flex: 1, padding: 8 }} />
        <button>Add</button>
      </form>
      <ul>{todos.map(t => <li key={t._id}>{t.text}</li>)}</ul>
    </main>
  );
}
`)
];

// ─── Next.js ───────────────────────────────────────────────
const nextJs = [
    file('package.json', json({
        name: 'next-app',
        private: true,
        version: '1.0.0',
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' }
    })),
    file('next.config.js', `/** @type {import('next').NextConfig} */
module.exports = {
  // Hot reload through bind mounts needs polling
  webpack: (config, { dev }) => {
    if (dev) config.watchOptions = { poll: 500, aggregateTimeout: 200 };
    return config;
  },
};
`),
    file('pages/index.js', `import { useState } from 'react';

export default function Home() {
  const [count, setCount] = useState(0);
  return (
    <main style={{ fontFamily: 'system-ui', textAlign: 'center', marginTop: '4rem' }}>
      <h1>Next.js App</h1>
      <p>Edit <code>pages/index.js</code> to get started.</p>
      <button onClick={() => setCount(c => c + 1)}>Clicked {count} times</button>
    </main>
  );
}
`),
    file('pages/api/hello.js', `export default function handler(req, res) {
  res.status(200).json({ message: 'Hello from a Next.js API route!' });
}
`)
];

// ─── Node.js API ───────────────────────────────────────────
const nodeApi = [
    file('package.json', json({
        name: 'node-api',
        private: true,
        version: '1.0.0',
        scripts: { start: 'node index.js', dev: 'node --watch index.js', test: 'node --test' },
        dependencies: { express: '^4.21.0', cors: '^2.8.5', dotenv: '^16.4.0' }
    })),
    file('index.js', `require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let items = [
  { id: 1, name: 'Item 1', description: 'First item' },
  { id: 2, name: 'Item 2', description: 'Second item' },
];

app.get('/', (req, res) => {
  res.send('<h1>Node.js API</h1><p>Try <a href="/api/items">/api/items</a></p>');
});

app.get('/api/items', (req, res) => res.json(items));

app.get('/api/items/:id', (req, res) => {
  const item = items.find(i => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json(item);
});

app.post('/api/items', (req, res) => {
  const item = { id: Date.now(), ...req.body };
  items.push(item);
  res.status(201).json(item);
});

app.delete('/api/items/:id', (req, res) => {
  items = items.filter(i => i.id !== Number(req.params.id));
  res.json({ message: 'Deleted' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(\`API server running on port \${PORT}\`));
`)
];

// ─── Express + EJS ─────────────────────────────────────────
const expressEjs = [
    file('package.json', json({
        name: 'express-ejs-app',
        private: true,
        version: '1.0.0',
        scripts: { start: 'node app.js', dev: 'node --watch app.js' },
        dependencies: { express: '^4.21.0', ejs: '^3.1.10' }
    })),
    file('app.js', `const express = require('express');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const todos = ['Learn Express', 'Build an app', 'Deploy it'];

app.get('/', (req, res) => res.render('index', { title: 'Express + EJS App', todos }));

app.post('/add', (req, res) => {
  if (req.body.todo) todos.push(req.body.todo);
  res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(\`Server running on port \${PORT}\`));
`),
    file('views/index.ejs', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title><%= title %></title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <h1><%= title %></h1>
    <form action="/add" method="POST">
      <input type="text" name="todo" placeholder="Add a to-do..." required />
      <button type="submit">Add</button>
    </form>
    <ul>
      <% todos.forEach(todo => { %><li><%= todo %></li><% }) %>
    </ul>
  </div>
</body>
</html>
`),
    file('public/style.css', `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #161b22; color: #c9d1d9; display: flex; justify-content: center; padding-top: 3rem; }
.container { width: 500px; }
h1 { color: #58a6ff; margin-bottom: 1.5rem; }
form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
input { flex: 1; padding: 10px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; border-radius: 6px; }
button { padding: 10px 20px; border: none; background: #238636; color: white; border-radius: 6px; cursor: pointer; }
li { list-style: none; padding: 10px; border-bottom: 1px solid #21262d; }
`)
];

// ─── Vanilla web ───────────────────────────────────────────
const vanillaWeb = [
    file('index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vanilla Web App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Welcome to Vanilla Web</h1>
    <p>Build with plain HTML, CSS, and JavaScript.</p>
    <button id="btn">Click Me</button>
    <p id="output"></p>
  </div>
  <script src="script.js"></script>
</body>
</html>
`),
    file('style.css', `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.container { text-align: center; }
h1 { font-size: 2.5rem; margin-bottom: 1rem; color: #58a6ff; }
p { margin-bottom: 1rem; }
button { padding: 12px 24px; font-size: 1rem; cursor: pointer; border: none; border-radius: 8px; background: #238636; color: white; }
`),
    file('script.js', `let clickCount = 0;
const btn = document.getElementById('btn');
const output = document.getElementById('output');

btn.addEventListener('click', () => {
  clickCount++;
  output.textContent = \`Clicked \${clickCount} time(s)!\`;
  console.log('Button clicked:', clickCount);
});

console.log('Page loaded successfully');
`)
];

// ─── Python API (FastAPI) ──────────────────────────────────
const fastApi = [
    file('requirements.txt', 'fastapi>=0.110\nuvicorn[standard]>=0.29\n'),
    file('main.py', `from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

app = FastAPI(title="SkillSkirmish API")


class Item(BaseModel):
    name: str
    price: float


items: dict[int, Item] = {1: Item(name="Keyboard", price=49.99)}


@app.get("/", response_class=HTMLResponse)
def home():
    return "<h1>FastAPI is running</h1><p>Interactive docs: <a href='/docs'>/docs</a></p>"


@app.get("/items")
def list_items():
    return items


@app.get("/items/{item_id}")
def get_item(item_id: int):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    return items[item_id]


@app.post("/items", status_code=201)
def create_item(item: Item):
    new_id = max(items, default=0) + 1
    items[new_id] = item
    return {"id": new_id, **item.model_dump()}
`),
    file('test_main.py', `from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_items():
    assert client.get("/items").status_code == 200
`)
];

// ─── Python script ─────────────────────────────────────────
const pythonScript = [
    file('main.py', `def greet(name: str) -> str:
    return f"Hello, {name}!"


if __name__ == "__main__":
    name = input("What's your name? ")
    print(greet(name))
`),
    file('requirements.txt', '# Add packages here, one per line (e.g. requests)\n')
];

// ─── Machine learning (Jupyter + Kaggle + Streamlit) ───────
const notebook = (cells) => json({
    cells: cells.map(([type, source]) => ({
        cell_type: type,
        metadata: {},
        source: source.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l)),
        ...(type === 'code' ? { execution_count: null, outputs: [] } : {})
    })),
    metadata: {
        kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
        language_info: { name: 'python' }
    },
    nbformat: 4,
    nbformat_minor: 5
});

const IRIS_CSV = `sepal_length,sepal_width,petal_length,petal_width,species
5.1,3.5,1.4,0.2,setosa
4.9,3.0,1.4,0.2,setosa
4.7,3.2,1.3,0.2,setosa
5.0,3.6,1.4,0.2,setosa
5.4,3.9,1.7,0.4,setosa
4.6,3.4,1.4,0.3,setosa
5.0,3.4,1.5,0.2,setosa
4.4,2.9,1.4,0.2,setosa
7.0,3.2,4.7,1.4,versicolor
6.4,3.2,4.5,1.5,versicolor
6.9,3.1,4.9,1.5,versicolor
5.5,2.3,4.0,1.3,versicolor
6.5,2.8,4.6,1.5,versicolor
5.7,2.8,4.5,1.3,versicolor
6.3,3.3,4.7,1.6,versicolor
4.9,2.4,3.3,1.0,versicolor
6.3,3.3,6.0,2.5,virginica
5.8,2.7,5.1,1.9,virginica
7.1,3.0,5.9,2.1,virginica
6.3,2.9,5.6,1.8,virginica
6.5,3.0,5.8,2.2,virginica
7.6,3.0,6.6,2.1,virginica
4.9,2.5,4.5,1.7,virginica
7.3,2.9,6.3,1.8,virginica
`;

const machineLearning = [
    file('README.md', `# Machine Learning project

**Run** starts **JupyterLab** in the browser view (pick *Streamlit* next to Run to try the app).
**Deploy** publishes \`app.py\` as a live Streamlit web app.

Preinstalled: NumPy, pandas, scikit-learn, XGBoost, LightGBM, PyTorch (CPU), matplotlib,
seaborn, plotly, Streamlit and the Kaggle CLI. Add anything else to \`requirements.txt\`.

## Kaggle datasets & competitions

1. On kaggle.com → *Settings* → *API* → **Create New Token** (downloads \`kaggle.json\`).
2. In the IDE open **Deploy → Environment** and add \`KAGGLE_USERNAME\` and \`KAGGLE_KEY\`
   from that file (they are stored encrypted and never shown again).
3. In the terminal:

\`\`\`sh
kaggle datasets download -d uciml/iris -p data --unzip
kaggle competitions download -c titanic -p data     # after joining the competition
\`\`\`

## Files
- \`notebooks/01_explore.ipynb\` — explore data and train a model
- \`train.py\` — the same training as a script (\`python train.py\`)
- \`app.py\` — Streamlit app that serves predictions
- \`data/iris.csv\` — small sample dataset
`),
    file('requirements.txt', '# The ML environment already includes the common data-science stack.\n# Add extra packages here, one per line.\n'),
    file('data/iris.csv', IRIS_CSV),
    file('notebooks/01_explore.ipynb', notebook([
        ['markdown', '# Explore & train\nLoad the sample dataset, look at it, and train a classifier.'],
        ['code', "import pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv('../data/iris.csv')\ndf.head()"],
        ['code', "df.groupby('species').mean(numeric_only=True)"],
        ['code', "df.plot.scatter(x='petal_length', y='petal_width', c=df['species'].astype('category').cat.codes, cmap='viridis')\nplt.show()"],
        ['code', "from sklearn.model_selection import train_test_split\nfrom sklearn.ensemble import RandomForestClassifier\nfrom sklearn.metrics import accuracy_score\n\nX = df.drop(columns='species')\ny = df['species']\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)\nmodel = RandomForestClassifier(n_estimators=100, random_state=42).fit(X_train, y_train)\nprint('accuracy:', accuracy_score(y_test, model.predict(X_test)))"],
        ['markdown', '## Use a Kaggle dataset\nAdd `KAGGLE_USERNAME` / `KAGGLE_KEY` in the Environment panel, then:'],
        ['code', "# !kaggle datasets download -d uciml/iris -p ../data --unzip"]
    ])),
    file('train.py', `"""Train a classifier on data/iris.csv and save it to model.joblib."""
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

df = pd.read_csv("data/iris.csv")
X, y = df.drop(columns="species"), df["species"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

model = RandomForestClassifier(n_estimators=100, random_state=42).fit(X_train, y_train)
print(f"accuracy: {accuracy_score(y_test, model.predict(X_test)):.2%}")

joblib.dump(model, "model.joblib")
print("saved model.joblib")
`),
    file('app.py', `import pandas as pd
import streamlit as st
from sklearn.ensemble import RandomForestClassifier

st.set_page_config(page_title="Iris classifier", page_icon="🌸")
st.title("🌸 Iris species predictor")


@st.cache_resource
def load_model():
    df = pd.read_csv("data/iris.csv")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(df.drop(columns="species"), df["species"])
    return model


model = load_model()

col1, col2 = st.columns(2)
sepal_length = col1.slider("Sepal length", 4.0, 8.0, 5.8)
sepal_width = col1.slider("Sepal width", 2.0, 4.5, 3.0)
petal_length = col2.slider("Petal length", 1.0, 7.0, 4.3)
petal_width = col2.slider("Petal width", 0.1, 2.5, 1.3)

features = pd.DataFrame([[sepal_length, sepal_width, petal_length, petal_width]],
                        columns=["sepal_length", "sepal_width", "petal_length", "petal_width"])
prediction = model.predict(features)[0]
st.metric("Predicted species", prediction)
st.bar_chart(pd.Series(model.predict_proba(features)[0], index=model.classes_))
`)
];

// ─── Android (Expo / React Native) ─────────────────────────
const expoApp = [
    file('package.json', json({
        name: 'expo-app',
        private: true,
        version: '1.0.0',
        main: 'expo/AppEntry.js',
        scripts: {
            start: 'expo start',
            web: 'expo start --web',
            android: 'expo start --android',
            'build:web': 'expo export --platform web'
        },
        dependencies: {
            expo: '~52.0.0',
            // Metro's asset pipeline requires these to be direct dependencies
            'expo-asset': '~11.0.0',
            'expo-font': '~13.0.0',
            'expo-status-bar': '~2.0.0',
            react: '18.3.1',
            'react-dom': '18.3.1',
            'react-native': '0.76.9',
            'react-native-web': '~0.19.13',
            '@expo/metro-runtime': '~4.0.0'
        },
        devDependencies: { '@expo/ngrok': '^4.1.0' }
    })),
    file('app.json', json({
        expo: {
            name: 'SkillSkirmish App',
            slug: 'skillskirmish-app',
            version: '1.0.0',
            orientation: 'portrait',
            userInterfaceStyle: 'automatic',
            web: { bundler: 'metro', output: 'single' },
            android: { package: 'com.skillskirmish.app' }
        }
    })),
    file('App.js', `import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello from Expo 👋</Text>
      <Text style={styles.subtitle}>Runs on Android, iOS and the web.</Text>
      <Pressable style={styles.button} onPress={() => setCount(c => c + 1)}>
        <Text style={styles.buttonText}>Tapped {count} times</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117', alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#8b949e', fontSize: 16 },
  button: { backgroundColor: '#238636', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16 },
});
`),
    file('README.md', `# Android app (Expo / React Native)

- **Run → Web preview** shows the app in the IDE browser view (hot reload on save).
- **Run → Phone (Expo Go, tunnel)** prints a QR code in the console — scan it with the
  **Expo Go** app on your Android phone to run the real native app.
- **Deploy** publishes the web version of the app.

To build an installable \`.apk\`, use Expo's cloud builder (EAS) from the terminal:

\`\`\`sh
npx eas-cli login
npx eas-cli build -p android --profile preview
\`\`\`
`)
];

const TEMPLATES = {
    'React App': reactApp,
    'MERN Stack': mernStack,
    'Next.js': nextJs,
    'Node.js API': nodeApi,
    'Express + EJS': expressEjs,
    'Vanilla Web': vanillaWeb,
    'Python API (FastAPI)': fastApi,
    'Python Script': pythonScript,
    'Machine Learning (Jupyter)': machineLearning,
    'Android (Expo)': expoApp
};

module.exports = { TEMPLATES };
