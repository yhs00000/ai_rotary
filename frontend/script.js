// script.js

// --- UI Elements ---
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const itemsInput = document.getElementById('itemsInput');
const spinBtn = document.getElementById('spinBtn');
const resultText = document.querySelector('.result-text');
const voiceBtn = document.getElementById('voiceBtn');
const aiStatusMsg = document.querySelector('.status-message');
const pulseDot = document.querySelector('.pulse-dot');

// --- Global State ---
let items = [];
// A curated, modern, vibrant color palette
const palette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#F9A52B', '#9B5DE5',
    '#F15BB5', '#00BBF9', '#00F5D4', '#FEE440', '#E56B6F'
];
let currentRotation = 0;
let isSpinning = false;

// --- Initialize ---
function init() {
    updateWheelData();
    // Re-draw when text area changes
    itemsInput.addEventListener('input', () => {
        updateWheelData();
    });
}

// --- Wheel Logic ---
function updateWheelData() {
    if (isSpinning) return;

    // Default text if empty
    let lines = itemsInput.value.split('\n').map(i => i.trim()).filter(i => i !== '');
    if (lines.length === 0) {
        items = ['添加', '选项'];
    } else {
        items = lines;
    }
    drawWheel();
}

function drawWheel() {
    const numItems = items.length;
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    if (numItems === 0) return;

    const arcSize = (2 * Math.PI) / numItems;
    const centerX = cw / 2;
    const centerY = ch / 2;
    const radius = cw / 2;

    for (let i = 0; i < numItems; i++) {
        const angle = i * arcSize;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + arcSize);
        ctx.lineTo(centerX, centerY);

        // Use colors sequentially
        ctx.fillStyle = palette[i % palette.length];
        ctx.fill();

        // Add a subtle inner divider border
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.stroke();

        // Draw text
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle + arcSize / 2);

        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px 'Outfit', sans-serif";
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        // Truncate long text
        let text = items[i];
        if (text.length > 8) text = text.substring(0, 7) + '..';

        // Position text near the outer edge
        ctx.fillText(text, radius - 30, 0);
        ctx.restore();
    }
}

// Spin Function
spinBtn.addEventListener('click', () => {
    if (items.length < 2) {
        alert("请至少提供两个选项！");
        return;
    }
    if (isSpinning) return;

    isSpinning = true;
    spinBtn.disabled = true;
    voiceBtn.disabled = true;
    itemsInput.disabled = true;

    resultText.classList.remove('winner');
    resultText.innerText = "🤔 命运齿轮转动中...";

    // Spin logic
    const randomDegree = Math.floor(Math.random() * 360);
    const extraSpins = 360 * 5; // 5 full rotations min
    const totalRotate = extraSpins + randomDegree;

    currentRotation += totalRotate;
    canvas.style.transform = `rotate(${currentRotation}deg)`;

    // 4000ms matches the CSS transition time
    setTimeout(() => {
        showResult();
        isSpinning = false;
        spinBtn.disabled = false;
        voiceBtn.disabled = false;
        itemsInput.disabled = false;
    }, 4000);
});

function showResult() {
    const actualRotation = currentRotation % 360;
    const degreePerItem = 360 / items.length;

    // Pointer is at the top (270 degrees in canvas logic)
    // Formula: Find which slice is at 270 deg after rotation
    let pointingAngle = (270 - actualRotation) % 360;
    if (pointingAngle < 0) pointingAngle += 360;

    const winningIndex = Math.floor(pointingAngle / degreePerItem);
    const winner = items[winningIndex];

    resultText.innerText = "✨ " + winner;
    resultText.classList.add('winner');
}

// --- Voice Recognition & Backend API ---
let recognition;
let fullTranscript = "";

function setupVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        voiceBtn.disabled = true;
        aiStatusMsg.innerText = "浏览器不支持语音识别";
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true; // Use continuous to not stop automatically
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;

    // Click to Toggle Recording
    voiceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isRecording) {
            stopRecording();
        } else {
            fullTranscript = ""; // Reset before new recording
            startRecording();
        }
    });

    recognition.onstart = () => {
        voiceBtn.classList.add('recording');
        // Let the user know they are in charge of stopping
        voiceBtn.querySelector('.text').innerText = "聆听中... (说完请再次点击结束)";
        setStatus('正在聆听您的声音 (点击结束)...', 'active');
    };

    recognition.onresult = (event) => {
        // Accumulate since continuous=true might return multiple chunks
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                fullTranscript += event.results[i][0].transcript;
            }
        }
        setStatus(`已听到: "${fullTranscript}"`, 'active');
    };

    recognition.onerror = (event) => {
        if (event.error !== 'no-speech') {
            setStatus("语音识别错误: " + event.error, '');
        }
        stopRecording(); // Automatically stop recording internally
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('recording');
        voiceBtn.querySelector('.text').innerText = "点击说话 (AI 自动识别选项)";
        isRecording = false; // Ensure state is reset

        // Now process what the user said
        let finalInput = fullTranscript.trim();
        if (finalInput !== "") {
            callBackendAPI(finalInput);
            fullTranscript = ""; // Clear state after use
        } else {
            setStatus("系统准备就绪", "");
        }
    };
}

let isRecording = false;
function startRecording() {
    if (isRecording || isSpinning) return;
    try {
        recognition.start();
        isRecording = true;
    } catch (e) { }
}

function stopRecording() {
    if (!isRecording) return;
    try {
        recognition.stop();
        isRecording = false;
    } catch (e) { }
}

function setStatus(text, dotClass) {
    aiStatusMsg.innerText = text;
    pulseDot.className = 'pulse-dot ' + dotClass;
}

// Call Flask Backend
async function callBackendAPI(text) {
    setStatus(`正在向星火大模型请求分析...`, 'working');

    try {
        const response = await fetch('https://ai-rotary-back.onrender.com/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) throw new Error("服务器响应错误");

        const data = await response.json();

        if (data.items && data.items.length > 0) {
            // Success
            itemsInput.value = data.items.join('\n');
            updateWheelData();
            setStatus("✅ AI 提取成功！", 'active');

            // Auto bounce/highlight the input area to show changes
            itemsInput.style.transform = "scale(1.02)";
            setTimeout(() => { itemsInput.style.transform = "none"; }, 200);

            // Auto trigger spin after a tiny delay for UX
            setTimeout(() => spinBtn.click(), 800);
        } else {
            setStatus("⚠️ AI 未找到选项，请重试", '');
        }
    } catch (err) {
        console.error(err);
        setStatus("❌ 连接后端失败，请确保 app.py 正在运行", '');
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    // Populate text area with initial demo content
    itemsInput.value = "汉堡\n火锅\n烤肉\n轻食沙拉\n麻辣烫\n寿司🍣";
    init();
    setupVoice();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker Registred!', reg))
            .catch(err => console.error('Service Worker Registration failed', err));
    }
});
