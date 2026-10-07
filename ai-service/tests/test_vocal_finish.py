import numpy as np
import pytest
from app.vocal_finish import finish_vocal


def test_silence_and_duration_are_preserved():
    silence = np.zeros((2, 48000), dtype=np.float32)
    assert np.array_equal(finish_vocal(silence, 48000), silence)


def test_room_is_causal_and_compression_bounds_sustained_signal():
    source = np.zeros((2, 48000), dtype=np.float32)
    source[:, 4800:] = .7
    result = finish_vocal(source, 48000)
    assert result.shape == source.shape
    assert np.isfinite(result).all()
    assert not result[:, :4800].any()
    assert np.max(np.abs(result[:, 24000:])) < .7
    assert not np.array_equal(result[0], result[1])


def test_invalid_conversion_is_rejected():
    with pytest.raises(ValueError, match="VOCAL_IDENTITY_INVALID_RESULT"):
        finish_vocal(np.array([[np.nan]], dtype=np.float32), 48000)
