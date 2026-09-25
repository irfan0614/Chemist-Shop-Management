import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useAsyncAction Hook
 *
 * Manages isolated loading states for multiple concurrent actions using unique keys.
 * Ensures:
 * - Each button/action maintains its own isolated spinner/loading state.
 * - Multiple API requests can run simultaneously without state collision.
 * - Duplicate clicks on the same action while in progress are automatically blocked.
 * - Independent buttons remain clickable and functional.
 * - Guaranteed cleanup in `finally` (finalize equivalent) on success or failure.
 */
export function useAsyncAction() {
  const [loadingMap, setLoadingMap] = useState({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Check if a specific action key is currently loading
   */
  const isLoading = useCallback(
    (key) => {
      if (!key) return false;
      return Boolean(loadingMap[String(key)]);
    },
    [loadingMap]
  );

  /**
   * Check if any action is currently loading
   */
  const isAnyLoading = Object.values(loadingMap).some(Boolean);

  /**
   * Execute an async action with an isolated key
   * @param {string|number} key - Unique identifier for the action/button
   * @param {Function} asyncFn - Async function returning a promise
   * @returns {Promise<any>}
   */
  const runAction = useCallback(
    async (key, asyncFn) => {
      const stringKey = String(key);

      // Prevent duplicate trigger if this exact action is already in progress
      if (loadingMap[stringKey]) {
        return;
      }

      setLoadingMap((prev) => ({ ...prev, [stringKey]: true }));

      try {
        const result = await asyncFn();
        return result;
      } finally {
        if (isMountedRef.current) {
          setLoadingMap((prev) => {
            const next = { ...prev };
            delete next[stringKey];
            return next;
          });
        }
      }
    },
    [loadingMap]
  );

  /**
   * Wrap an async callback handler with key-based loading state
   * @param {string|number} key
   * @param {Function} asyncFn
   */
  const wrapHandler = useCallback(
    (key, asyncFn) => {
      return async (...args) => {
        return runAction(key, () => asyncFn(...args));
      };
    },
    [runAction]
  );

  return {
    loadingMap,
    isLoading,
    isAnyLoading,
    runAction,
    wrapHandler,
  };
}

export default useAsyncAction;
