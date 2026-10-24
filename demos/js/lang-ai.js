// LangAI — optional, lazy "real AI" layer shared by language demos.
// Transformers.js 3.8.1 is imported from jsdelivr only on first call; pages must work without it.
//
//   await LangAI.lib()                              → the Transformers.js module (env.allowLocalModels=false)
//   await LangAI.tokenizer(id, onProgress?)         → AutoTokenizer (cached), e.g. "Xenova/gpt2"
//   await LangAI.causalLM(id, onProgress?)          → { tok, model } (q8, cached), e.g. "Xenova/distilgpt2"
//   await LangAI.nextLogits(lm, text)               → Float32Array of next-token logits (prepends <|endoftext|>)
//   onProgress(fraction|null, bytesLoaded)          → fraction is null when servers hide file sizes
// All promises reject on network failure; callers should toast + carry on.
window.LangAI = (function () {
  const LIB_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
  let libPromise = null;
  const cache = {};

  function lib() {
    if (!libPromise) {
      libPromise = import(LIB_URL).then((m) => {
        m.env.allowLocalModels = false;
        return m;
      });
      libPromise.catch(() => (libPromise = null));
    }
    return libPromise;
  }

  // Combines per-file download events into one 0..1 number.
  function progressTracker(onProgress) {
    const files = {};
    return (e) => {
      if (!onProgress) return;
      if (e.status === "progress") files[e.file] = { loaded: e.loaded || 0, total: e.total || 0 };
      else if (e.status === "done" && files[e.file] && files[e.file].total) files[e.file].loaded = files[e.file].total;
      let loaded = 0, total = 0, known = true;
      for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; if (!f.total) known = false; }
      // Some servers hide file sizes; then we can only report bytes so far.
      onProgress(known && total ? loaded / total : null, loaded);
    };
  }

  async function tokenizer(modelId, onProgress) {
    const key = "tok:" + modelId;
    if (!cache[key]) {
      cache[key] = lib().then((m) => m.AutoTokenizer.from_pretrained(modelId, { progress_callback: progressTracker(onProgress) }));
      cache[key].catch(() => delete cache[key]);
    }
    return cache[key];
  }

  async function causalLM(modelId, onProgress) {
    const key = "lm:" + modelId;
    if (!cache[key]) {
      cache[key] = (async () => {
        const m = await lib();
        const track = progressTracker(onProgress);
        const [tok, model] = await Promise.all([
          m.AutoTokenizer.from_pretrained(modelId, { progress_callback: track }),
          m.AutoModelForCausalLM.from_pretrained(modelId, { progress_callback: track, dtype: "q8" }),
        ]);
        return { tok, model };
      })();
      cache[key].catch(() => delete cache[key]);
    }
    return cache[key];
  }

  // One forward pass. Returns the raw scores (logits) for every possible next token.
  // GPT-2 expects a "start of text" marker; without it the first guesses are odd.
  async function nextLogits(lm, text) {
    const inputs = lm.tok("<|endoftext|>" + text);
    const out = await lm.model(inputs);
    const [, seq, vocab] = out.logits.dims;
    return out.logits.data.slice((seq - 1) * vocab, seq * vocab);
  }

  return { lib, tokenizer, causalLM, nextLogits, LIB_URL };
})();
