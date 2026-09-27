// js/controller/graphql-controller.js

import { GraphqlService } from "../graphql-service.js";
import { GraphqlUI } from "../ui/graphql-ui.js";
import { DataBridge } from './bridge.js';
import { RequestFormatter } from '../services/request-formatter.js';
import { RequestDispatcher } from '../services/request-dispatcher.js';
import { VariableResolver } from '../services/variable-resolver.js';

export class GraphqlController {
    constructor(State) {
        this.State = State;
        this.State.graphqlByRequest ||= {};
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
            const localData = DataBridge.load(requestId, 'graphql') || this.State.graphqlByRequest[String(requestId)] || { query: '', variables: '{}', operationName: '' };
            this.State.graphql = { ...localData, request_id: requestId };
            this.State.graphqlByRequest[String(requestId)] = this.State.graphql;
            this.renderGraphQL(this.State.graphql, requestId);
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
        this.State.graphqlByRequest[String(requestId)] = this.State.graphql;

        this.renderGraphQL(this.State.graphql, requestId);
    }

    renderGraphQL(data, requestId = this.currentRequestId) {
        const targetContainer = this.container || document.getElementById('graphqlBox');
        if (!targetContainer) return;

        GraphqlUI.render(data, targetContainer, {
            onQueryChange: (query) => this.syncGraphQLUpdate({ query }, requestId),
            onVariablesChange: (variables) => this.syncGraphQLUpdate({ variables }, requestId),
            onOperationNameChange: (operationName) => this.syncGraphQLUpdate({ operationName }, requestId),
            onSend: () => this.executeGraphQL(requestId)
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

    syncStateFromDOM(requestId = this.activeId) {
        const targetContainer = this.container || document.getElementById('graphqlBox');
        if (!targetContainer) return;

        const current = this.State.graphqlByRequest[String(requestId)] || this.State.graphql || {};

        const queryInput = targetContainer.querySelector('.graphql-query-input') || document.getElementById('graphqlQuery');
        const varsInput = targetContainer.querySelector('.graphql-variables-input') || document.getElementById('graphqlVariables');
        const opInput = targetContainer.querySelector('.graphql-operation-input');

        const query = queryInput ? queryInput.value : (current.query || '');
        const variables = varsInput ? varsInput.value : (current.variables || '{}');
        const operationName = opInput ? opInput.value : (current.operationName || '');

        this.State.graphql = { 
            ...current, 
            query, 
            variables, 
            operationName,
            request_id: Number(requestId) || requestId
        };
        this.State.graphqlByRequest[String(requestId)] = this.State.graphql;
    }

    async syncGraphQLUpdate(newData, requestId = this.activeId) {
        if (this.isReceiving) return;

        const activeId = requestId;
        const numericReqId = Number(requestId) || requestId;
        const current = this.State.graphqlByRequest[String(activeId)] || {};
        
        // Update local state dengan menyertakan request_id
        this.State.graphql = { 
            ...current, 
            ...newData,
            request_id: numericReqId
        };
        this.State.graphqlByRequest[String(activeId)] = this.State.graphql;

        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft GraphQL data for ${activeId}`);
            DataBridge.save(activeId, 'graphql', this.State.graphql);
            return;
        }

        this.debounceTimers ||= new Map();
        clearTimeout(this.debounceTimers.get(String(activeId)));
        const timer = setTimeout(async () => {
            let updated = null;
            const requestData = this.State.graphqlByRequest[String(activeId)];
            const recordId = requestData?.id;

            // 1. Jika record sudah punya ID di DB, coba UPDATE
            if (recordId) {
                updated = await GraphqlService.update(recordId, requestData);
            }

            // 2. Jika belum ada ID atau UPDATE menghasilkan 404, lakukan CREATE
            if (!updated) {
                updated = await GraphqlService.create(requestData);
            }

            if (updated && typeof updated === 'object') {
                this.State.graphqlByRequest[String(activeId)] = { ...requestData, ...updated };
                if (String(activeId) === String(this.activeId)) this.State.graphql = this.State.graphqlByRequest[String(activeId)];
                this.broadcastMessage('GRAPHQL_UPDATED', this.State.graphqlByRequest[String(activeId)], activeId);
            }
        }, 300);
        this.debounceTimers.set(String(activeId), timer);
    }

    broadcastMessage(type, data, requestId = this.currentRequestId) {
        const messagePayload = {
            type,
            requestId,
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
        const targetRequestId = requestId || this.currentRequestId;

        if (requestId && String(requestId) !== String(this.currentRequestId) && String(requestId) !== String(this.activeId)) {
            return;
        }

        this.isReceiving = true;

        try {
            switch (type) {
                case 'GRAPHQL_UPDATED':
                    this.State.graphqlByRequest[String(targetRequestId)] = {
                        ...(this.State.graphqlByRequest[String(targetRequestId)] || {}),
                        ...data
                    };
                    if (String(targetRequestId) === String(this.activeId)) {
                        this.State.graphql = this.State.graphqlByRequest[String(targetRequestId)];
                        GraphqlUI.updateFields(data);
                        this.updateDOMFields(data);
                    }
                    break;
            }
        } finally {
            this.isReceiving = false;
        }
    }

    async executeGraphQL(requestId = this.activeId) {
        this.syncStateFromDOM(requestId);
        const rawRequest = await RequestFormatter.collectFromUI(this.State);
        const resolvedRequest = VariableResolver.resolveRequest(rawRequest, this.State);
        return await RequestDispatcher.send(resolvedRequest);
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };
    }

    render() {
        const requestId = this.activeId;
        this.renderGraphQL(this.State.graphqlByRequest[String(requestId)] || this.State.graphql || { query: '', variables: '{}', operationName: '' }, requestId);
    }
}