/**
 * Authentication API utilities
 * Handles auth requests with the backend
 */

// Browser: same-origin so Next rewrites (and Cloudflare Tunnel) proxy to the API.
// SSR: prefer Docker-internal API_UPSTREAM_URL, then local NEXT_PUBLIC_API_URL.
const getAuthApiBase = () => {
  if (typeof window !== 'undefined') return '';
  return (
    process.env.API_UPSTREAM_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8000'
  );
};

/**
 * Register a new user
 */
export const registerUser = async (userData) => {
  try {
    const response = await fetch(`${getAuthApiBase()}/api/v1/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: userData.fullName,
        email: userData.email,
        password: userData.password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Registration failed');
    }

    if (data.data?.user) {
      localStorage.setItem('user', JSON.stringify(data.data.user));
      document.cookie = 'ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax';
    }

    return data.data;
  } catch (error) {
    throw new Error(error.message || 'Failed to register user');
  }
};

/**
 * Login user
 */
export const loginUser = async (credentials) => {
  try {
    const response = await fetch(`${getAuthApiBase()}/api/v1/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Login failed');
    }

    if (data.data?.user) {
      localStorage.setItem('user', JSON.stringify(data.data.user));
      document.cookie = 'ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax';
    }

    return data.data;
  } catch (error) {
    throw new Error(error.message || 'Failed to login');
  }
};

/**
 * Get stored user data
 */
export const getStoredUser = () => {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};

/**
 * Logout user (clear stored data)
 */
export const logoutUser = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('user');
  localStorage.removeItem('ridgeway_user');
  document.cookie = 'ridgeway_auth=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'ridgeway_setup=; path=/; max-age=0; SameSite=Lax';
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  if (typeof window === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith('ridgeway_auth=1'));
};
