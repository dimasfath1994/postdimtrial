// js/collab/controller/script-controller.js
export class ScriptController {
    constructor(preEditor, postEditor, onUpdate) {
        this.preEditor = preEditor;
        this.postEditor = postEditor;
        this.onUpdate = onUpdate; // Callback ke RequestController.updateRequestFull
    }

    // Fungsi untuk mengisi editor dari data State (saat pindah tab)
    setScripts(pre, post) {
        if (this.preEditor) this.preEditor.setValue(pre || "");
        if (this.postEditor) this.postEditor.setValue(post || "");
    }

    // Mengambil nilai saat akan dikirim ke server
    getScripts() {
        return {
            pre_script: this.preEditor.getValue(),
            post_script: this.postEditor.getValue()
        };
    }
}