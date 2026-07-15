from __future__ import annotations

import math
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf


class AudioPreparationError(RuntimeError):
    pass


def ffmpeg_executable() -> str:
    """Использует встроенный imageio-ffmpeg, поэтому релизу не нужен Homebrew."""
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def run_ffmpeg(source: Path, destination: Path, start_seconds: float | None, end_seconds: float | None) -> None:
    """Нормализует любой поддерживаемый ffmpeg формат в mono WAV 16 kHz."""
    command = [ffmpeg_executable(), "-y", "-v", "error"]
    if start_seconds is not None and start_seconds > 0:
        command += ["-ss", str(start_seconds)]
    command += ["-i", str(source)]
    if end_seconds is not None and end_seconds > 0:
        duration = end_seconds - (start_seconds or 0)
        if duration <= 0:
            raise AudioPreparationError("Конец обрезки должен быть позже начала.")
        command += ["-t", str(duration)]
    command += ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(destination)]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise AudioPreparationError("FFmpeg не найден. Установите его командой: brew install ffmpeg") from error
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or "FFmpeg не смог прочитать аудиофайл."
        raise AudioPreparationError(message) from error


def wav_duration_seconds(path: Path) -> float:
    info = sf.info(path)
    return float(info.frames / info.samplerate)


def split_wav(path: Path, output_dir: Path, max_seconds: float = 20.0, overlap_seconds: float = 0.4) -> list[Path]:
    """Создаёт короткие WAV-фрагменты для базового long-audio режима GigaAM."""
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio[:, 0]
    max_samples = int(max_seconds * sample_rate)
    overlap_samples = int(overlap_seconds * sample_rate)
    if len(audio) <= max_samples:
        return [path]

    output_dir.mkdir(parents=True, exist_ok=True)
    chunks: list[Path] = []
    start = 0
    index = 1
    step = max_samples - overlap_samples
    while start < len(audio):
        end = min(start + max_samples, len(audio))
        chunk_path = output_dir / f"chunk-{index:04d}.wav"
        sf.write(chunk_path, audio[start:end], sample_rate, subtype="PCM_16")
        chunks.append(chunk_path)
        if end == len(audio):
            break
        start += step
        index += 1
    return chunks


def merge_chunk_texts(parts: list[str], max_overlap_words: int = 12) -> str:
    """Склеивает тексты соседних фрагментов, отбрасывая повтор на перекрытии."""
    result: list[str] = []
    for part in parts:
        incoming = part.strip().split()
        if not incoming:
            continue
        if not result:
            result.extend(incoming)
            continue
        overlap_limit = min(max_overlap_words, len(result), len(incoming))
        overlap = 0
        for size in range(overlap_limit, 0, -1):
            if [word.casefold() for word in result[-size:]] == [word.casefold() for word in incoming[:size]]:
                overlap = size
                break
        result.extend(incoming[overlap:])
    return " ".join(result)
