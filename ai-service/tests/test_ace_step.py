import io,json,wave
import httpx,pytest
from app.ace_step import AceStepClient,AceStepError,AceStepRequestTranslator,AceStepSettings
from app.main import Request
@pytest.fixture
def anyio_backend():return "asyncio"
def request(vocal=True,lyrics="[Verse]\nHello"):
    return Request(jobId="j",userId="u",songId="s",versionId="v",seed=123,lyrics=lyrics,compositionPlan={"genre":"Neo-soul","mood":["warm","reflective"],"bpm":74,"key":"F#","scale":"minor","timeSignature":"4/4","durationSeconds":12,"instrumentation":[{"instrument":"Rhodes","character":"warm"}],"vocal":{"enabled":vocal},"generationCaption":"laid-back pocket"})
def wrapped(data):return{"data":data,"code":200,"error":None,"timestamp":1,"extra":None}
def wav_data():
    out=io.BytesIO()
    with wave.open(out,"wb") as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(44100);f.writeframes(b"\0\0\0\0"*44100)
    return out.getvalue()
def test_translator_maps_plan_lyrics_seed_and_instrumental():
    translator=AceStepRequestTranslator(AceStepSettings())
    payload=translator.translate(request());assert payload["bpm"]==74;assert payload["key_scale"]=="F# minor";assert payload["time_signature"]=="4";assert payload["seed"]==123;assert payload["use_random_seed"] is False;assert "Rhodes" in payload["prompt"];assert payload["lyrics"].startswith("[Verse]")
    assert translator.translate(request(False,""))["lyrics"]=="[instrumental]"
def test_lego_translator_uses_base_model_and_context_instruction():
    class Lego:targetInstrumentGroup="bass";caption="warm neo-soul";seed=8401;providerOptions={}
    payload=AceStepRequestTranslator(AceStepSettings()).translate_lego(Lego())
    assert payload["task_type"]=="lego";assert payload["model"]=="acestep-v15-base";assert payload["track_name"]=="bass";assert payload["instruction"]=="Generate the BASS track based on the audio context:";assert payload["thinking"] is False;assert payload["seed"]==8401
@pytest.mark.anyio
async def test_async_success_and_audio_metadata():
    calls=0
    async def handler(req):
        nonlocal calls;calls+=1
        if req.url.path=="/release_task":return httpx.Response(200,json=wrapped({"task_id":"t1"}))
        if req.url.path=="/query_result":return httpx.Response(200,json=wrapped([{"task_id":"t1","status":1,"result":json.dumps([{"file":"/v1/audio?path=x.wav","dit_model":"acestep-v15-turbo","seed_value":"123"}])}]))
        return httpx.Response(200,content=wav_data(),headers={"content-type":"audio/wav"})
    client=AceStepClient(AceStepSettings(poll_interval_seconds=0),httpx.AsyncClient(transport=httpx.MockTransport(handler)));result=await client.generate({});assert calls==3;assert result[0].sample_rate==44100;assert result[0].channels==2;assert result[0].provider_metadata["aceStepTaskId"]=="t1"
@pytest.mark.anyio
async def test_offline_timeout_failure_and_malformed_results():
    async def offline(req):raise httpx.ConnectError("offline",request=req)
    with pytest.raises(AceStepError,match="GENERATION_PROVIDER_UNAVAILABLE"):await AceStepClient(AceStepSettings(),httpx.AsyncClient(transport=httpx.MockTransport(offline))).generate({})
    async def running(req):return httpx.Response(200,json=wrapped({"task_id":"t"}) if req.url.path=="/release_task" else wrapped([{"task_id":"t","status":0,"result":"[]"}]))
    with pytest.raises(AceStepError,match="GENERATION_TIMEOUT"):await AceStepClient(AceStepSettings(timeout_seconds=0,poll_interval_seconds=0),httpx.AsyncClient(transport=httpx.MockTransport(running))).generate({})
    async def failed(req):return httpx.Response(200,json=wrapped({"task_id":"t"}) if req.url.path=="/release_task" else wrapped([{"task_id":"t","status":2,"result":"[]"}]))
    with pytest.raises(AceStepError,match="GENERATION_PROVIDER_FAILED"):await AceStepClient(AceStepSettings(poll_interval_seconds=0),httpx.AsyncClient(transport=httpx.MockTransport(failed))).generate({})
    async def malformed(req):return httpx.Response(200,json=wrapped({"task_id":"t"}) if req.url.path=="/release_task" else wrapped([{"task_id":"t","status":1,"result":"not-json"}]))
    with pytest.raises(AceStepError,match="GENERATION_INVALID_RESULT"):await AceStepClient(AceStepSettings(poll_interval_seconds=0),httpx.AsyncClient(transport=httpx.MockTransport(malformed))).generate({})
