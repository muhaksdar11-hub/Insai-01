import { useState, useCallback, useMemo } from 'react';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';

const cache = new Map<string, { data: any, timestamp: number }>();
const inflight = new Map<string, Promise<any>>();
const CACHE_DURATION = 5000; // 5 seconds cache

export function useFetch<T>(url: string, initialData: T) {
  const [data, setData] = useState<T>(initialData);
  
  const [loading, setLoading] = useState(true);
  
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (ignoreCache = false) => {
    if (!ignoreCache) {
      const cached = cache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data);
        setLoading(false);
        setError(null);
        return;
      }
    }

    setLoading(true);
    try {
      let fetchPromise = inflight.get(url);
      if (!fetchPromise) {
        fetchPromise = fetch(url).then(async res => {
          if (res.status === 401) throw new Error("Unauthorized (401)");
          if (!res.ok) throw new Error("API Unavailable");
          const json = await res.json();
          if (json.success === false && json.error) {
            throw new Error(json.error.message || "API Error");
          }
          return json.data !== undefined ? json.data : json;
        });
        inflight.set(url, fetchPromise);
        fetchPromise.finally(() => inflight.delete(url));
      }

      const finalData = await fetchPromise;
      
      cache.set(url, { data: finalData, timestamp: Date.now() });
      setData(finalData);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useIsomorphicLayoutEffect(() => {
    let isMounted = true;
    
    
    const doFetch = async () => {
      try {
        let fetchPromise = inflight.get(url);
        if (!fetchPromise) {
          fetchPromise = fetch(url).then(async res => {
            if (res.status === 401) throw new Error("Unauthorized (401)");
            if (!res.ok) throw new Error("API Unavailable");
            const json = await res.json();
            if (json.success === false && json.error) {
              throw new Error(json.error.message || "API Error");
            }
            return json.data !== undefined ? json.data : json;
          });
          inflight.set(url, fetchPromise);
          fetchPromise.finally(() => inflight.delete(url));
        }

        const finalData = await fetchPromise;
        
        cache.set(url, { data: finalData, timestamp: Date.now() });
        
        if (isMounted) {
          setData(finalData);
          setLoading(false);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load data.");
          setLoading(false);
        }
      }
    };

    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      if (isMounted) {
        setData(cached.data);
        setLoading(false);
        setError(null);
      }
    } else {
       doFetch();
    }

    

    return () => {
      isMounted = false;
      
    };
  }, [url]);

  return useMemo(() => ({
    data,
    loading,
    error,
    refetch: () => fetchData(true)
  }), [data, loading, error, fetchData]);
}
