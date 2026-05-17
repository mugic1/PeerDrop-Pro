const peer = new Peer();
let conn;
let html5QrcodeScanner;
let receivedFilesData = []; 
let incomingFileInfo = {}; 
let fileChunks = {};
const CHUNK_SIZE = 64 * 1024; // 64KB chunks

// Initialize Peer
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    new QRCode(document.getElementById("my-qr"), { text: id, width: 128, height: 128 });
});

// Handle incoming connections
peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
});

// QR Scanner Logic
document.getElementById('start-scan-btn').onclick = () => {
    document.getElementById('reader').style.display = 'block';
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render(onScanSuccess);
};

function onScanSuccess(decodedText) {
    html5QrcodeScanner.clear();
    document.getElementById('reader').style.display = 'none';
    conn = peer.connect(decodedText);
    conn.on('open', setupConnection);
}

// Connection Setup & Data Handling
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
            updateProgress(`Receiving ${data.name}...`);
        } else if (data.type === 'file-chunk') {
            fileChunks[data.fileId].push(data.chunk);
        } else if (data.type === 'file-done') {
            assembleFile(data.fileId);
        }
    });
}

// Chatting
document.getElementById('send-msg-btn').onclick = () => {
    const text = document.getElementById('msg-input').value;
    if (text && conn) {
        conn.send({ type: 'chat', text });
        appendMsg(text, 'self');
        document.getElementById('msg-input').value = '';
    }
};

function appendMsg(text, sender) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// File Chunking & Sending
document.getElementById('send-file-btn').onclick = async () => {
    const files = document.getElementById('file-input').files;
    for (let file of files) {
        await sendFileInChunks(file);
    }
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
        updateProgress(`Sending ${file.name}: ${Math.min(100, Math.round(offset/file.size*100))}%`);
    }
    conn.send({ type: 'file-done', fileId });
    updateProgress(`${file.name} Sent!`);
}

// File Receiving & Assembling
function assembleFile(fileId) {
    const meta = incomingFileInfo[fileId];
    const blob = new Blob(fileChunks[fileId], { type: meta.fileType });
    receivedFilesData.push({ name: meta.name, blob });
    
    const url = URL.createObjectURL(blob);
    const li = document.createElement('li');
    li.innerHTML = `<a href="${url}" download="${meta.name}">${meta.name}</a>`;
    document.getElementById('received-list').appendChild(li);
    
    updateProgress(`${meta.name} received completely!`);
    delete fileChunks[fileId];
}

function updateProgress(text) {
    document.getElementById('progress-area').innerHTML = `<p>${text}</p>`;
}

// Download All functionality (JSZip)
document.getElementById('download-all-btn').onclick = async () => {
    if(receivedFilesData.length === 0) return;
    const zip = new JSZip();
    receivedFilesData.forEach(file => zip.file(file.name, file.blob));
    const content = await zip.generateAsync({ type: "blob" });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = "P2P_Files.zip";
    a.click();
};
