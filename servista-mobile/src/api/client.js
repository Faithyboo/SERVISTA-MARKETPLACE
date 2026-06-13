import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

const normalizeHost = (hostUri) => {
  if (!hostUri) return null;
  return hostUri.replace(/^https?:\/\//, '').split(',')[0].split(':')[0];
};

const getExpoHost = () => normalizeHost(
  Constants.expoConfig?.hostUri ||
  Constants.manifest2?.extra?.expoClient?.hostUri ||
  Constants.manifest?.hostUri ||
  Constants.manifest?.debuggerHost
);

const configuredApiUrl = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_BASE_URL : null;
const webHost = typeof window !== 'undefined' && window.location?.hostname
  ? window.location.hostname
  : null;
const expoHost = getExpoHost();

const uniqueUrls = (urls) => urls.filter(Boolean).filter((url, index, list) => list.indexOf(url) === index);

export const API_BASE_URLS = uniqueUrls([
  configuredApiUrl,
  webHost ? `http://${webHost}:8000` : null,
  webHost === 'localhost' ? 'http://127.0.0.1:8000' : null,
  webHost === '127.0.0.1' ? 'http://localhost:8000' : null,
  expoHost ? `http://${expoHost}:8000` : null,
  'http://127.0.0.1:8000',
  'http://localhost:8000',
]);

export const API_BASE_URL = API_BASE_URLS[0];

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

let refreshingToken = null;
let workingBaseUrl = API_BASE_URL;

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.baseURL = workingBaseUrl;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const code = error?.response?.data?.code;
    const isNetworkFailure = !error?.response && (error?.message === 'Network Error' || error?.code === 'ECONNABORTED' || error?.code === 'ERR_NETWORK');
    if (isNetworkFailure && originalRequest && !originalRequest._baseUrlRetry) {
      originalRequest._baseUrlRetry = true;
      const currentBaseUrl = originalRequest.baseURL || workingBaseUrl;
      const fallbackUrls = API_BASE_URLS.filter((url) => url !== currentBaseUrl);
      for (const fallbackUrl of fallbackUrls) {
        try {
          workingBaseUrl = fallbackUrl;
          originalRequest.baseURL = fallbackUrl;
          return await axios(originalRequest);
        } catch (_) {}
      }
      workingBaseUrl = currentBaseUrl;
    }
    if (error?.response?.status === 401 && code === 'token_not_valid' && !originalRequest?._retry) {
      originalRequest._retry = true;
      const refresh = await AsyncStorage.getItem('refresh_token');
      if (refresh) {
        try {
          refreshingToken = refreshingToken || axios.post(`${workingBaseUrl}/api/users/token/refresh/`, { refresh });
          const { data } = await refreshingToken;
          refreshingToken = null;
          await AsyncStorage.setItem('access_token', data.access);
          if (data.refresh) await AsyncStorage.setItem('refresh_token', data.refresh);
          originalRequest.headers.Authorization = `Bearer ${data.access}`;
          return api(originalRequest);
        } catch (refreshError) {
          refreshingToken = null;
        }
      }
      await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (error) => {
  const data = error?.response?.data;
  const urls = API_BASE_URLS.join(', ');
  if (!data && error?.code === 'ECONNABORTED') return `The backend did not respond. Tried: ${urls}. Make sure Django is running on 0.0.0.0:8000.`;
  if (!data && (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK')) return `Cannot reach the backend. Tried: ${urls}. Start Django and keep it running on port 8000.`;
  if (!data) return error?.message || 'Something went wrong.';
  if (data.error) return data.error;
  if (data.detail) return data.detail;
  if (data.code === 'token_not_valid') return 'Your session has expired. Please sign in again.';
  const key = Object.keys(data)[0];
  const value = data[key];
  if (Array.isArray(value)) return `${key}: ${value[0]}`;
  return 'Please check your details and try again.';
};

export default api;
