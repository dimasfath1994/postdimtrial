// js/ui/grpc-ui.js

export class GrpcUI {
    static renderReqTabs(container) {
        if (!container) {
            console.error("GrpcUI: Tabs container element is missing!");
            return;
        }
        container.innerHTML = `
            <button type="button" class="tab-btn active" data-grpc-tab="message">Message</button>
            <button type="button" class="tab-btn" data-grpc-tab="metadata">Metadata</button>
            <button type="button" class="tab-btn" data-grpc-tab="proto">Proto File</button>
            <button type="button" class="tab-btn" data-grpc-tab="scripts" data-shared-panel="scripts">Scripts</button>
        `;
    }

    static renderPanels(container) {
        if (!container) {
            console.error("GrpcUI: Panels container element is missing!");
            return;
        }
        container.innerHTML = `
            <!-- Message Panel -->
            <div class="grpc-tab-panel" data-grpc-panel="message" style="display: block; height: 100%;">
                <div style="display: flex; flex-direction: column; height: 100%;">
                    <div style="margin-bottom: 6px;">
                        <span style="font-size: 12px; font-weight: bold; color: #888;">gRPC Request Payload (JSON)</span>
                    </div>
                    <div id="grpcMessageEditor" style="flex: 1; border: 1px solid #333; border-radius: 4px; min-height: 220px; overflow: hidden;"></div>
                    <textarea id="grpcBody" class="hidden" style="width: 100%; height: 200px; font-family: monospace; padding: 8px; border: 1px solid #333; border-radius: 4px; background: #1e1e1e; color: #fff;"></textarea>
                </div>
            </div>

            <!-- Metadata Panel -->
            <div class="grpc-tab-panel" data-grpc-panel="metadata" style="display: none; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: bold; color: #888;">gRPC Metadata / Headers</span>
                    <button type="button" id="addGrpcMetadata" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 12px;">+ Add Metadata</button>
                </div>
                <div style="border: 1px solid #333; border-radius: 4px; overflow: hidden; background: #1e1e1e;">
                    <div style="display: flex; background: #252525; padding: 6px 10px; font-size: 11px; font-weight: bold; color: #888; border-bottom: 1px solid #333;">
                        <div style="width: 30px; text-align: center;"></div>
                        <div style="flex: 1; padding: 0 5px;">Key</div>
                        <div style="flex: 1; padding: 0 5px;">Value</div>
                        <div style="width: 30px; text-align: center;"></div>
                    </div>
                    <div id="grpcMetadataBox" style="max-height: 250px; overflow-y: auto;"></div>
                </div>
            </div>

            <!-- Proto File Panel -->
            <div class="grpc-tab-panel" data-grpc-panel="proto" style="display: none; height: 100%;">
                <div style="padding: 16px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; gap: 12px;">
                    <span style="font-size: 13px; font-weight: bold; color: #ddd;">Load Protocol Buffer (.proto)</span>
                    <p style="font-size: 12px; color: #888; margin: 0; line-height: 1.4;">Upload a local .proto file to discover services and methods if server reflection is disabled or unavailable on the target gRPC endpoint.</p>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                        <input type="file" id="grpcProtoFile" accept=".proto" style="display: none;" />
                        <button type="button" id="chooseProtoBtn" style="background: #2b2b2b; color: #fff; border: 1px solid #444; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Choose .proto File</button>
                        <span id="protoFileName" style="font-size: 12px; color: #aaa;">No .proto loaded</span>
                    </div>
                </div>
            </div>
        `;
    }

    static renderServiceSelector(container) {
        if (!container) {
            console.error("GrpcUI: Service selector container element is missing!");
            return;
        }
        container.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px;">
                <select id="grpcServiceMethod" style="flex: 1; padding: 6px 8px; background: #2b2b2b; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 13px; outline: none;">
                    <option value="">-- Pilih Service / Method --</option>
                </select>
                <button type="button" id="btnFetchReflection" style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">Fetch Reflection</button>
            </div>
        `;
    }
}