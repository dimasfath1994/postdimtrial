/**
 * ResponseHandler
 * Menangani perenderan hasil request ke DOM.
 */
export class ResponseHandler {
    // --- TAMBAHAN: Fungsi untuk membersihkan seluruh area response ---
    static clear() {
        const statusBar = document.getElementById('statusBar');
        const contentDiv = document.getElementById('content');
        const lineNumbersDiv = document.getElementById('line-numbers');
        
        if (statusBar) statusBar.innerHTML = '<span>Status: -</span> <span>Time: -</span> <span>Size: -</span>';
        if (contentDiv) contentDiv.innerHTML = '';
        if (lineNumbersDiv) lineNumbersDiv.innerHTML = '';
        
        window.latestResponse = null;
    }

    static render(response) {
        const statusBar = document.getElementById('statusBar');
        const responseWrapper = document.getElementById('response-wrapper');
        let copyBtn = responseWrapper.querySelector('.copy-btn');
        if (!copyBtn) {
            copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            responseWrapper.appendChild(copyBtn);
        }

        if (response.error) {
            statusBar.innerHTML = `<span style="color:red;">Error: ${response.message}</span>`;
            return;
        }

        statusBar.innerHTML = `
            <span>Status: <strong>${response.status} ${response.statusText}</strong></span>
            <span>Time: <strong>${response.time} ms</strong></span>
            <span>Size: <strong>${this.formatSize(response.size)}</strong></span>
        `;

        window.latestResponse = response;
        this.renderBody(response.body);
    }

    static renderBody(bodyText) {
        const contentDiv = document.getElementById('content'); // Target pre
        const lineNumbersDiv = document.getElementById('line-numbers');
        const copyBtn = document.querySelector('.copy-btn');

        // 1. Format Teks
        if (!contentDiv || !lineNumbersDiv) {
            console.error("Elemen editor tidak ditemukan di DOM!");
            return;
        }
        
        // 1. Format JSON atau ambil plain text
        let formattedText = bodyText;
        try {
            const parsed = JSON.parse(bodyText);
            formattedText = JSON.stringify(parsed, null, 4);
        } catch (e) {
            formattedText = bodyText; // Fallback jika bukan JSON
        }
        
        // Menargetkan <pre id="content">
        contentDiv.innerText = formattedText;
        
        // 2. Generate Nomor Baris
        const lines = formattedText.split('\n');
        lineNumbersDiv.innerHTML = lines.map((_, index) => `<div>${index + 1}</div>`).join('');

        // --- KUNCI: SINKRONISASI SCROLL ---
    contentDiv.onscroll = () => {
        lineNumbersDiv.scrollTop = contentDiv.scrollTop;
    };

        // 3. Tombol Copy (Cek apakah sudah ada)
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(formattedText);
            this.showCopyFeedback(copyBtn);
        };
    }

    static renderHeaders(headers) {
        const contentDiv = document.getElementById('content'); // target <pre>
        const lineNumbersDiv = document.getElementById('line-numbers');
        const copyBtn = document.querySelector('.copy-btn');
    
        // 1. Bersihkan Editor agar tidak ada nomor baris atau sisa konten
        lineNumbersDiv.innerHTML = ''; 
        contentDiv.innerHTML = ''; // Kosongkan <pre>
        
        // 2. Buat tabel
        let html = '<table style="width:100%">';
        for (const [key, val] of Object.entries(headers)) {
            html += `<tr><td><strong>${key}:</strong></td><td>${val}</td></tr>`;
        }
        html += '</table>';
        
        // 3. Masukkan tabel ke dalam <pre id="content"> atau gunakan div lain
        contentDiv.innerHTML = html;
    
        copyBtn.onclick = () => {
            const headerString = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
            navigator.clipboard.writeText(headerString);
            this.showCopyFeedback(copyBtn);
        };
    }
   

    // Helper untuk konversi unit
    static formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static showCopyFeedback(btn) {
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = 'Copy', 2000);
    }

    
}