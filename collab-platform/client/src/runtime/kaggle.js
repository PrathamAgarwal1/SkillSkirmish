// runtime/kaggle.js — imports a Kaggle dataset (or competition data) into the project's data/ folder.
// The server downloads it: Kaggle's API can't be called from a browser.
import axios from 'axios';

export const importKaggle = async (projectId, source) => {
    const res = await axios.post('/api/execute/kaggle', { projectId, source });
    return res.data;
};
