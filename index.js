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
