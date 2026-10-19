#!/usr/bin/env python3
"""Refine only the crackle tail of the original fireworks (numpy/scipy for authoring).

Run: python3 .github/scripts/generate_fireworks.py
Original mono PCM sources are retained in .github/audio-sources. The first 180 ms,
sample rate, length and gain stay unchanged; no new boom, reverb or pitch shift.
"""

from pathlib import Path
import wave

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[2]


def render(index):
    source = ROOT / ".github/audio-sources" / f"fireworks-{index}.wav"
    with wave.open(str(source), "rb") as wav:
        params = wav.getparams()
        assert params.nchannels == 1 and params.sampwidth == 2
        original = np.frombuffer(wav.readframes(params.nframes), dtype="<i2").copy()
    rate = params.framerate
    count = len(original)
    duration = count / rate
    rng = np.random.default_rng(20261019 + index * 997)
    t = np.arange(count) / rate
    dry = original.astype(np.float64) / 32768

    # Leave the pressure wave and low-frequency body intact. Only the noisy
    # high-frequency tail fades into a quieter bed after the original attack.
    high = signal.sosfiltfilt(signal.butter(3, 1700, btype="highpass", fs=rate, output="sos"), dry)
    blend = np.clip((t - 0.18) / 0.15, 0, 1)
    blend = blend * blend * (3 - 2 * blend)
    blend *= np.clip((duration - t) / 0.09, 0, 1)
    refined = dry - high * blend * 0.62

    # Small clustered grains with uneven spacing replace the coarse, continuous
    # hiss. Each grain has a rounded attack and a short, independently varied tail.
    last_spark = duration - 0.15
    spark_band = signal.butter(2, [1500, 6200], btype="bandpass", fs=rate, output="sos")
    for center in np.sort(rng.uniform(0.25, last_spark - 0.08, 9 + index)):
        for _ in range(int(rng.integers(2, 4))):
            when = min(center + rng.uniform(0, 0.045), last_spark - 0.04)
            length = round(rng.uniform(0.025, 0.052) * rate)
            st = np.arange(length) / rate
            grain = signal.sosfilt(spark_band, rng.standard_normal(length))
            grain *= -np.expm1(-st / rng.uniform(0.00035, 0.0008)) * np.exp(-st / rng.uniform(0.002, 0.006))
            grain *= np.clip((st[-1] - st) / 0.004, 0, 1)
            grain /= max(np.max(np.abs(grain)), 1e-9)
            grain *= rng.uniform(0.045, 0.115) * np.exp(-(when - 0.25) / 0.95)
            start = round(when * rate)
            end = min(start + length, count)
            refined[start:end] += grain[:end - start] * blend[start:end]

    assert np.max(np.abs(refined)) < 1
    pcm = np.round(refined * 32768).astype("<i2")
    # Keep the transient bit-for-bit identical, without normalizing the file.
    attack = round(0.18 * rate)
    pcm[:attack] = original[:attack]
    assert np.max(np.abs(pcm.astype(np.int32))) == np.max(np.abs(original.astype(np.int32)))
    destination = ROOT / "assets/audio" / source.name
    with wave.open(str(destination), "wb") as wav:
        wav.setparams(params)
        wav.writeframes(pcm.tobytes())
    print(f"{source.name}: original {duration:.1f}s / {rate} Hz mono; first 180 ms and peak unchanged, crackle tail refined")


if __name__ == "__main__":
    for index in range(1, 4):
        render(index)
