#!/usr/bin/env bash
# Mirror ./models (built by scripts/build-models.sh) into a Cloudflare R2
# bucket, preserving the Hugging Face path layout so Transformers.js only
# needs `env.remoteHost` pointed at the bucket's public URL.
#
#   pnpm models:upload                 # bucket from $R2_BUCKET or "cleanbg-models"
#   R2_BUCKET=my-bucket pnpm models:upload
#
# Idempotent: objects that already exist with the same size are skipped.
# Requires wrangler auth (`pnpm exec wrangler login`).
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${R2_BUCKET:-cleanbg-models}"
SRC=models
W="pnpm exec wrangler"

if [ ! -d "$SRC" ]; then
  echo "No ./models directory — run scripts/build-models.sh first." >&2
  exit 1
fi

echo "▸ bucket: $BUCKET"
if ! $W r2 bucket list 2>/dev/null | grep -q "^name: *$BUCKET\$"; then
  echo "  creating bucket"
  $W r2 bucket create "$BUCKET"
fi

echo "▸ CORS (browsers fetch models cross-origin)"
$W r2 bucket cors set "$BUCKET" --file scripts/r2-cors.json --force >/dev/null

echo "▸ uploading objects"
# Revisions are immutable, so a local manifest of "key size" lines is enough
# to make re-runs cheap (no need to HEAD 200 MB objects).
MANIFEST=".cache/r2-uploaded-$BUCKET.txt"
mkdir -p .cache; touch "$MANIFEST"
find "$SRC" -type f | sort | while read -r file; do
  key="${file#"$SRC"/}"
  case "$file" in
    *.onnx) ct="application/octet-stream" ;;
    *.json) ct="application/json" ;;
    *.wasm) ct="application/wasm" ;;
    *.mjs)  ct="text/javascript" ;;
    *)      ct="application/octet-stream" ;;
  esac
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
  if grep -qxF "$key $size" "$MANIFEST"; then
    echo "  = $key ($size bytes) already uploaded"
    continue
  fi
  echo "  ↑ $key ($size bytes)"
  $W r2 object put "$BUCKET/$key" --remote --file "$file" --content-type "$ct" \
    --cache-control "public, max-age=31536000, immutable" >/dev/null
  echo "$key $size" >> "$MANIFEST"
done

echo "▸ public access"
echo "  For production attach a custom domain (Cloudflare dashboard → R2 → $BUCKET → Settings → Custom Domains),"
echo "  then set VITE_MODEL_HOST=https://<your-domain> in .env.production / wrangler.jsonc vars."
echo "  For a quick start, enable the r2.dev URL (rate-limited, not for heavy production traffic):"
echo "    pnpm exec wrangler r2 bucket dev-url enable $BUCKET"
