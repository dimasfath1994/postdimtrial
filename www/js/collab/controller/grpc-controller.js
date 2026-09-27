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
        this.senderId = globalThis.crypto?.randomUUID?.() || `grpc-${Date.now()}-${Math.random()}`;
        this.bc = new BroadcastChannel('grpc_channel');
        this.setupBroadcastListener();
    }

    // --- Getter untuk mendeteksi active tab / request ID ---
    get activeId() {
        return window.tabCtrl?.activeTabId || this.currentRequestId;
    }

    getState(requestId = this.activeId) {
        this.State.grpcByRequest ||= {};
        return this.State.grpcByRequest[String(requestId)] || null;
    }

    setState(requestId, data) {
        this.State.grpcByRequest ||= {};
        this.State.grpcByRequest[String(requestId)] = data;
        this.State.grpc = data;
        return data;
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
            this.setState(requestId, localData);
            this.renderGrpc(localData, requestId);
            return;
        }

        console.log("DEBUG: init gRPC dipanggil untuk ID:", requestId);

        const generation = (this.initGeneration || 0) + 1;
        this.initGeneration = generation;
        const initialState = this.getState(requestId) || {
            endpoint: '',
            service_method: '',
            protoFileName: '',
            metadata: [],
            payload: '{}',
            useReflection: true,
            discoveredServices: null
        };
        this.setState(requestId, initialState);
        this.renderGrpc(initialState, requestId);

        try {
            const [grpcData, metadataList] = await Promise.all([
                GrpcService.getByRequest(requestId),
                RequestGrpcMetadataService.getByRequest(requestId)
            ]);

            if (generation !== this.initGeneration || String(requestId) !== String(this.currentRequestId)) return;

            const grpcRecord = Array.isArray(grpcData) ? grpcData[0] : grpcData;

            const localState = this.getState(requestId);
            const hasLocalChanges = localState !== initialState;
            const resolvedData = {
                ...initialState,
                ...grpcRecord,
                id: grpcRecord?.id,
                endpoint: grpcRecord?.endpoint || initialState.endpoint || '',
                service_method: grpcRecord?.service_method || initialState.service_method || '',
                protoFileName: grpcRecord?.proto_file_name || initialState.protoFileName || '',
                metadata: metadataList || grpcRecord?.metadata || initialState.metadata || [],
                payload: grpcRecord?.body ?? grpcRecord?.payload ?? initialState.payload ?? '{}',
                useReflection: grpcRecord?.useReflection ?? initialState.useReflection ?? true,
                discoveredServices: grpcRecord?.discoveredServices || initialState.discoveredServices || null
            };
            if (hasLocalChanges) {
                Object.assign(resolvedData, localState);
            }

            this.setState(requestId, resolvedData);
            this.renderGrpc(resolvedData, requestId);
        } catch (error) {
            console.error("[gRPC] Gagal memuat data request; editor lokal tetap aktif:", error);
        }
    }

    renderGrpc(data, requestId = this.activeId) {
        GrpcUI.render(data, this.container, {
            onFieldChange: (field, value) => this.syncGrpcUpdate({ [field]: value }, requestId),
            onMetadataAdd: (item) => this.addMetadata(item, requestId),
            onMetadataUpdate: (id, item) => this.updateMetadata(id, item, requestId),
            onMetadataDelete: (id) => this.deleteMetadata(id, requestId),
            onInvoke: () => this.invokeGrpc(requestId),
            onDiscover: (endpoint) => this.discoverServices(endpoint, requestId),
            onLoadProto: (content, filename) => this.loadLocalProto(content, filename, requestId)
        });
    }

    syncStateFromDOM(requestId = this.activeId) {
        const activeId = requestId || this.activeId;
        const current = this.getState(activeId) || {};
        const payload = document.getElementById('grpcBody')?.value || document.querySelector('.grpc-message-input')?.value || current.payload || '{}';
        const service_method = document.getElementById('grpcServiceMethod')?.value || current.service_method || '';
        const metadata = Array.from(document.querySelectorAll('#grpcMetadataBox .grpc-meta-key')).map((keyInput, index) => ({
            id: current.metadata?.[index]?.id || `meta_${Date.now()}_${index}`,
            key: keyInput.value,
            value: document.querySelectorAll('#grpcMetadataBox .grpc-meta-value')[index]?.value || '',
            enabled: document.querySelectorAll('#grpcMetadataBox .grpc-meta-enabled')[index]?.checked ?? true
        }));

        this.setState(activeId, {
            ...current,
            endpoint: document.getElementById('url')?.value || current.endpoint || '',
            service_method,
            payload,
            metadata: metadata.length ? metadata : (current.metadata || [])
        });
    }

    /**
     * Manajemen Metadata gRPC menggunakan RequestGrpcMetadataService
     */
    async addMetadata(item, requestId = this.activeId) {
        if (this.isReceiving) return;
        const activeId = requestId;
        const grpcState = this.getState(activeId) || {};

        if (String(activeId).startsWith('draft_')) {
            grpcState.metadata = grpcState.metadata || [];
            const tempItem = { id: 'temp_' + Date.now(), ...item };
            grpcState.metadata.push(tempItem);
            this.setState(activeId, grpcState);
            DataBridge.save(activeId, 'grpc', grpcState);
            return tempItem;
        }

        const payload = {
            request_id: activeId,
            key: item.key ?? "",
            value: item.value ?? "",
            description: item.description ?? "",
            enabled: Boolean(item.enabled ?? true),
            sort_order: item.sort_order ?? 0
        };

        const created = await RequestGrpcMetadataService.create(payload);
        if (created) {
            grpcState.metadata = grpcState.metadata || [];
            grpcState.metadata.push(created);
            this.setState(activeId, grpcState);
            this.broadcastMessage('GRPC_METADATA_ADDED', created, activeId);
        }
        return created;
    }

    async updateMetadata(id, item, requestId = this.activeId) {
        if (this.isReceiving) return;
        const activeId = requestId;
        const grpcState = this.getState(activeId) || {};

        if (String(activeId).startsWith('draft_') || String(id).startsWith('temp_')) {
            if (!String(activeId).startsWith('draft_')) return;
            grpcState.metadata = (grpcState.metadata || []).map(m => m.id === id ? { ...m, ...item } : m);
            this.setState(activeId, grpcState);
            DataBridge.save(activeId, 'grpc', grpcState);
            return;
        }

        const payload = {
            request_id: activeId,
            key: item.key ?? "",
            value: item.value ?? "",
            description: item.description ?? "",
            enabled: Boolean(item.enabled ?? true),
            sort_order: item.sort_order ?? 0
        };

        const updated = await RequestGrpcMetadataService.update(id, payload);
        if (updated) {
            grpcState.metadata = (grpcState.metadata || []).map(m => m.id === id ? (typeof updated === 'object' ? updated : { id, ...payload }) : m);
            this.setState(activeId, grpcState);
            this.broadcastMessage('GRPC_METADATA_UPDATED', { id, payload }, activeId);
        }
    }

    async deleteMetadata(id, requestId = this.activeId) {
        if (this.isReceiving) return;
        const activeId = requestId;
        const grpcState = this.getState(activeId) || {};

        if (String(activeId).startsWith('draft_')) {
            grpcState.metadata = (grpcState.metadata || []).filter(m => m.id !== id);
            this.setState(activeId, grpcState);
            DataBridge.save(activeId, 'grpc', grpcState);
            return;
        }

        if (String(id).startsWith('temp_')) return;

        const success = await RequestGrpcMetadataService.delete(id);
        if (success) {
            grpcState.metadata = (grpcState.metadata || []).filter(m => m.id !== id);
            this.setState(activeId, grpcState);
            this.broadcastMessage('GRPC_METADATA_DELETED', { id }, activeId);
        }
    }

    /**
     * Handle Event dari BroadcastChannel / WebSocket Server (Remote Sync)
     */
    handleSocketMessage(payload) {
        if (!payload || !payload.type) return;
        if (payload.senderId === this.senderId) return;

        const { type, data, requestId } = payload;
        const targetRequestId = requestId || this.currentRequestId;
        const targetState = this.getState(targetRequestId) || {};
        const isActiveRequest = String(targetRequestId) === String(this.activeId);

        // Abaikan jika update bukan untuk request yang sedang aktif
        if (requestId && requestId !== this.currentRequestId && requestId !== this.activeId) {
            return;
        }

        // KUNCI: Pasang flag agar event Listener UI tidak mengirimkan broadcast balasan
        this.isReceiving = true;

        try {
            switch (type) {
                case 'GRPC_UPDATED':
                    this.setState(targetRequestId, { ...targetState, ...data });
                    if (isActiveRequest) this.renderGrpc(this.getState(targetRequestId), targetRequestId);
                    break;

                case 'GRPC_METADATA_ADDED':
                    targetState.metadata = targetState.metadata || [];
                    if (!targetState.metadata.some(m => m.id === data.id)) {
                        targetState.metadata.push(data);
                        this.setState(targetRequestId, targetState);
                        if (isActiveRequest) this.renderGrpc(targetState, targetRequestId);
                    }
                    break;

                case 'GRPC_METADATA_UPDATED':
                    targetState.metadata = (targetState.metadata || []).map(m => 
                        m.id === data.id ? { ...m, ...data.payload } : m
                    );
                    this.setState(targetRequestId, targetState);
                    if (isActiveRequest) this.renderGrpc(targetState, targetRequestId);
                    break;

                case 'GRPC_METADATA_DELETED':
                    targetState.metadata = (targetState.metadata || []).filter(m => m.id !== data.id);
                    this.setState(targetRequestId, targetState);
                    if (isActiveRequest) this.renderGrpc(targetState, targetRequestId);
                    break;

                case 'GRPC_SERVICES_DISCOVERED':
                    targetState.discoveredServices = data.services;
                    this.setState(targetRequestId, targetState);
                    if (isActiveRequest && GrpcUI.renderDiscoveredServices) {
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
    async syncGrpcUpdate(newData, requestId = this.activeId) {
        if (this.isReceiving) return;

        const activeId = requestId;
        const grpcState = { ...(this.getState(activeId) || {}), ...newData };
        this.setState(activeId, grpcState);

        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft gRPC data for ${activeId}`);
            DataBridge.save(activeId, 'grpc', grpcState);
            return;
        }

        // Debounce 500ms untuk mengurangi beban server dan spam WebSocket saat mengetik
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
            const servicePayload = {
                request_id: activeId,
                service_method: grpcState.service_method || '',
                proto_file_name: grpcState.protoFileName || grpcState.proto_file_name || '',
                body: typeof grpcState.payload === 'string'
                    ? grpcState.payload
                    : JSON.stringify(grpcState.payload ?? {})
            };

            const saved = grpcState.id
                ? await GrpcService.update(grpcState.id, servicePayload)
                : await GrpcService.create(servicePayload);

            if (saved) {
                const savedRecord = typeof saved === 'object' ? saved : {};
                const nextState = { ...grpcState, ...savedRecord, id: savedRecord.id || grpcState.id };
                this.setState(activeId, nextState);
                this.broadcastMessage('GRPC_UPDATED', nextState, activeId);
            }
        }, 500);
    }

    /**
     * Mengirimkan pesan ke BroadcastChannel (Lokal Tab) & WebSocket Dispatcher (Kolaborasi)
     */
    broadcastMessage(type, data, requestId = this.activeId) {
        const messagePayload = {
            type,
            requestId,
            senderId: this.senderId,
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
    async invokeGrpc(requestId = this.activeId) {
        this.syncStateFromDOM(requestId);
        const currentData = this.getState(requestId) || {};
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

            return result;
        } catch (error) {
            console.error("[gRPC] Error saat invoke:", error);
            return { error: true, status: 500, message: error.message || String(error), body: error.message || String(error), is_stream: false };
        }
    }

    /**
     * Fitur tambahan untuk gRPC Discovery (`discover_grpc_services`)
     */
    async discoverServices(endpoint, requestId = this.activeId) {
        try {
            const grpcState = this.getState(requestId) || {};
            const tls = grpcState.tls === true || document.getElementById('grpcUseTls')?.checked === true;
            const invokeBridge = typeof window.postdimBridge?.invoke === 'function'
                ? window.postdimBridge.invoke.bind(window.postdimBridge)
                : null;

            const res = invokeBridge
                ? await invokeBridge('discover_grpc_services', { endpoint, tls })
                : await window.__TAURI__?.core?.invoke('discover_grpc_services', { endpoint, tls })
                    || await window.__TAURI__?.invoke('discover_grpc_services', { endpoint, tls });

            grpcState.discoveredServices = res;
            this.setState(requestId, grpcState);
            if (String(requestId) === String(this.activeId)) GrpcUI.renderDiscoveredServices(res);

            this.broadcastMessage('GRPC_SERVICES_DISCOVERED', { services: res }, requestId);
            return res;
        } catch (err) {
            console.error("[gRPC Discovery Error]:", err);
            alert(`Discovery Gagal: ${err}`);
            throw err;
        }
    }

    /**
     * Fitur tambahan untuk Load Local Proto (`load_local_proto`)
     */
    async loadLocalProto(content, filename, requestId = this.activeId) {
        try {
            const invokeBridge = typeof window.postdimBridge?.invoke === 'function'
                ? window.postdimBridge.invoke.bind(window.postdimBridge)
                : null;

            const res = invokeBridge
                ? await invokeBridge('load_local_proto', { content, filename })
                : await window.__TAURI__?.core?.invoke('load_local_proto', { content, filename })
                    || await window.__TAURI__?.invoke('load_local_proto', { content, filename });

            const grpcState = this.getState(requestId) || {};
            grpcState.discoveredServices = res;
            grpcState.protoFileName = filename;
            this.setState(requestId, grpcState);
            const fileNameLabel = document.getElementById('protoFileName');
            if (fileNameLabel) {
                fileNameLabel.textContent = filename;
                fileNameLabel.style.color = '#4caf50';
            }
            if (String(requestId) === String(this.activeId)) GrpcUI.renderLocalProtoServices(res);

            await this.syncGrpcUpdate({ protoFileName: filename }, requestId);

            this.broadcastMessage('GRPC_SERVICES_DISCOVERED', { services: res }, requestId);
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
        const requestId = this.activeId;
        this.renderGrpc(this.getState(requestId) || {
            endpoint: '', service_method: '', metadata: [], payload: '{}', useReflection: true
        }, requestId);
    }
}