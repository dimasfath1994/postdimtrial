// services/pm-sandbox.js
import { DataBridge } from '../controller/bridge.js';

export class PMSandbox {
    static async execute(script, response, state, envCtrl, options = {}) {
        if (!script || !script.trim()) return;

        const collectionId = options.collectionId;
        const requestId = options.requestId;
        const draftId = String(requestId || '').startsWith('draft_') ? requestId : null;
        const collectionKey = draftId
            ? `${collectionId ?? 'default'}:draft:${draftId}`
            : String(collectionId ?? 'default');
        const collection = state.collections?.find(item => String(item.id) === collectionKey);
        const collectionVariables = {
            ...((draftId ? DataBridge.load(draftId, 'collectionVariables') : null)
                || state.collectionVariablesById?.[collectionKey]
                || collection?.environment
                || {})
        };
        state.collectionVariablesById ||= {};
        state.collectionVariablesById[collectionKey] = collectionVariables;
        const pendingWrites = [];

        const persistCollectionVariables = () => {
            const next = { ...collectionVariables };
            state.collectionVariablesById[collectionKey] = next;
            if (collection && !draftId) collection.environment = next;
            if (draftId) DataBridge.save(draftId, 'collectionVariables', next);
            if (options.onCollectionVariablesChange) {
                pendingWrites.push(Promise.resolve(
                    options.onCollectionVariablesChange(collectionId, next)
                ));
            }
        };

        const responseBody = response?.body ?? response?.data;
        const pm = {
            variables: {
                get: key => state.runtimeVariables?.[key],
                set: (key, value) => {
                    state.runtimeVariables ||= {};
                    state.runtimeVariables[key] = value;
                },
                unset: key => {
                    if (state.runtimeVariables) delete state.runtimeVariables[key];
                },
                all: () => ({ ...(state.runtimeVariables || {}) })
            },
            collectionVariables: {
                get: key => collectionVariables[key],
                set: (key, value) => {
                    if (!key) return;
                    collectionVariables[key] = value;
                    persistCollectionVariables();
                },
                unset: key => {
                    if (!key || !(key in collectionVariables)) return;
                    delete collectionVariables[key];
                    persistCollectionVariables();
                },
                all: () => ({ ...collectionVariables })
            },
            environment: {
                get: key => envCtrl?.getValue(key),
                set: (key, value) => {
                    if (envCtrl) pendingWrites.push(Promise.resolve(envCtrl.updateByName(key, value)));
                },
                unset: key => {
                    if (envCtrl) pendingWrites.push(Promise.resolve(envCtrl.unsetByName(key)));
                }
            },
            response: {
                json: () => {
                    if (responseBody && typeof responseBody === 'object') return responseBody;
                    try { return responseBody ? JSON.parse(responseBody) : null; }
                    catch { return null; }
                },
                text: () => typeof responseBody === 'string'
                    ? responseBody
                    : JSON.stringify(responseBody ?? ''),
                code: response?.status,
                responseTime: response?.time
            },
            request: options.request || {},
            test: (_name, callback) => callback?.(),
            expect: value => ({
                to: {
                    equal: expected => {
                        if (value !== expected) throw new Error(`Expected ${value} to equal ${expected}`);
                    },
                    be: {
                        ok: () => {
                            if (!value) throw new Error('Expected value to be truthy');
                        }
                    }
                }
            }),
            console
        };

        try {
            const execute = new Function('pm', script);
            await execute(pm);
            if (pendingWrites.length) await Promise.all(pendingWrites);
            console.log('[PMSandbox] Script selesai dijalankan.');
        } catch (error) {
            console.error('[Script Error]', error);
        }
    }
}