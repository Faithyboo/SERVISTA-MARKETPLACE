import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AppState } from 'react-native';
import api, { errorMessage } from '../api/client';

const AuthContext = createContext(null);
const SESSION_LAST_ACTIVE_KEY = 'session_last_active_at';
const INACTIVITY_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const load = async () => {
      const savedUser = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('access_token');
      const lastActive = await AsyncStorage.getItem(SESSION_LAST_ACTIVE_KEY);
      const inactiveTooLong = lastActive && Date.now() - Number(lastActive) > INACTIVITY_LIMIT_MS;
      if (inactiveTooLong) {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user', SESSION_LAST_ACTIVE_KEY]);
      } else if (savedUser && token) {
        setUser(JSON.parse(savedUser));
        await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(Date.now()));
      }
      setBooting(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const touchSession = async () => {
      await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(Date.now()));
      try {
        await api.post('/api/users/heartbeat/');
      } catch (_) {}
    };

    touchSession();
    const interval = setInterval(touchSession, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') touchSession();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [user]);

  const saveSession = async (data) => {
    await AsyncStorage.setItem('access_token', data.access);
    await AsyncStorage.setItem('refresh_token', data.refresh);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(Date.now()));
    setUser(data.user);
  };

  const login = async (email, password) => {
    try {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
      const response = await api.post('/api/users/login/', { email, password });
      if (response.data?.requires_2fa) return response.data;
      await saveSession(response.data);
      return response.data.user;
    } catch (error) {
      const message = errorMessage(error);
      Alert.alert('Sign in failed', message);
      return { error: message };
    }
  };

  const register = async (payload) => {
    try {
      const response = await api.post('/api/users/register/', payload);
      if (response.data?.requires_2fa) return response.data;
      await saveSession(response.data);
      return response.data.user;
    } catch (error) {
      Alert.alert('Registration failed', errorMessage(error));
      return null;
    }
  };

  const verifyEmailCode = async (challengeId, code) => {
    try {
      const response = await api.post('/api/users/verify-email-code/', { challenge_id: challengeId, code });
      await saveSession(response.data);
      return response.data.user;
    } catch (error) {
      const message = errorMessage(error);
      Alert.alert('Verification failed', message);
      return { error: message };
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user', SESSION_LAST_ACTIVE_KEY]);
    setUser(null);
  };

  const value = useMemo(() => ({ user, booting, login, register, verifyEmailCode, logout, setUser }), [user, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
