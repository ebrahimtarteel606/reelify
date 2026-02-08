/**
 * Utility functions for storing and retrieving video files in IndexedDB
 * This allows blob URLs to be recreated across page navigations
 */

const DB_NAME = 'reelify-video-storage';
const STORE_NAME = 'videos';
const THUMBNAILS_STORE_NAME = 'thumbnails';
const AUDIO_STORE_NAME = 'audio';
const DB_VERSION = 3; // Incremented to add audio store

/**
 * Initialize IndexedDB database
 */
async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(THUMBNAILS_STORE_NAME)) {
        db.createObjectStore(THUMBNAILS_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    };
  });
}

/**
 * Store video file in IndexedDB
 */
export async function storeVideoFile(file: File): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.put(file, 'current-video');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store video file'));
    });
  } catch (error) {
    console.error('Error storing video file:', error);
    throw error;
  }
}

/**
 * Retrieve video file from IndexedDB and create a new blob URL
 */
export async function getVideoBlobUrl(): Promise<string | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get('current-video');
      request.onsuccess = () => {
        const file = request.result as File | undefined;
        if (file) {
          const blobUrl = URL.createObjectURL(file);
          resolve(blobUrl);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(new Error('Failed to retrieve video file'));
    });
  } catch (error) {
    console.error('Error retrieving video file:', error);
    return null;
  }
}

/**
 * Clear stored video file from IndexedDB
 */
export async function clearVideoFile(): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.delete('current-video');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear video file'));
    });
  } catch (error) {
    console.error('Error clearing video file:', error);
    // Don't throw - clearing is best-effort
  }
}

/**
 * Store thumbnail blob in IndexedDB
 */
export async function storeThumbnail(thumbnailBlob: Blob, clipKey: string): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([THUMBNAILS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(THUMBNAILS_STORE_NAME);
    
    // Convert blob to File for storage
    const file = new File([thumbnailBlob], `${clipKey}.jpg`, { type: 'image/jpeg' });
    
    return new Promise((resolve, reject) => {
      const request = store.put(file, clipKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store thumbnail'));
    });
  } catch (error) {
    console.error('Error storing thumbnail:', error);
    throw error;
  }
}

/**
 * Retrieve thumbnail blob from IndexedDB and create a new blob URL
 */
export async function getThumbnailBlobUrl(clipKey: string): Promise<string | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([THUMBNAILS_STORE_NAME], 'readonly');
    const store = transaction.objectStore(THUMBNAILS_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(clipKey);
      request.onsuccess = () => {
        const file = request.result as File | undefined;
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/f68f99fe-5df3-485a-84dc-26c005fe6cdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: "repro-1",
            hypothesisId: "C",
            location: "lib/videoStorage.ts:getThumbnailBlobUrl",
            message: "IndexedDB thumbnail lookup",
            data: {
              clipKey,
              found: Boolean(file),
              size: file?.size ?? 0,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (file) {
          const blobUrl = URL.createObjectURL(file);
          resolve(blobUrl);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(new Error('Failed to retrieve thumbnail'));
    });
  } catch (error) {
    console.error('Error retrieving thumbnail:', error);
    return null;
  }
}

/**
 * Store multiple thumbnails at once
 */
export async function storeThumbnails(thumbnails: { blob: Blob; clipKey: string }[]): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([THUMBNAILS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(THUMBNAILS_STORE_NAME);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/f68f99fe-5df3-485a-84dc-26c005fe6cdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "repro-1",
        hypothesisId: "B",
        location: "lib/videoStorage.ts:storeThumbnails:start",
        message: "Storing thumbnails batch",
        data: {
          count: thumbnails.length,
          keys: thumbnails.map((item) => item.clipKey),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    
    const promises = thumbnails.map(({ blob, clipKey }) => {
      const file = new File([blob], `${clipKey}.jpg`, { type: 'image/jpeg' });
      return new Promise<void>((resolve, reject) => {
        const request = store.put(file, clipKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to store thumbnail ${clipKey}`));
      });
    });
    
    await Promise.all(promises);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/f68f99fe-5df3-485a-84dc-26c005fe6cdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "repro-1",
        hypothesisId: "B",
        location: "lib/videoStorage.ts:storeThumbnails:success",
        message: "Stored thumbnails batch",
        data: { count: thumbnails.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch (error) {
    console.error('Error storing thumbnails:', error);
    throw error;
  }
}

/**
 * Clear all stored thumbnails from IndexedDB
 */
export async function clearThumbnails(): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([THUMBNAILS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(THUMBNAILS_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear thumbnails'));
    });
  } catch (error) {
    console.error('Error clearing thumbnails:', error);
    // Don't throw - clearing is best-effort
  }
}

/**
 * Store audio file in IndexedDB
 */
export async function storeAudioFile(file: File): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([AUDIO_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.put(file, 'current-audio');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store audio file'));
    });
  } catch (error) {
    console.error('Error storing audio file:', error);
    throw error;
  }
}

/**
 * Retrieve audio file from IndexedDB
 */
export async function getAudioFile(): Promise<File | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([AUDIO_STORE_NAME], 'readonly');
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get('current-audio');
      request.onsuccess = () => {
        const file = request.result as File | undefined;
        resolve(file || null);
      };
      request.onerror = () => reject(new Error('Failed to retrieve audio file'));
    });
  } catch (error) {
    console.error('Error retrieving audio file:', error);
    return null;
  }
}

/**
 * Clear stored audio file from IndexedDB
 */
export async function clearAudioFile(): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([AUDIO_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.delete('current-audio');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear audio file'));
    });
  } catch (error) {
    console.error('Error clearing audio file:', error);
    // Don't throw - clearing is best-effort
  }
}

/**
 * Clear all IndexedDB data (video, audio, thumbnails)
 */
export async function clearAllStorage(): Promise<void> {
  try {
    await Promise.all([
      clearVideoFile(),
      clearAudioFile(),
      clearThumbnails(),
    ]);
    console.log('[IndexedDB] All storage cleared');
  } catch (error) {
    console.error('Error clearing all storage:', error);
    // Don't throw - clearing is best-effort
  }
}
