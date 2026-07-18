import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AppState } from 'react-native';
import api, { errorMessage } from '../api/client';

const AuthContext = createContext(null);
const SESSION_LAST_ACTIVE_KEY = 'session_last_active_at';
const INACTIVITY_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

const versionUserProfilePhoto = (userData) => {
  if (!userData?.profile_photo || !userData?.profile_photo_updated_at) return userData;
  const separator = String(userData.profile_photo).includes('?') ? '&' : '?';
  return {
    ...userData,
    profile_photo: `${userData.profile_photo}${separator}v=${encodeURIComponent(userData.profile_photo_updated_at)}`
  };
};

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
        const parsedUser = versionUserProfilePhoto(JSON.parse(savedUser));
        setUser(parsedUser);
        await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(Date.now()));
        try {
          const { data } = await api.get('/api/users/profile/');
          const freshUser = versionUserProfilePhoto(data);
          await AsyncStorage.setItem('user', JSON.stringify(freshUser));
          setUser(freshUser);
        } catch (_) {}
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
    const sessionUser = versionUserProfilePhoto(data.user);
    await AsyncStorage.setItem('access_token', data.access);
    await AsyncStorage.setItem('refresh_token', data.refresh);
    await AsyncStorage.setItem('user', JSON.stringify(sessionUser));
    await AsyncStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(Date.now()));
    setUser(sessionUser);
  };

  const updateUser = async (nextUser) => {
    const sessionUser = versionUserProfilePhoto(nextUser);
    await AsyncStorage.setItem('user', JSON.stringify(sessionUser));
    setUser(sessionUser);
    return sessionUser;
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

  const loginWithGoogle = async (idToken) => {
    try {
      const response = await api.post('/api/users/google-login/', { id_token: idToken });
      await saveSession(response.data);
      return response.data.user;
    } catch (error) {
      const message = errorMessage(error);
      Alert.alert('Google sign-in failed', message);
      return { error: message };
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user', SESSION_LAST_ACTIVE_KEY]);
    setUser(null);
  };

  const value = useMemo(() => ({ user, booting, login, register, verifyEmailCode, loginWithGoogle, logout, setUser, updateUser }), [user, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
