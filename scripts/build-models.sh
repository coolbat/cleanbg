#!/usr/bin/env bash
# Build the local model mirror in ./models (gitignored), laid out exactly like
# the production R2 bucket:
#
#   models/{repo-id}/resolve/{revision}/{config.json,preprocessor_config.json,onnx/model_fp16.onnx}
#
# - BiRefNet lite: copied verbatim from Hugging Face at the pinned revision.
# - BEN2: upstream fp16 export converted to fp16-weights/fp32-compute
#   (see scripts/convert-ben2.py) and published under our own id/revision.
#
# Requires: curl, uv (https://docs.astral.sh/uv/).
set -euo pipefail
cd "$(dirname "$0")/.."

HF=https://huggingface.co
OUT=models

LITE_ID=studioludens/birefnet-lite-512
LITE_REV=4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7

BEN2_SRC_ID=onnx-community/BEN2-ONNX
BEN2_SRC_REV=c552aa82688edce09f0ac9d2e31ad53d9d629010
BEN2_ID=cleanbg/ben2-webgpu
BEN2_REV=v2

fetch() { # url dest
  if [ ! -s "$2" ]; then
    echo "  ↓ $1"
    mkdir -p "$(dirname "$2")"
    curl -fL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
  fi
}

echo "▸ BiRefNet lite"
for f in config.json preprocessor_config.json onnx/model_fp16.onnx; do
  fetch "$HF/$LITE_ID/resolve/$LITE_REV/$f" "$OUT/$LITE_ID/resolve/$LITE_REV/$f"
done

echo "▸ BEN2"
TMP=.cache/ben2
mkdir -p "$TMP"
fetch "$HF/$BEN2_SRC_ID/resolve/$BEN2_SRC_REV/onnx/model_fp16.onnx" "$TMP/model_fp16.onnx"
for f in config.json preprocessor_config.json; do
  fetch "$HF/$BEN2_SRC_ID/resolve/$BEN2_SRC_REV/$f" "$OUT/$BEN2_ID/resolve/$BEN2_REV/$f"
done
DEST="$OUT/$BEN2_ID/resolve/$BEN2_REV/onnx/model_fp16.onnx"
if [ ! -s "$DEST" ]; then
  mkdir -p "$(dirname "$DEST")"
  uv run --with onnx --with numpy --with onnxruntime python3 scripts/convert-ben2.py "$TMP/model_fp16.onnx" "$DEST"
fi

echo "▸ done"
find "$OUT" -type f -exec ls -la {} \;
