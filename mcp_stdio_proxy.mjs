import http from 'http';
import readline from 'readline';

const SSE_URL = process.argv[2] || 'http://127.0.0.1:5173/__copilot_mcp/sse';

let messagesEndpoint = null;
const messageQueue = [];

function flushQueue() {
  while (messageQueue.length > 0) {
    const line = messageQueue.shift();
    sendPost(line);
  }
}

function sendPost(line) {
  const postUrl = new URL(messagesEndpoint, SSE_URL);
  const postReq = http.request(postUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(line)
    }
  }, (postRes) => {
    postRes.on('data', () => {}); // Consume response
  });
  postReq.on('error', (err) => {
    console.error('POST error:', err);
  });
  postReq.write(line);
  postReq.end();
}

// 1. Connect to SSE
const req = http.get(SSE_URL, {
  headers: { 'Accept': 'text/event-stream' }
}, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed to connect to SSE: ${res.statusCode}`);
    process.exit(1);
  }

  let buffer = '';
  res.on('data', (chunk) => {
    buffer += chunk.toString();
    let lines = buffer.split('\n');
    buffer = lines.pop();

    let currentEvent = null;
    let currentData = null;

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6).trim();
      } else if (line === '') {
        if (currentEvent === 'endpoint' && currentData) {
          messagesEndpoint = currentData;
          flushQueue(); // Send any queued messages
        } else if (currentEvent === 'message' && currentData) {
          console.log(currentData);
        }
        currentEvent = null;
        currentData = null;
      }
    }
  });

  res.on('end', () => {
    console.error('SSE connection closed');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('SSE connection error:', err);
  process.exit(1);
});

// 2. Read from stdin and POST to messages endpoint
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  if (!messagesEndpoint) {
    messageQueue.push(line);
  } else {
    sendPost(line);
  }
});
