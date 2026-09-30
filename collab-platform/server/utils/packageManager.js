// utils/packageManager.js — curated package suggestions per project type + name validation.
// Installation itself happens inside the sandbox (utils/projectRunner.installPackage).

const NODE_WEB = {
    'axios': { version: '1.x', description: 'HTTP client — call APIs from the browser or server' },
    'zustand': { version: '5.x', description: 'Lightweight state management — simple hooks API' },
    'react-router-dom': { version: '6.x', description: 'Client-side routing — multi-page navigation' },
    '@tanstack/react-query': { version: '5.x', description: 'Server state — caching, refetching, pagination' },
    'react-hook-form': { version: '7.x', description: 'Forms — validation and error messages' },
    'framer-motion': { version: '11.x', description: 'Animations — transitions, gestures, layout' },
    'react-icons': { version: '5.x', description: 'Icons from all the popular sets' },
    'chart.js': { version: '4.x', description: 'Charts — bar, line, pie, radar' }
};

const NODE_SERVER = {
    'mongoose': { version: '8.x', description: 'MongoDB ODM — schemas, validation, queries' },
    'jsonwebtoken': { version: '9.x', description: 'JWT authentication tokens' },
    'bcryptjs': { version: '2.x', description: 'Password hashing' },
    'zod': { version: '3.x', description: 'Schema validation for request bodies' },
    'helmet': { version: '8.x', description: 'Security headers' },
    'morgan': { version: '1.x', description: 'HTTP request logging' },
    'socket.io': { version: '4.x', description: 'Real-time WebSocket events' },
    'multer': { version: '1.x', description: 'File uploads (multipart forms)' }
};

const PACKAGE_REGISTRY = {
    'React App': NODE_WEB,
    'MERN Stack': { ...NODE_SERVER, ...NODE_WEB },
    'Next.js': { ...NODE_WEB, 'next-auth': { version: '4.x', description: 'Authentication for Next.js' } },
    'Node.js API': NODE_SERVER,
    'Express + EJS': {
        ...NODE_SERVER,
        'express-session': { version: '1.x', description: 'Session management — login persistence' },
        'connect-flash': { version: '0.x', description: 'Flash messages — success/error notifications' },
        'method-override': { version: '3.x', description: 'PUT/DELETE from HTML forms' }
    },
    'Vanilla Web': {
        'lodash': { version: '4.x', description: 'Utility functions — arrays, objects, strings' },
        'gsap': { version: '3.x', description: 'High-performance animations' },
        'three': { version: '0.x', description: '3D graphics with WebGL' },
        'chart.js': { version: '4.x', description: 'Charts and graphs' },
        'dayjs': { version: '1.x', description: 'Date parsing and formatting' }
    },
    'Python API (FastAPI)': {
        'sqlmodel': { version: '0.x', description: 'SQL databases with Pydantic models' },
        'httpx': { version: '0.x', description: 'Async HTTP client' },
        'python-jose': { version: '3.x', description: 'JWT tokens for auth' },
        'passlib': { version: '1.x', description: 'Password hashing' },
        'pymongo': { version: '4.x', description: 'MongoDB driver' }
    },
    'Python Script': {
        'requests': { version: '2.x', description: 'HTTP requests made simple' },
        'rich': { version: '13.x', description: 'Beautiful terminal output' },
        'beautifulsoup4': { version: '4.x', description: 'HTML parsing / web scraping' },
        'pandas': { version: '2.x', description: 'Dataframes and data analysis' }
    },
    'Machine Learning (Jupyter)': {
        'transformers': { version: '4.x', description: 'Hugging Face models — NLP, vision, audio' },
        'datasets': { version: '3.x', description: 'Hugging Face datasets' },
        'catboost': { version: '1.x', description: 'Gradient boosting with categorical features' },
        'optuna': { version: '4.x', description: 'Hyperparameter optimization' },
        'shap': { version: '0.x', description: 'Explain model predictions' },
        'opencv-python-headless': { version: '4.x', description: 'Computer vision' },
        'statsmodels': { version: '0.x', description: 'Statistical models and tests' }
    },
    'Android (Expo)': {
        '@react-navigation/native': { version: '7.x', description: 'Screens and navigation' },
        'expo-camera': { version: 'SDK', description: 'Camera access' },
        'expo-location': { version: 'SDK', description: 'GPS location' },
        '@react-native-async-storage/async-storage': { version: '2.x', description: 'Persistent key-value storage' },
        'axios': { version: '1.x', description: 'HTTP client' }
    }
};

// npm spec: optional @scope/, name, optional @version-range. Nothing shell-meaningful allowed.
const VALID_NPM = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(@[a-z0-9.^~<>=*|_ -]+)?$/i;
// pip spec: name, optional [extras], optional version specifier (e.g. numpy==1.26, uvicorn[standard]>=0.29)
const VALID_PIP = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?((==|>=|<=|~=|!=|>|<)[A-Za-z0-9.*+!-]+)?$/;

const isValidPackageName = (name) =>
    typeof name === 'string' && name.length > 0 && name.length <= 214 &&
    (VALID_NPM.test(name.trim()) || VALID_PIP.test(name.trim()));

const getPackageList = (projectType) => {
    const packages = PACKAGE_REGISTRY[projectType] || {};
    return Object.entries(packages).map(([name, info]) => ({ name, ...info }));
};

module.exports = { getPackageList, isValidPackageName, PACKAGE_REGISTRY };
