export function enableMonacoClipboard(editor) {
    if (!editor) return;

    editor.updateOptions({
        readOnly: false,
        domReadOnly: false,
        contextmenu: true
    });

    if (!window.postdimBridge?.invoke || editor.__postdimClipboardBinding) return;

    editor.__postdimClipboardBinding = editor.onKeyDown(async (event) => {
        const browserEvent = event.browserEvent;
        const hasCommandModifier = browserEvent.ctrlKey || browserEvent.metaKey;
        const key = String(browserEvent.key || '').toLowerCase();
        if (!hasCommandModifier || browserEvent.altKey || browserEvent.shiftKey || !['c', 'v'].includes(key)) return;

        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection || (key === 'c' && selection.isEmpty())) return;

        event.preventDefault();
        event.stopPropagation();

        if (key === 'c') {
            const text = model.getValueInRange(selection);
            try {
                await window.postdimBridge.invoke('clipboard_write', { text });
            } catch (error) {
                console.warn('[Monaco Clipboard] Copy gagal:', error);
            }
            return;
        }

        try {
            const result = await window.postdimBridge.invoke('clipboard_read');
            if (typeof result?.text !== 'string') return;
            editor.executeEdits('postdim.clipboard', [{
                range: selection,
                text: result.text,
                forceMoveMarkers: true
            }]);
            editor.focus();
        } catch (error) {
            console.warn('[Monaco Clipboard] Paste gagal:', error);
        }
    });
}