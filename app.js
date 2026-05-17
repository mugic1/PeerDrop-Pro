// --- PeerJS Setup ---
const peer = new Peer();
let conn = null;
let receivedFilesData = []; 
let incomingFileInfo = {}; 
let fileChunks = {};
const CHUNK_SIZE = 64 * 1024; // 64KB chunks
let html5QrcodeScanner = null;

// Generate Peer ID & QR Code
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    
    // Clear old QR if any and make new
    document.getElementById("my-qr").innerHTML = "";
    new QRCode(document.getElementById("my-qr"), { 
        text: id, 
        width: 160, 
        height: 160,
        correctLevel: QRCode.CorrectLevel.H
    });
});

// Auto-copy ID on click
document.getElementById('my-id').style.cursor = 'pointer';
document.getElementById('my-id').onclick = function() {
    navigator.clipboard.writeText(this.innerText).then(() => {
        alert("ID Copy ho gayi! Apne friend ko send karo.");
    }).catch(err => {
        console.error("Copy nahi ho paya: ", err);
    });
};

// Handle Incoming Connection
peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
});

// --- QR Code Scanner Engine ---
document.getElementById('start-scan-btn').onclick = () => {
    const readerDiv = document.getElementById('reader');
    readerDiv.style.display = 'block';

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true
        }, false);
    }
    
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
};

function onScanSuccess(decodedText) {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            document.getElementById('reader').style.display = 'none';
        }).catch(err => console.error(err));
    }
    connectToPeer(decodedText);
}

function onScanFailure(error) {
    // Silent failure to avoid console flooding on every frame
    console.warn(`QR Scan error: ${error}`);
}

// --- Connection Logic ---
function connectToPeer(remoteId) {
    if (!remoteId) return;
    document.getElementById('connection-status').innerText = 'Status: Connecting...';
    conn = peer.connect(remoteId.trim());
    conn.on('open', setupConnection);
    conn.on('error', (err) => {
        alert("Connection fail ho gaya: " + err.message);
        document.getElementById('connection-status').innerText = 'Status: Disconnected';
    });
}

// Support manual connect input if added in HTML
const manualConnectBtn = document.getElementById('connect-btn');
if (manualConnectBtn) {
    manualConnectBtn.onclick = () => {
        const remoteId = document.getElementById('peer-id-input').value;
        connectToPeer(remoteId);
    };
}

function setupConnection() {
    document.getElementById('connection-status').innerText = 'Status: Connected!';
    document.getElementById('chat-section').style.display = 'block';
    document.getElementById('files-section').style.display = 'block';

    conn.on('data', (data) => {
        if (data.type === 'chat') {
            appendMsg(data.text, 'other');
        } else if (data.type === 'file-meta') {
            incomingFileInfo[data.fileId] = data;
            fileChunks[data.fileId] = [];
            updateProgress(`Receiving: ${data.name}...`);
        } else if (data.type === 'file-chunk') {
            if (fileChunks[data.fileId]) {
                fileChunks[data.fileId].push(data.chunk);
            }
        } else if (data.type === 'file-done') {
            assembleFile(data.fileId);
        }
    });

    conn.on('close', () => {
        document.getElementById('connection-status').innerText = 'Status: Peer disconnected';
    });
}

// --- Chat Handling ---
document.getElementById('send-msg-btn').onclick = () => {
    sendTextMessage();
};

document.getElementById('msg-input').onkeypress = (e) => {
    if (e.key === 'Enter') sendTextMessage();
};

function sendTextMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (text && conn) {
        conn.send({ type: 'chat', text });
        appendMsg(text, 'self');
        input.value = '';
    }
}

function appendMsg(text, sender) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// --- File Handling (Chunking) ---
document.getElementById('send-file-btn').onclick = async () => {
    const fileInput = document.getElementById('file-input');
    const files = fileInput.files;
    if (files.length === 0 || !conn) return;

    for (let file of files) {
        await sendFileInChunks(file);
    }
    fileInput.value = ''; // Clear selection after sending
};

async function sendFileInChunks(file) {
    const fileId = Math.random().toString(36).substr(2, 9);
    conn.send({ type: 'file-meta', fileId, name: file.name, fileType: file.type });

    let offset = 0;
    while (offset < file.size) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();
        conn.send({ type: 'file-chunk', fileId, chunk: buffer });
        offset += CHUNK_SIZE;
        
        const percentage = Math.min(100, Math.round((offset / file.size) * 100));
        updateProgress(`Sending ${file.name}: ${percentage}%`);
    }
    conn.send({ type: 'file-done', fileId });
    updateProgress(`${file.name} Sent Successfully!`);
}

function assembleFile(fileId) {
    const meta = incomingFileInfo[fileId];
    if (!meta || !fileChunks[fileId]) return;

    const blob = new Blob(fileChunks[fileId], { type: meta.fileType });
    receivedFilesData.push({ name: meta.name, blob });
    
    const url = URL.createObjectURL(blob);
    const li = document.createElement('li');
    li.innerHTML = `<a href="${url}" download="${meta.name}">⬇️ ${meta.name}</a>`;
    document.getElementById('received-list').appendChild(li);
    
    updateProgress(`Received: ${meta.name}`);
    delete fileChunks[fileId];
    delete incomingFileInfo[fileId];
}

function updateProgress(text) {
    document.getElementById('progress-area').innerHTML = `<p>${text}</p>`;
}

// --- Download All (ZIP) ---
document.getElementById('download-all-btn').onclick = async () => {
    if (receivedFilesData.length === 0) {
        alert("Download karne ke liye koi file nahi hai!");
        return;
    }
    
    const zip = new JSZip();
    receivedFilesData.forEach(file => {
        zip.file(file.name, file.blob);
    });
    
    updateProgress("Creating ZIP file...");
    const content = await zip.generateAsync({ type: "blob" });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `P2P_Share_${Date.now()}.zip`;
    a.click();
    updateProgress("ZIP Downloaded!");
};
