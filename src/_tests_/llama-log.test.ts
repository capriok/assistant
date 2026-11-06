import { describe, expect, it } from "bun:test"
import { newLogState, summarizeLine } from "../help/llama-log.ts"

// Real lines from llama-server's output.
const run = (lines: string[], startedAt = 0, now = 8200) => {
  const state = newLogState(startedAt)
  return lines.flatMap((l) => summarizeLine(l, state, now) ?? [])
}

describe("summarizeLine", () => {
  it("keeps loading and ready, drops the model dump", () => {
    expect(
      run([
        "srv    load_model: loading model '/Users/x/Library/Caches/llama.cpp/bartowski_Qwen2.5-7B-Instruct-GGUF_Qwen2.5-7B-Instruct-Q4_K_M.gguf'",
        "llama_model_loader: - kv   0:                       general.architecture str              = qwen2",
        "print_info: n_vocab               = 152064",
        "load_tensors: offloaded 29/29 layers to GPU",
        "main: server is listening on http://127.0.0.1:8000",
        "srv  update_slots: all slots are idle",
      ])
    ).toEqual([
      "loading bartowski_Qwen2.5-7B-Instruct-GGUF_Qwen2.5-7B-Instruct-Q4_K_M.gguf…",
      "ready on http://127.0.0.1:8000 (8.2s)",
    ])
  })

  it("turns a request's timings into one line", () => {
    expect(
      run([
        "slot launch_slot_: id  0 | task 0 | processing task, is_child = 0",
        "prompt eval time =     782.84 ms /   351 tokens (    2.23 ms per token,   448.37 tokens per second)",
        "       eval time =     926.05 ms /    44 tokens (   21.05 ms per token,    47.51 tokens per second)",
        "      total time =    1708.89 ms /   395 tokens",
        "srv  log_server_r: done request: POST /v1/chat/completions 127.0.0.1 200",
      ])
    ).toEqual(["request: 351 new prompt tokens in 0.8s, 44 reply tokens in 0.9s"])
  })

  it("shows errors and failed requests, but not routine noise", () => {
    expect(
      run([
        "common_download_file_single_online: HEAD failed, status: 404",
        "no remote preset found, skipping",
        "/x/ggml/src/ggml-metal/ggml-metal-device.m:612: GGML_ASSERT([rsets->data count] == 0) failed",
        "srv  log_server_r: done request: POST /v1/chat/completions 127.0.0.1 400",
        "request (3195 tokens) exceeds the available context size (2048 tokens)",
      ])
    ).toEqual([
      "request failed: POST /v1/chat/completions → 400",
      "request (3195 tokens) exceeds the available context size (2048 tokens)",
    ])
  })
})
