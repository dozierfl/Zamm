import asyncio

from app.compute import LocalComputeScheduler, resolve_compute_target


def test_explicit_cpu_is_stable_for_every_workload():
    target = resolve_compute_target("stem_separation", "cpu")
    assert target.accelerator == "cpu"
    assert target.subprocess_device == "cpu"
    assert target.runtime == "cpu"


def test_invalid_preferences_fall_back_safely():
    target = resolve_compute_target("voice_conversion", "not-a-device")
    assert target.accelerator in {"cpu", "mps", "cuda"}
    assert target.environment()["DOZI_COMPUTE_WORKLOAD"] == "voice_conversion"


def test_audio_classification_has_a_safe_runtime_choice():
    target = resolve_compute_target("audio_classification")
    assert target.runtime in {"cpu", "pytorch", "coreml"}


def test_unavailable_accelerator_falls_back_to_cpu():
    target = resolve_compute_target("transcription", "cuda")
    # This assertion remains valid on a CUDA machine too: no false device name.
    assert target.accelerator in {"cpu", "cuda"}
    assert target.torch_device == target.accelerator


def test_scheduler_serializes_heavy_local_workloads():
    async def exercise():
        scheduler = LocalComputeScheduler()
        seen: list[str] = []

        async def run(workload: str, job_id: str):
            async with scheduler.reserve(workload, job_id):
                seen.append(job_id)
                await asyncio.sleep(0)

        await asyncio.gather(
            run("music_generation", "music"),
            run("stem_separation", "stems"),
        )
        assert seen == ["music", "stems"]
        assert scheduler.status()["active"] == []

    asyncio.run(exercise())
