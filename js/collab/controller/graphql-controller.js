// js/controller/graphql-controller.js

import { GraphqlService } from "../graphql-service.js";
import { GraphqlUI } from "../ui/graphql-ui.js";
import { DataBridge } from './bridge.js';

export class GraphqlController {
    constructor(State) {
        this.State = State;
        this.container = null;
        this.currentRequestId = null;
        this.isReceiving = false; // Flag penanda untuk cegah infinite loop saat menerima update remote
        this.debounceTimer = null;
        this.bc = new BroadcastChannel('graphql_channel');
        this.setupBroadcastListener();
    }

    // --- Getter untuk mendeteksi active tab / request ID ---
    get activeId() {
        return window.tabCtrl?.activeTabId || this.currentRequestId;
    }

    /**
     * Inisialisasi: Render GraphQL data untuk request yang sedang aktif
     */
    async init(requestId, container, isDraft) {
        if (!container && !document.getElementById('graphqlBox')) return;

        // --- GUARD MUTLAK ---
        const forceIsDraft = String(requestId).startsWith('draft_');

        this.container = container || document.getElementById('graphqlBox');
        this.currentRequestId = requestId;

        if (forceIsDraft) {
            console.log(`[GUARD] Mode Draft aktif untuk GraphQL ${requestId}. Membatalkan API call.`);
            const localData = DataBridge.load(requestId, 'graphql') || { query: '', variables: '{}', operationName: '' };
            this.State.graphql = localData;
            this.renderGraphQL(localData);
            return;
        }

        console.log("DEBUG: init GraphQL dipanggil untuk ID:", requestId);

        const graphqlData = await GraphqlService.getByRequest(requestId) || { query: '', variables: '{}', operationName: '' };
        this.State.graphql = graphqlData;

        this.renderGraphQL(graphqlData);
    }

    renderGraphQL(data) {
        const targetContainer = this.container || document.getElementById('graphqlBox');
        if (!targetContainer) return;

        GraphqlUI.render(data, targetContainer, {
            onQueryChange: (query) => this.syncGraphQLUpdate({ query }),
            onVariablesChange: (variables) => this.syncGraphQLUpdate({ variables }),
            onOperationNameChange: (operationName) => this.syncGraphQLUpdate({ operationName }),
            onSend: () => this.executeGraphQL()
        });

        this.updateDOMFields(data);
    }

    updateDOMFields(data) {
        const targetContainer = this.container || document.getElementById('graphqlBox');
        if (!targetContainer) return;

        const queryEl = targetContainer.querySelector('.graphql-query-input') || document.getElementById('graphqlQuery');
        const varsEl = targetContainer.querySelector('.graphql-variables-input') || document.getElementById('graphqlVariables');

        if (queryEl && data.query !== undefined) {
            queryEl.value = data.query;
        }
        if (varsEl && data.variables !== undefined) {
            varsEl.value = typeof data.variables === 'string' ? data.variables : JSON.stringify(data.variables, null, 2);
        }
    }

    syncStateFromDOM() {
        const targetContainer = this.container || document.getElementById('graphqlBox');
        if (!targetContainer) return;

        const queryInput = targetContainer.querySelector('.graphql-query-input') || document.getElementById('graphqlQuery');
        const varsInput = targetContainer.querySelector('.graphql-variables-input') || document.getElementById('graphqlVariables');
        const opInput = targetContainer.querySelector('.graphql-operation-input');

        const query = queryInput ? queryInput.value : (this.State.graphql?.query || '');
        const variables = varsInput ? varsInput.value : (this.State.graphql?.variables || '{}');
        const operationName = opInput ? opInput.value : (this.State.graphql?.operationName || '');

        this.State.graphql = { query, variables, operationName };
    }

    /**
     * Handle Event dari BroadcastChannel / Server
     */
    handleSocketMessage(payload) {
        if (!payload || !payload.type) return;
        const { type, data, requestId } = payload;

        if (requestId && requestId !== this.currentRequestId && requestId !== this.activeId) {
            return;
        }

        this.isReceiving = true;

        try {
            switch (type) {
                case 'GRAPHQL_UPDATED':
                    this.State.graphql = { ...this.State.graphql, ...data };
                    GraphqlUI.updateFields(data);
                    this.updateDOMFields(data);
                    break;
            }
        } finally {
            this.isReceiving = false;
        }
    }

    /**
     * Sinkronisasi ke Server & Broadcast ke tab lain
     */
    async syncGraphQLUpdate(newData) {
        if (this.isReceiving) return;

        const activeId = this.activeId;
        
        // Update local state terlebih dahulu
        this.State.graphql = { ...(this.State.graphql || {}), ...newData };

        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft GraphQL data for ${activeId}`);
            DataBridge.save(activeId, 'graphql', this.State.graphql);
            return;
        }

        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
            const updated = await GraphqlService.update(this.currentRequestId, this.State.graphql);
            if (updated) {
                this.State.graphql = updated;
                this.broadcastMessage('GRAPHQL_UPDATED', updated);
            }
        }, 300);
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

        this.bc.postMessage(messagePayload);

        if (window.dispatcher && typeof window.dispatcher.dispatch === 'function') {
            window.dispatcher.dispatch({
                action: type,
                ...messagePayload
            });
        }
    }

    async executeGraphQL() {
        this.syncStateFromDOM();
        const activeId = this.activeId;
        const payload = this.State.graphql;

        if (String(activeId).startsWith('draft_')) {
            console.log(`[EXECUTE] Executing draft GraphQL for ${activeId}`);
            const result = await GraphqlService.executeDraft(payload);
            GraphqlUI.renderResponse(result);
            return;
        }

        const result = await GraphqlService.execute(this.currentRequestId, payload);
        GraphqlUI.renderResponse(result);
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };
    }

    render() {
        this.renderGraphQL(this.State.graphql || { query: '', variables: '{}', operationName: '' });
    }
}