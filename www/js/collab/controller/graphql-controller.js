// js/controller/graphql-controller.js

import { GraphqlService } from "../graphql-service.js";
import { GraphqlUI } from "../ui/graphql-ui.js";
import { DataBridge } from './bridge.js';

export class GraphqlController {
    constructor(State) {
        this.State = State;
        this.container = null;
        this.currentRequestId = null;
        this.isReceiving = false;
        this.debounceTimer = null;
        this.bc = new BroadcastChannel('graphql_channel');
        this.setupBroadcastListener();
    }

    get activeId() {
        return window.tabCtrl?.activeTabId || this.currentRequestId;
    }

    async init(requestId, container, isDraft) {
        if (!container && !document.getElementById('graphqlBox')) return;

        const forceIsDraft = String(requestId).startsWith('draft_');
        const numericReqId = Number(requestId) || requestId;

        this.container = container || document.getElementById('graphqlBox');
        this.currentRequestId = requestId;

        if (forceIsDraft) {
            console.log(`[GUARD] Mode Draft aktif untuk GraphQL ${requestId}. Membatalkan API call.`);
            const localData = DataBridge.load(requestId, 'graphql') || { query: '', variables: '{}', operationName: '' };
            this.State.graphql = { ...localData, request_id: requestId };
            this.renderGraphQL(this.State.graphql);
            return;
        }

        console.log("DEBUG: init GraphQL dipanggil untuk ID:", requestId);

        const fetchedData = await GraphqlService.getByRequest(requestId);
        const graphqlData = fetchedData || { query: '', variables: '{}', operationName: '' };

        // Pastikan request_id selalu tersimpan di state
        this.State.graphql = { 
            ...graphqlData, 
            request_id: numericReqId 
        };

        this.renderGraphQL(this.State.graphql);
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

        this.State.graphql = { 
            ...this.State.graphql, 
            query, 
            variables, 
            operationName,
            request_id: Number(this.currentRequestId) || this.currentRequestId
        };
    }

    async syncGraphQLUpdate(newData) {
        if (this.isReceiving) return;

        const activeId = this.activeId;
        const numericReqId = Number(this.currentRequestId || activeId) || activeId;
        
        // Update local state dengan menyertakan request_id
        this.State.graphql = { 
            ...(this.State.graphql || {}), 
            ...newData,
            request_id: numericReqId
        };

        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft GraphQL data for ${activeId}`);
            DataBridge.save(activeId, 'graphql', this.State.graphql);
            return;
        }

        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
            let updated = null;
            const recordId = this.State.graphql?.id;

            // 1. Jika record sudah punya ID di DB, coba UPDATE
            if (recordId) {
                updated = await GraphqlService.update(recordId, this.State.graphql);
            }

            // 2. Jika belum ada ID atau UPDATE menghasilkan 404, lakukan CREATE
            if (!updated) {
                updated = await GraphqlService.create(this.State.graphql);
            }

            if (updated && typeof updated === 'object') {
                this.State.graphql = { ...this.State.graphql, ...updated };
                this.broadcastMessage('GRAPHQL_UPDATED', this.State.graphql);
            }
        }, 300);
    }

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