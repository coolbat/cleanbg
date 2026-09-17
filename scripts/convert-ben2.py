"""
Convert the upstream BEN2 fp16 ONNX export into "fp16 weights, fp32 compute".

Why: the upstream export keeps activations in fp16 and sprinkles Cast nodes
around. ONNX Runtime's WebGPU EP fuses the decomposed LayerNorm pattern into a
LayerNormalization kernel whose input ends up fp16 and output fp32 (a Cast sat
inside the matched pattern). The generated WGSL then fails to compile
("cannot assign 'vec4<f16>' to 'vec4<f32>'") and inference dies on every GPU.

Running the whole graph in fp32 avoids mixed-type fusions while keeping the
weights fp16 on disk, so the download stays ~219 MB. Numerically the output
matches the original within fp16 tolerance.

Usage (from repo root, needs `uv`):
  uv run --with onnx --with numpy --with onnxruntime python3 scripts/convert-ben2.py IN.onnx OUT.onnx
"""

from __future__ import annotations

import collections
import sys
import time

import numpy as np
import onnx
from onnx import TensorProto, helper, shape_inference

F16, F32 = TensorProto.FLOAT16, TensorProto.FLOAT


def convert(src: str, dst: str) -> None:
    model = onnx.load(src)
    g = model.graph
    inits = {i.name: i for i in g.initializer}

    rename: dict[str, str] = {}  # dropped Cast output -> its input
    keep = []
    weight_casts: dict[str, str] = {}  # f16 initializer -> f32 cast output
    for n in g.node:
        if n.op_type == "Cast":
            to = helper.get_attribute_value(n.attribute[0])
            src_name = n.input[0]
            if to == F16:
                rename[n.output[0]] = src_name  # everything is f32 now
                continue
            if to == F32:
                if src_name in inits and inits[src_name].data_type == F16:
                    weight_casts[src_name] = n.output[0]  # keep: weight cast
                    keep.append(n)
                    continue
                if src_name in inits:  # cast of a non-f16 constant, keep
                    keep.append(n)
                    continue
                rename[n.output[0]] = src_name  # activation cast -> identity
                continue
        keep.append(n)

    def resolve(name: str) -> str:
        seen = set()
        while name in rename and name not in seen:
            seen.add(name)
            name = rename[name]
        return name

    new_nodes = []
    added = 0
    for n in keep:
        for i, inp in enumerate(n.input):
            r = resolve(inp)
            if r in inits and inits[r].data_type == F16 and n.op_type != "Cast":
                if r not in weight_casts:
                    out = r + "_f32"
                    new_nodes.append(
                        helper.make_node("Cast", [r], [out], to=F32, name=f"cast_w_{added}")
                    )
                    added += 1
                    weight_casts[r] = out
                r = weight_casts[r]
            n.input[i] = r
        new_nodes.append(n)

    for o in g.output:
        r = resolve(o.name)
        if r != o.name:
            new_nodes.append(helper.make_node("Identity", [r], [o.name], name=f"out_{o.name}"))
        if o.type.tensor_type.elem_type == F16:
            o.type.tensor_type.elem_type = F32

    del g.node[:]
    g.node.extend(new_nodes)
    del g.value_info[:]  # stale fp16 types; let inference recompute

    model = shape_inference.infer_shapes(model)
    onnx.checker.check_model(model)
    onnx.save(model, dst)

    ops = collections.Counter(n.op_type for n in model.graph.node)
    print(f"nodes={len(model.graph.node)} casts={ops['Cast']} added_weight_casts={added} removed_casts={len(rename)}")


def verify(src: str, dst: str) -> None:
    import onnxruntime as ort

    x = ((np.random.rand(1, 3, 1024, 1024).astype(np.float32)) - 0.45) / 0.225
    a = ort.InferenceSession(src, providers=["CPUExecutionProvider"]).run(None, {"pixel_values": x})[0]
    t0 = time.time()
    b = ort.InferenceSession(dst, providers=["CPUExecutionProvider"]).run(None, {"pixel_values": x})[0]
    print(f"cpu_run_s={time.time() - t0:.1f} max_abs_diff={np.abs(a - b).max():.4f} mean_abs_diff={np.abs(a - b).mean():.6f}")
    assert np.abs(a - b).mean() < 1e-2, "converted model diverges from the original"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    convert(sys.argv[1], sys.argv[2])
    verify(sys.argv[1], sys.argv[2])
