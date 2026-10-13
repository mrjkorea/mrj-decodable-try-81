// MRJ Decodable — mono decode for Citrinet grading (browser script tag).
async function decodeAudioToMono(blob, targetRate) {
  targetRate = targetRate == null ? 16000 : targetRate;
  const buf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(buf);
    const ch0 = decoded.getChannelData(0);
    const srcRate = decoded.sampleRate;
    if (srcRate === targetRate) return ch0.slice();
    const ratio = srcRate / targetRate;
    const outLen = Math.floor(ch0.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, ch0.length - 1);
      const frac = pos - i0;
      out[i] = ch0[i0] * (1 - frac) + ch0[i1] * frac;
    }
    return out;
  } finally {
    if (typeof ctx.close === 'function') ctx.close().catch(function () {});
  }
}

window.decodeAudioToMono = decodeAudioToMono;
