/**
 * Backend Health Check Utility
 * Checks if the backend is ready before making requests
 */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

let healthCheckCache = {
  isHealthy: false,
  lastCheck: 0,
  cacheTimeout: 30000 // Cache for 30 seconds
};

/**
 * Check backend health with caching
 * @param {boolean} forceRefresh - Force a new health check
 * @returns {Promise<boolean>}
 */
export async function isBackendHealthy(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached result if still valid
  if (!forceRefresh && healthCheckCache.isHealthy && 
      (now - healthCheckCache.lastCheck) < healthCheckCache.cacheTimeout) {
    return true;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${BACKEND_URL}/api/public/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    healthCheckCache.isHealthy = response.ok;
    healthCheckCache.lastCheck = now;
    
    return response.ok;
  } catch (error) {
    healthCheckCache.isHealthy = false;
    healthCheckCache.lastCheck = now;
    return false;
  }
}

/**
 * Wait for backend to become healthy
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<boolean>}
 */
export async function waitForBackendReady(onProgress = null) {
  const maxAttempts = 15; // 15 attempts for cold start
  const delays = [1000, 2000, 2000, 3000, 3000, 3000, 5000, 5000, 5000]; // Progressive delays
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (onProgress) {
      onProgress({ 
        attempt, 
        maxAttempts,
        message: attempt === 1 ? 'Checking server...' : 'Waking up server...'
      });
    }
    
    const healthy = await isBackendHealthy(true);
    if (healthy) {
      if (onProgress) {
        onProgress({ attempt, maxAttempts, message: 'Server ready!', done: true });
      }
      return true;
    }
    
    // Wait before next attempt
    if (attempt < maxAttempts) {
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] || 5000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

/**
 * Reset health check cache (useful after logout or errors)
 */
export function resetHealthCheck() {
  healthCheckCache.isHealthy = false;
  healthCheckCache.lastCheck = 0;
}
