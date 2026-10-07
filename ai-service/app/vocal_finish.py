"""Conservative, duration-preserving vocal finishing at the mix sample rate."""
import numpy as np


def finish_vocal(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    if not np.isfinite(audio).all():
        raise ValueError("VOCAL_IDENTITY_INVALID_RESULT")
    if not audio.size:
        return audio.copy()
    # Linked-channel, soft-knee compression; interpolated controls avoid
    # block-edge gain jumps. No makeup gain: final level matching happens later.
    frames = audio.shape[1]
    hop = max(1, round(sample_rate * .01))
    starts = np.arange(0, frames, hop)
    levels = np.array([
        np.sqrt(np.mean(audio[:, start:start + hop].astype(np.float64) ** 2))
        for start in starts
    ])
    db = 20 * np.log10(np.maximum(levels, 1e-8))
    over = db + 20.0
    knee = np.where(over < -3, 0, np.where(over > 3, over, (over + 3) ** 2 / 12))
    reduction = knee * .5
    smoothed = np.empty_like(reduction)
    state = 0.0
    for i, target in enumerate(reduction):
        coefficient = np.exp(-.01 / (.02 if target > state else .15))
        state = coefficient * state + (1 - coefficient) * target
        smoothed[i] = state
    gain = 10 ** (-np.interp(np.arange(frames), starts, smoothed) / 20)
    dry = (audio * gain).astype(np.float32)
    # Short, quiet room reflections. Read only from dry audio, so there is no
    # feedback or accumulating echo; preserve exact length and onset timing.
    wet = np.zeros_like(dry)
    for channel in range(dry.shape[0]):
        for seconds, level in ((.031, .035), (.047, .028), (.071, .022), (.109, .016), (.163, .01)):
            delay = round((seconds + channel * .003) * sample_rate)
            if 0 < delay < frames:
                wet[channel, delay:] += dry[channel, :-delay] * level
    return dry + wet
