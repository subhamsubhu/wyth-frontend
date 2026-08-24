import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { initializeSocket, disconnectSocket } from '../services/socket';
import { clearNavState } from '../utils/sessionPersistence';
import axios from 'axios';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Token refresh interval (50 minutes - tokens expire in 60 minutes)
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [role, setRole] = useState('user');
  const tokenRefreshTimer = useRef(null);

  // Fetch the authoritative role from the backend. The backend resolves
  // it from Firebase custom claims and the Firestore users/{uid}.role
  // document — never trust client-side data alone for privileged UI.
  const fetchRole = async (token) => {
    if (!token) { setRole('user'); return 'user'; }
    try {
      const r = await axios.get(`${API_URL}/api/admin/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const nextRole = (r.data?.role || 'user').toLowerCase();
      setRole(nextRole);
      return nextRole;
    } catch (e) {
      setRole('user');
      return 'user';
    }
  };

  // Track login attempts for brute force protection
  const trackLoginAttempt = async (email, success, token = null) => {
    try {
      await axios.post(`${API_URL}/api/auth/track-login`, {
        email,
        success,
        token
      });
    } catch (err) {
      console.error('Failed to track login attempt:', err);
    }
  };

  // Check if account is locked before login
  const checkAccountLockout = async (email) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/check-lockout`, {
        email
      });
      return response.data;
    } catch (err) {
      if (err.response?.status === 429) {
        return {
          locked: true,
          error: err.response.data.error,
          remainingSeconds: err.response.data.remainingSeconds
        };
      }
      return { locked: false };
    }
  };

  // Refresh token automatically
  const refreshToken = async () => {
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return null;

      // Force refresh the token
      const newToken = await firebaseUser.getIdToken(true);
      
      // Update user state with new token
      setUser(prev => prev ? { ...prev, token: newToken } : null);

      // Re-fetch role in case custom claims changed (promotion / demotion).
      fetchRole(newToken);

      // Reconnect socket with new token
      if (newToken) {
        disconnectSocket();
        initializeSocket(newToken);
      }

      console.log('✅ Token refreshed successfully');
      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  };

  // Setup automatic token refresh
  const setupTokenRefresh = () => {
    // Clear existing timer
    if (tokenRefreshTimer.current) {
      clearInterval(tokenRefreshTimer.current);
    }

    // Set up periodic refresh
    tokenRefreshTimer.current = setInterval(async () => {
      console.log('🔄 Auto-refreshing token...');
      await refreshToken();
    }, TOKEN_REFRESH_INTERVAL);
  };

  // Handle 401 errors globally with axios interceptor
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;

        // If token expired and we haven't retried yet
        if (error.response?.status === 401 && 
            error.response?.data?.code === 'TOKEN_EXPIRED' &&
            !originalRequest._retry) {
          
          originalRequest._retry = true;

          // Try to refresh token
          const newToken = await refreshToken();
          
          if (newToken) {
            // Retry original request with new token
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return axios(originalRequest);
          } else {
            // Refresh failed, logout user
            await logout();
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
          photoURL: firebaseUser.photoURL || null,
          token
        });

        // Resolve role from backend (auth claim + Firestore).
        fetchRole(token);

        // Initialize socket connection asynchronously (don't block auth flow)
        // Socket will handle backend health check internally
        initializeSocket(token).catch(err => {
          console.error('Socket initialization error:', err);
        });
        
        // Setup automatic token refresh
        setupTokenRefresh();
      } else {
        setUser(null);
        setRole('user');
        disconnectSocket();
        
        // Clear token refresh timer
        if (tokenRefreshTimer.current) {
          clearInterval(tokenRefreshTimer.current);
          tokenRefreshTimer.current = null;
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (tokenRefreshTimer.current) {
        clearInterval(tokenRefreshTimer.current);
      }
    };
  }, []);

  const register = async (email, password, displayName) => {
    try {
      setError(null);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update profile with display name
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
      
      return { success: true };
    } catch (err) {
      const error = getErrorMessage(err);
      setError(error);
      return { success: false, error };
    }
  };

  // Convert Firebase error codes to user-friendly messages
  const getErrorMessage = (firebaseError) => {
    const errorCode = firebaseError.code || '';
    const errorMessage = firebaseError.message || '';
    
    console.log('Firebase Error:', { code: errorCode, message: errorMessage }); // Debug log
    
    // Priority 1: Check error message for authentication-related keywords
    const authKeywords = [
      'INVALID_PASSWORD',
      'wrong-password',
      'USER_NOT_FOUND',
      'user-not-found',
      'INVALID_LOGIN_CREDENTIALS',
      'invalid-credential',
      'INVALID_EMAIL',
      'invalid-email',
      'EMAIL_NOT_FOUND',
      'email-not-found',
      'password',
      'credential',
      'login',
      'auth'
    ];
    
    const messageUpper = errorMessage.toUpperCase();
    const isAuthError = authKeywords.some(keyword => 
      messageUpper.includes(keyword.toUpperCase())
    );
    
    // If any auth keyword is found in the message, it's a login error
    if (isAuthError && !messageUpper.includes('NETWORK') && !messageUpper.includes('CONNECTION')) {
      return 'Invalid email or password. Please try again.';
    }
    
    // Priority 2: Check specific error codes
    const errorMessages = {
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled. Please contact support.',
      'auth/user-not-found': 'Invalid email or password. Please try again.',
      'auth/wrong-password': 'Invalid email or password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password is too weak. Please use a stronger password.',
      'auth/operation-not-allowed': 'This operation is not allowed. Please contact support.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/internal-error': 'Something went wrong. Please try again later.',
      'auth/invalid-api-key': 'Configuration error. Please contact support.',
      'auth/app-deleted': 'Configuration error. Please contact support.',
      'auth/requires-recent-login': 'Please log in again to continue.',
      'auth/expired-action-code': 'This link has expired. Please request a new one.',
      'auth/invalid-action-code': 'This link is invalid. Please request a new one.',
    };
    
    if (errorMessages[errorCode]) {
      return errorMessages[errorCode];
    }
    
    // Priority 3: Only show network error if it's genuinely a network issue
    if (errorCode === 'auth/network-request-failed') {
      // Check if this is really a network error or masked auth error
      if (messageUpper.includes('FETCH') || messageUpper.includes('TIMEOUT') || messageUpper.includes('CORS')) {
        return 'Network error. Please check your connection and try again.';
      }
      // Otherwise treat as auth error (Firebase sometimes masks auth errors as network errors)
      return 'Invalid email or password. Please try again.';
    }
    
    // Default: if we got here and error mentions auth/login, treat as credentials error
    return 'An error occurred. Please try again.';
  };

  const login = async (email, password) => {
    try {
      setError(null);
      
      // Check if account is locked first
      const lockoutCheck = await checkAccountLockout(email);
      if (lockoutCheck.locked) {
        const error = lockoutCheck.error || 'Account temporarily locked. Please try again later.';
        setError(error);
        return { success: false, error, locked: true };
      }
      
      // Attempt login
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();
      
      // Track successful login
      await trackLoginAttempt(email, true, token);
      
      return { success: true };
    } catch (err) {
      // Track failed login
      await trackLoginAttempt(email, false);
      
      const error = getErrorMessage(err);
      setError(error);
      return { success: false, error };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      disconnectSocket();

      // Clear persisted route/session data so the next login starts
      // from a clean slate (lobby) instead of trying to rejoin a stale
      // room belonging to the previous user.
      clearNavState();

      // Clear token refresh timer
      if (tokenRefreshTimer.current) {
        clearInterval(tokenRefreshTimer.current);
        tokenRefreshTimer.current = null;
      }
      
      return { success: true };
    } catch (err) {
      const error = getErrorMessage(err);
      setError(error);
      return { success: false, error };
    }
  };

  const refreshUser = async () => {
    try {
      const fbUser = auth.currentUser;
      if (!fbUser) return;
      await fbUser.reload();
      const fresh = auth.currentUser;
      const token = await fresh.getIdToken(true);
      setUser({
        uid: fresh.uid,
        email: fresh.email,
        displayName: fresh.displayName || fresh.email?.split('@')[0],
        photoURL: fresh.photoURL || null,
        token,
      });
    } catch (e) { /* */ }
  };

  const value = {
    user,
    loading,
    error,
    role,
    isAdmin: role === 'admin' || role === 'superadmin',
    isSuperAdmin: role === 'superadmin',
    register,
    login,
    logout,
    refreshUser,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};