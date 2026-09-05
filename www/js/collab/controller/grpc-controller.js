// js/controller/grpc-controller.js

import { GrpcService } from "../grpc-service.js";
import { RequestGrpcMetadataService } from "../request-grpc-metadata-service.js";
import { GrpcUI } from "../ui/grpc-ui.js";
import { DataBridge } from './bridge.js';
import { VariableResolver } from '../services/variable-resolver.js';

export class GrpcController {
    constructor(State) {
        this.State = State;
        this.container = null;
        this.currentRequestId = null;
        this.isReceiving = false; // Flag cegah infinite loop saat menerima update remote
        this.debounceTimer = null;
        this.bc = new BroadcastChannel('grpc_channel');
        this.setupBroadcastListener();
    }

    // --- Getter untuk mendeteksi active tab / request ID ---
    get activeId() {
        return window.tabCtrl?.activeTabId || this.currentRequestId;
    }

    /**
     * Inisialisasi: Render gRPC workspace untuk request yang sedang aktif
     */
    async init(requestId, container, isDraft) {
        if (!container) return;

        // --- GUARD MUTLAK ---
        const forceIsDraft = String(requestId).startsWith('draft_');

        this.container = container;
        this.currentRequestId = requestId;

        if (forceIsDraft) {
            console.log(`[GUARD] Mode Draft aktif untuk gRPC ${requestId}. Membatalkan API call.`);
            const localData = DataBridge.load(requestId, 'grpc') || { 
                endpoint: '', 
                service_method: '', 
                metadata: [], 
                payload: '{}', 
                useReflection: true,
                discoveredServices: null
            };
            this.State.grpc = localData;
            this.renderGrpc(localData);
            return;
        }

        console.log("DEBUG: init gRPC dipanggil untuk ID:", requestId);
        this.container.innerHTML = '';

        const [grpcData, metadataList] = await Promise.all([
            GrpcService.getByRequest(requestId),
            RequestGrpcMetadataService.getByRequest(requestId)
        ]);

        const resolvedData = {
            endpoint: grpcData?.endpoint || '',
            service_method: grpcData?.service_method || '',
            metadata: metadataList || grpcData?.metadata || [],
            payload: grpcData?.payload || '{}',
            useReflection: grpcData?.useReflection ?? true,
            discoveredServices: grpcData?.discoveredServices || null
        };
        this.State.grpc = resolvedData;

        this.renderGrpc(resolvedData);
    }

    renderGrpc(data) {
        GrpcUI.render(data, this.container, {
            onFieldChange: (field, value) => this.syncGrpcUpdate({ [field]: value }),
            onMetadataAdd: (item) => this.addMetadata(item),
            onMetadataUpdate: (id, item) => this.updateMetadata(id, item),
            onMetadataDelete: (id) => this.deleteMetadata(id),
            onInvoke: () => this.invokeGrpc(),
            onDiscover: (endpoint) => this.discoverServices(endpoint),
            onLoadProto: (content, filename) => this.loadLocalProto(content, filename)
        });
    }

    syncStateFromDOM() {
        if (!this.container) return;
        
        const endpoint = this.container.querySelector('.grpc-endpoint-input')?.value || '';
        const service_method = this.container.querySelector('.grpc-method-input')?.value || '';
        const payload = this.container.querySelector('.grpc-message-input')?.value || '{}';
        
        this.State.grpc = {
            ...(this.State.grpc || {}),
            endpoint,
            service_method,
            payload
        };
    }

    /**
     * Manajemen Metadata gRPC menggunakan RequestGrpcMetadataService
     */
    async addMetadata(item) {
        if (this.isReceiving) return;
        const activeId = this.activeId;

        if (String(activeId).startsWith('draft_')) {
            this.State.grpc.metadata = this.State.grpc.metadata || [];
            const tempItem = { id: 'temp_' + Date.now(), ...item };
            this.State.grpc.metadata.push(tempItem);
            DataBridge.save(activeId, 'grpc', this.State.grpc);
            return;
        }

        const payload = {
            request_id: this.currentRequestId,
            key: item.key ?? "",
            value: item.value ?? "",
            description: item.description ?? "",
            enabled: Boolean(item.enabled ?? true),
            sort_order: item.sort_order ?? 0
        };

        const created = await RequestGrpcMetadataService.create(payload);
        if (created) {
            this.State.grpc.metadata = this.State.grpc.metadata || [];
            this.State.grpc.metadata.push(created);
            this.broadcastMessage('GRPC_METADATA_ADDED', created);
        }
    }

