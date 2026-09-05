// src/ws/request-socket.js
import { WS_BASE_URL } from '../core/api/api-config.js';

let globalSocket = null;
let currentWorkspaceId = null;
let reconnectTimer = null;
let connectionGeneration = 0;

export function setupGlobalSocket(workspaceId, callback) {
    const generation = ++connectionGeneration;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    // 1. Jika sudah terhubung ke workspace yang sama, jangan lakukan apa-apa
    if (globalSocket && currentWorkspaceId === workspaceId && globalSocket.readyState === WebSocket.OPEN) {
        return globalSocket;
    }

    // 2. JIKA SEDANG CONNECTING (readyState 0), JANGAN BUKA LAGI!
    // Tunggu sampai dia benar-benar terbuka atau error
    if (globalSocket && globalSocket.readyState === WebSocket.CONNECTING) {
        console.log("[SOCKET] Sedang mencoba connect, tunggu sebentar...");
        return globalSocket;
    }

    // 2. Jika ada koneksi lama, tutup dulu sebelum buka yang baru
    if (globalSocket) {
        console.log("[SOCKET] Menutup koneksi lama...");
        globalSocket.onclose = null; // Mencegah trigger reconnect saat kita tutup sengaja
        globalSocket.close();
        globalSocket = null;
    }

    const url = `${WS_BASE_URL}/ws/${workspaceId}`;
    console.log(`[SOCKET] Mencoba connect ke: ${url}`);
    
    globalSocket = new WebSocket(url);
    currentWorkspaceId = workspaceId;

    globalSocket.onopen = () => {
        console.log(`[SOCKET] Terhubung ke workspace: ${workspaceId}`);
    };

    globalSocket.onmessage = (event) => {
        console.log("[SOCKET] Raw message received:", event.data);
        try {
            const payload = JSON.parse(event.data);
            if (callback) callback(payload);
        } catch (e) {
            console.error("[SOCKET] Gagal parse JSON:", e);
        }
    };

    // PENTING: Jika error, reset variabel agar bisa dicoba lagi
    globalSocket.onerror = (err) => {
        console.error("[SOCKET] Error:", err);
    };

    globalSocket.onclose = () => {
        console.log("[SOCKET] Koneksi tertutup");
        if (generation !== connectionGeneration || currentWorkspaceId !== workspaceId) return;
        globalSocket = null;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            setupGlobalSocket(workspaceId, callback);
        }, 3000);
    };

    return globalSocket;
}


