const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');

const app = express();
const PORT = process.env.PORT || 7000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_KEY';
const VALID_KEYS = (process.env.VALID_KEYS || 'DEMO123,VIP2026').split(',');
const PAYMENT_LINK = process.env.PAYMENT_LINK || 'https://ko-fi.com';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const manifest = {
    id: 'com.global.aisubs.pro',
    version: '1.0.0',
    name: 'Global AI Subtitles Pro',
    description: 'Instant AI-translated subtitles in 40 languages for Stremio.',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    config: [
        { key: 'lang', type: 'text', title: 'Language' },
        { key: 'key', type: 'text', title: 'Access Key' }
    ],
    behaviorHints: { configurable: true, configurationRequired: true }
};

const builder = new addonBuilder(manifest);

async function fetchEnglishSrt(type, id) {
    try {
        const url = `https://strem.io{type}/${id}.json`;
        const { data } = await axios.get(url, { timeout: 8000 });
        if (!data || !data.subtitles) return null;

        const engSub = data.subtitles.find(s => s.lang === 'eng' || s.lang === 'en');
        if (!engSub) return null;

        const srtRes = await axios.get(engSub.url, { timeout: 8000 });
        return srtRes.data;
    } catch (err) {
        console.error('Error fetching base subtitle:', err.message);
        return null;
    }
}

async function translateSrt(srtText, targetLang) {
    const prompt = `Translate the following SRT subtitle file into ${targetLang}. 
CRITICAL RULES:
- Keep all subtitle numbers and timestamps (00:00:00,000 --> 00:00:00,000) 100% identical.
- Only translate the spoken dialogue text naturally for movie subtitles.
- Do not add markdown formatting, code blocks, or extra commentary.

${srtText}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    return response.text.replace(/```srt|```/g, '').trim();
}

builder.defineSubtitlesHandler(async ({ type, id, config }) => {
    const userKey = (config?.key || '').trim();
    const targetLang = config?.lang || 'Macedonian';

    if (!VALID_KEYS.includes(userKey)) {
        return { subtitles: [] };
    }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeLang = targetLang.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cacheFile = path.join(CACHE_DIR, `${safeId}_${safeLang}.srt`);

    if (!fs.existsSync(cacheFile)) {
        const engSrt = await fetchEnglishSrt(type, id);
        if (!engSrt) return { subtitles: [] };

        try {
            const translated = await translateSrt(engSrt, targetLang);
            fs.writeFileSync(cacheFile, translated, 'utf8');
        } catch (err) {
            console.error('AI Translation failed:', err.message);
            return { subtitles: [] };
        }
    }

    const host = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    return {
        subtitles: [
            {
                id: `ai-${safeLang}-${safeId}`,
                url: `${host}/subs/${safeId}_${safeLang}.srt`,
                lang: targetLang.slice(0, 3).toLowerCase()
            }
        ]
    };
});

app.use('/subs', express.static(CACHE_DIR));

app.get('/configure', (req, res) => {
    const languages = [
        "Albanian", "Arabic", "Bosnian", "Bulgarian", "Chinese (Simplified)",
        "Chinese (Traditional)", "Croatian", "Czech", "Danish", "Dutch",
        "Estonian", "Finnish", "French", "German", "Greek", "Hebrew",
        "Hindi", "Hungarian", "Indonesian", "Italian", "Japanese", "Korean",
        "Latvian", "Lithuanian", "Macedonian", "Malay", "Norwegian",
        "Polish", "Portuguese", "Romanian", "Russian", "Serbian",
        "Slovak", "Slovenian", "Spanish", "Swedish", "Thai", "Turkish",
        "Ukrainian", "Vietnamese"
    ];

    const optionsHtml = languages.map(l => `<option value="${l}">${l}</option>`).join('');

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Global AI Subtitles Pro</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; background: #141414; color: #fff; display: flex; justify-content: center; padding: 40px 20px; }
            .box { background: #1f1f1f; padding: 30px; border-radius: 10px; max-width: 400px; width: 100%; }
            h2 { margin-top: 0; color: #8a5cf5; }
            label { display: block; margin: 15px 0 5px; font-size: 14px; }
            input, select { width: 100%; padding: 12px; border-radius: 5px; border: none; box-sizing: border-box; font-size: 15px; }
            button { width: 100%; padding: 14px; margin-top: 20px; background: #8a5cf5; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; font-weight: bold; }
            .buy { display: block; text-align: center; margin-top: 18px; color: #bbb; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>Global AI Subtitles Pro</h2>
            <p style="font-size:14px; color:#ccc;">Instant AI movie & series subtitles in 40 languages.</p>
            <label>Choose Your Language</label>
            <select id="lang">${optionsHtml}</select>
            <label>Access Key</label>
            <input type="text" id="key" placeholder="Enter your Access Key" />
            <button onclick="install()">Install in Stremio</button>
            <button onclick="copyUrl()" style="background:#333; margin-top:10px;">Copy Addon Link (Manual Install)</button>
            <a class="buy" href="${PAYMENT_LINK}" target="_blank">Need a key? Get your Access Key here →</a>
        </div>
        <script>
            function getManifestUrl(protocol) {
                const lang = document.getElementById('lang').value;
                const key = document.getElementById('key').value.trim();
                if (!key) { alert('Please enter an Access Key'); return null; }
                const config = encodeURIComponent(JSON.stringify({ lang, key }));
                return protocol + window.location.host + '/' + config + '/manifest.json';
            }
            function install() {
                const url = getManifestUrl('stremio://');
                if (url) window.location.href = url;
            }
            function copyUrl() {
                const url = getManifestUrl('https://');
                if (!url) return;
                navigator.clipboard.writeText(url);
                alert('Copied! Open Stremio → Addons → + Add Addon and paste it.');
            }
        </script>
    </body>
    </html>
    `);
});

app.get('/', (req, res) => res.redirect('/configure'));
app.use(getRouter(builder.getInterface()));

app.listen(PORT, () => console.log('Addon running on port ' + PORT));
