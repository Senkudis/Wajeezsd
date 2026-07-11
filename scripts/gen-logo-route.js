const fs = require('fs');
const path = require('path');

const imgPath = path.join(__dirname, 'public_html', 'logo-transparent.png');
const b64 = fs.readFileSync(imgPath).toString('base64');

const routeCode = [
    "const express = require('express');",
    "const router = express.Router();",
    "",
    "// Logo image embedded as base64 — served from code (Render-safe, no filesystem dependency)",
    "const LOGO_B64 = '" + b64 + "';",
    "",
    "router.get('/', (req, res) => {",
    "    const buf = Buffer.from(LOGO_B64, 'base64');",
    "    res.set({",
    "        'Content-Type': 'image/png',",
    "        'Content-Length': buf.length,",
    "        'Cache-Control': 'public, max-age=31536000, immutable',",
    "        'Access-Control-Allow-Origin': '*'",
    "    });",
    "    res.end(buf);",
    "});",
    "",
    "module.exports = router;"
].join('\n');

const outPath = path.join(__dirname, 'routes', 'logo-transparent.js');
fs.writeFileSync(outPath, routeCode, 'utf8');
console.log('Generated:', outPath, '(' + fs.statSync(outPath).size + ' bytes)');