    async updateMetadata(id, item) {
        if (this.isReceiving) return;
        const activeId = this.activeId;

        if (String(activeId).startsWith('draft_') || String(id).startsWith('temp_')) {
            this.State.grpc.metadata = (this.State.grpc.metadata || []).map(m => m.id === id ? { ...m, ...item } : m);
            DataBridge.save(activeId, 'grpc', this.State.grpc);
            return;
        }

        const payload = {
            request_id: this.currentRequestId,
            key: item.key ?? "",
            value: item.value ?? "",
            description: item.description ?? "",
            enabled: Boolean(item.enabled ?? true),
            sort_order: item.sort_order ?? 0
        };

        const updated = await RequestGrpcMetadataService.update(id, payload);
        if (updated) {
            this.State.grpc.metadata = (this.State.grpc.metadata || []).map(m => m.id === id ? (typeof updated === 'object' ? updated : { id, ...payload }) : m);
            this.broadcastMessage('GRPC_METADATA_UPDATED', { id, payload });
        }
    }

    async deleteMetadata(id) {
        if (this.isReceiving) return;
        const activeId = this.activeId;

        if (String(activeId).startsWith('draft_') || String(id).startsWith('temp_')) {
            this.State.grpc.metadata = (this.State.grpc.metadata || []).filter(m => m.id !== id);
            DataBridge.save(activeId, 'grpc', this.State.grpc);
            return;
        }

        const success = await RequestGrpcMetadataService.delete(id);
        if (success) {
            this.State.grpc.metadata = (this.State.grpc.metadata || []).filter(m => m.id !== id);
            this.broadcastMessage('GRPC_METADATA_DELETED', { id });
        }
    }

    /**
     * Handle Event dari BroadcastChannel / WebSocket Server (Remote Sync)
     */
    handleSocketMessage(payload) {
        if (!payload || !payload.type) return;

        const { type, data, requestId } = payload;

        // Abaikan jika update bukan untuk request yang sedang aktif
        if (requestId && requestId !== this.currentRequestId && requestId !== this.activeId) {
            return;
        }

        // KUNCI: Pasang flag agar event Listener UI tidak mengirimkan broadcast balasan
        this.isReceiving = true;

        try {
            switch (type) {
                case 'GRPC_UPDATED':
                    this.State.grpc = { ...this.State.grpc, ...data };
                    GrpcUI.updateFields(data);
                    break;

                case 'GRPC_METADATA_ADDED':
                    this.State.grpc.metadata = this.State.grpc.metadata || [];
                    if (!this.State.grpc.metadata.some(m => m.id === data.id)) {
                        this.State.grpc.metadata.push(data);
                        GrpcUI.updateFields(this.State.grpc);
                    }
                    break;

                case 'GRPC_METADATA_UPDATED':
                    this.State.grpc.metadata = (this.State.grpc.metadata || []).map(m => 
                        m.id === data.id ? { ...m, ...data.payload } : m
                    );
                    GrpcUI.updateFields(this.State.grpc);
                    break;

                case 'GRPC_METADATA_DELETED':
                    this.State.grpc.metadata = (this.State.grpc.metadata || []).filter(m => m.id !== data.id);
                    GrpcUI.updateFields(this.State.grpc);
                    break;

                case 'GRPC_SERVICES_DISCOVERED':
                    this.State.grpc.discoveredServices = data.services;
                    if (GrpcUI.renderDiscoveredServices) {
                        GrpcUI.renderDiscoveredServices(data.services);
                    }
                    break;
            }
        } finally {
            this.isReceiving = false; // Buka kembali flag setelah UI diperbarui
        }
    }

