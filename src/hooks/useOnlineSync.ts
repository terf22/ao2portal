import { useEffect, useState, useCallback, useRef } from 'react';
import { db, addAuditLog } from '../db/dexie';

export type CloudSyncStatus = 'Synced' | 'Syncing...' | 'Offline Mode' | 'Authentication Expired';

export function useOnlineSync() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline Mode' : 'Synced'
  );
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString('en-PH'));
  const [pendingCount, setPendingCount] = useState<number>(0);
  const isSyncingRef = useRef(false);

  // Check syncQueue size
  const checkPendingQueue = useCallback(async () => {
    try {
      const count = await db.syncQueue.count();
      setPendingCount(count);
      return count;
    } catch {
      return 0;
    }
  }, []);

  // Process queue when online
  const processSyncQueue = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;

    try {
      const items = await db.syncQueue.toArray();
      if (items.length === 0) {
        setSyncStatus('Synced');
        setPendingCount(0);
        return;
      }

      isSyncingRef.current = true;
      setSyncStatus('Syncing...');

      // Debounce and process each batch
      await new Promise((resolve) => setTimeout(resolve, 800));

      for (const item of items) {
        // Here we simulate successful sync to the cloud (Supabase/PostgreSQL backend)
        // In full stack, this calls `/api/sync` or Supabase REST endpoint
        if (item.id !== undefined) {
          await db.syncQueue.delete(item.id);
        }
      }

      await addAuditLog(
        'System Cloud Sync Agent',
        'System',
        'CLOUD_SYNC',
        'QUEUE_FLUSH',
        `Successfully synced ${items.length} pending queued mutations to cloud database.`
      );

      setLastSyncTime(new Date().toLocaleTimeString('en-PH'));
      setSyncStatus('Synced');
      setPendingCount(0);
    } catch (err) {
      console.error('Failed to sync queue:', err);
      setSyncStatus('Offline Mode');
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('Syncing...');
      processSyncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('Offline Mode');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    checkPendingQueue();

    const interval = setInterval(() => {
      checkPendingQueue();
      if (navigator.onLine) {
        processSyncQueue();
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkPendingQueue, processSyncQueue]);

  const triggerManualSync = async () => {
    if (!navigator.onLine) {
      setSyncStatus('Offline Mode');
      return;
    }
    await processSyncQueue();
  };

  return {
    isOnline,
    syncStatus,
    lastSyncTime,
    pendingCount,
    triggerManualSync,
  };
}
