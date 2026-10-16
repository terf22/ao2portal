import { useEffect, useState, useCallback, useRef } from 'react';
import { db, addAuditLog } from '../db/dexie';
import { syncQueueItemToFirestore, publishAllLocalToCloud, testFirestoreConnection } from '../services/cloudSyncService';

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

  // Process queue when online by sending mutations to Firestore
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

      // Process queued items to Firestore
      let successCount = 0;
      for (const item of items) {
        try {
          await syncQueueItemToFirestore(item);
          if (item.id !== undefined) {
            await db.syncQueue.delete(item.id);
          }
          successCount++;
        } catch (itemErr) {
          console.warn(`Item ${item.id} sync paused:`, itemErr);
          // If network error, stop processing batch and retry later
          break;
        }
      }

      if (successCount > 0) {
        await addAuditLog(
          'Division Cloud Sync Agent',
          'System',
          'CLOUD_SYNC',
          'QUEUE_FLUSH',
          `Successfully synchronized ${successCount} record(s) to Division Firestore database.`
        );
      }

      const remaining = await db.syncQueue.count();
      setPendingCount(remaining);
      setLastSyncTime(new Date().toLocaleTimeString('en-PH'));
      setSyncStatus(remaining === 0 ? 'Synced' : 'Offline Mode');
    } catch (err) {
      console.error('Failed to sync queue to cloud:', err);
      setSyncStatus('Offline Mode');
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    testFirestoreConnection();

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
    }, 12000);

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

  const triggerFullPublish = async () => {
    if (!navigator.onLine) {
      setSyncStatus('Offline Mode');
      return;
    }
    setSyncStatus('Syncing...');
    try {
      await publishAllLocalToCloud();
      await processSyncQueue();
      setSyncStatus('Synced');
      setLastSyncTime(new Date().toLocaleTimeString('en-PH'));
    } catch {
      setSyncStatus('Offline Mode');
    }
  };

  return {
    isOnline,
    syncStatus,
    lastSyncTime,
    pendingCount,
    triggerManualSync,
    triggerFullPublish,
  };
}