    /**
     * Sinkronisasi ke Server & Broadcast ke tab/peer lain (dengan Debounce)
     */
    async syncGrpcUpdate(newData) {
        if (this.isReceiving) return;

        const activeId = this.activeId;
        this.State.grpc = { ...(this.State.grpc || {}), ...newData };

        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft gRPC data for ${activeId}`);
            DataBridge.save(activeId, 'grpc', this.State.grpc);
            return;
        }

        // Debounce 500ms untuk mengurangi beban server dan spam WebSocket saat mengetik
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
            const updated = await GrpcService.update(this.currentRequestId, this.State.grpc);
            if (updated) {
                this.State.grpc = updated;
                this.broadcastMessage('GRPC_UPDATED', updated);
            }
        }, 500);
    }

    /**
     * Mengirimkan pesan ke BroadcastChannel (Lokal Tab) & WebSocket Dispatcher (Kolaborasi)
     */
    broadcastMessage(type, data) {
        const messagePayload = {
            type,
            requestId: this.currentRequestId,
            workspaceId: this.State?.workspaceId,
            data
        };

        // 1. BroadcastChannel (antar tab pada browser yang sama)
        this.bc.postMessage(messagePayload);

        // 2. WebSocket Dispatcher (kolaborasi antar-pengguna real-time)
        if (window.dispatcher && typeof window.dispatcher.dispatch === 'function') {
            window.dispatcher.dispatch({
                action: type,
                ...messagePayload
            });
        }
    }

    /**
     * Eksekusi gRPC request langsung menghantam command Rust `grpc_request`
     */
    async invokeGrpc() {
        this.syncStateFromDOM();
        const currentData = this.State.grpc || {};
        const resolvedData = VariableResolver.resolveValue(currentData, this.State);

        let parsedPayload = resolvedData.payload;
        if (typeof parsedPayload === 'string') {
            try {
                parsedPayload = JSON.parse(parsedPayload);
            } catch (e) {
                parsedPayload = currentData.payload;
            }
        }

        const formattedMetadata = (currentData.metadata || [])
            .filter(m => m.enabled !== false)
            .map(m => Array.isArray(m) ? m : [m.key, m.value])
            .filter(([k]) => k && k.trim() !== '');

        const grpcPayload = {
            endpoint: resolvedData.endpoint || '',
            service_method: resolvedData.service_method || '',
            payload: parsedPayload,
            metadata: formattedMetadata,
            tls: resolvedData.tls === true || document.getElementById('grpcUseTls')?.checked === true,
            _scripts: null
        };

        try {
            console.log("[gRPC] Mengirim request via webview bridge / native runtime:", grpcPayload);

            const invokeBridge = typeof window.postdimBridge?.invoke === 'function'
                ? window.postdimBridge.invoke.bind(window.postdimBridge)
                : null;

            const result = invokeBridge
                ? await invokeBridge('grpc_request', grpcPayload)
                : await window.__TAURI__?.core?.invoke('grpc_request', grpcPayload)
                    || await window.__TAURI__?.invoke('grpc_request', grpcPayload);

            GrpcUI.renderResponse(result);
            return result;
        } catch (error) {
            console.error("[gRPC] Error saat invoke:", error);
            const result = { status: 500, body: error, is_stream: false };
            GrpcUI.renderResponse(result);
            return result;
        }
    }

    /**
     * Fitur tambahan untuk gRPC Discovery (`discover_grpc_services`)
     */
    async discoverServices(endpoint) {
        try {
            const tls = this.State?.grpc?.tls === true || document.getElementById('grpcUseTls')?.checked === true;
            const invokeBridge = typeof window.postdimBridge?.invoke === 'function'
                ? window.postdimBridge.invoke.bind(window.postdimBridge)
                : null;

            const res = invokeBridge
                ? await invokeBridge('discover_grpc_services', { endpoint, tls })
                : await window.__TAURI__?.core?.invoke('discover_grpc_services', { endpoint, tls })
                    || await window.__TAURI__?.invoke('discover_grpc_services', { endpoint, tls });

            this.State.grpc.discoveredServices = res;
            GrpcUI.renderDiscoveredServices(res);

            this.broadcastMessage('GRPC_SERVICES_DISCOVERED', { services: res });
        } catch (err) {
            console.error("[gRPC Discovery Error]:", err);
            alert(`Discovery Gagal: ${err}`);
        }
    }

    /**
     * Fitur tambahan untuk Load Local Proto (`load_local_proto`)
     */
    async loadLocalProto(content, filename) {
        try {
            const invokeBridge = typeof window.postdimBridge?.invoke === 'function'
                ? window.postdimBridge.invoke.bind(window.postdimBridge)
                : null;

            const res = invokeBridge
                ? await invokeBridge('load_local_proto', { content, filename })
                : await window.__TAURI__?.core?.invoke('load_local_proto', { content, filename })
                    || await window.__TAURI__?.invoke('load_local_proto', { content, filename });

            this.State.grpc.discoveredServices = res;
            GrpcUI.renderLocalProtoServices(res);

            this.broadcastMessage('GRPC_SERVICES_DISCOVERED', { services: res });
        } catch (err) {
            console.error("[gRPC Local Proto Error]:", err);
            alert(`Gagal memuat file .proto: ${err}`);
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };
    }

    render() {
        GrpcUI.render(this.State.grpc || { endpoint: '', service_method: '', metadata: [], payload: '{}', useReflection: true }, this.container, {
            onFieldChange: (field, value) => this.syncGrpcUpdate({ [field]: value }),
            onMetadataAdd: (item) => this.addMetadata(item),
            onMetadataUpdate: (id, item) => this.updateMetadata(id, item),
            onMetadataDelete: (id) => this.deleteMetadata(id),
            onInvoke: () => this.invokeGrpc(),
            onDiscover: (endpoint) => this.discoverServices(endpoint),
            onLoadProto: (content, filename) => this.loadLocalProto(content, filename)
        });
    }
}