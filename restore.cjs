const fs = require('fs');

const transcriptPath = 'C:\\Users\\josen\\.gemini\\antigravity-ide\\brain\\8c993075-cbd7-4cd6-8307-54ea689e7ff4\\.system_generated\\logs\\transcript_full.jsonl';

const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.split('\n');

let diffBlock = [];
let capture = false;

// We know the bad edit happened around 2026-07-17T01:36:31Z
// Let's just find the last diff block for CotizacionBuilder.tsx
let foundDiffs = [];
let currentDiff = [];
let isCapturing = false;

for (const line of lines) {
    if (line.includes('f:\\\\SIG Purple V2\\\\src\\\\components\\\\CotizacionBuilder.tsx') && line.includes('[diff_block_start]')) {
        isCapturing = true;
        currentDiff = [];
        continue; // The start might be on same line in JSON, let's parse the JSON
    }
}

// Since transcript.jsonl is JSON lines:
let lastBadEdit = null;
for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.content && obj.content.includes('[diff_block_start]') && obj.content.includes('CotizacionBuilder.tsx')) {
            lastBadEdit = obj.content;
        }
    } catch (e) {}
}

if (lastBadEdit) {
    const outputLines = [];
    const diffLines = lastBadEdit.split('\n');
    let inDiff = false;
    for (const dl of diffLines) {
        if (dl === '[diff_block_start]') {
            inDiff = true;
            continue;
        }
        if (dl === '[diff_block_end]') {
            inDiff = false;
        }
        if (inDiff) {
            if (dl.startsWith('-')) {
                outputLines.push(dl.substring(1));
            } else if (dl.startsWith(' ') || dl.startsWith('+')) {
                // Ignore Context and additions
            }
        }
    }
    fs.writeFileSync('f:\\SIG Purple V2\\deleted_lines.txt', outputLines.join('\n'));
    console.log("Extracted " + outputLines.length + " deleted lines to deleted_lines.txt");
} else {
    console.log("Could not find the diff block in transcript");
}
