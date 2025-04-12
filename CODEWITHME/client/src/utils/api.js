// client/src/utils/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // send cookies automatically
});

export default api;
