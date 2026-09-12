from fastapi.testclient import TestClient
import io
import wave
from pathlib import Path
import av
import pytest
from app.artist_vocal import resolve_rvc_artifact
from app.main import app,prepare_separation_wav,separated_wav_metadata
client=TestClient(app)
def request(mode="MULTI_ASSET"):
    return {"jobId":"j","userId":"u","songId":"s","versionId":"v","compositionPlan":{"bpm":84,"durationSeconds":1},"seed":7,"outputMode":mode}
def test_health(): assert client.get("/health").json()["status"]=="ready"
def test_capabilities_do_not_claim_production_multitrack():
    data=client.get("/capabilities").json();assert data["nativeMultitrack"] is False;assert data["masterGeneration"]=="EXPERIMENTAL";assert data["contextualRegeneration"]=="EXPERIMENTAL";assert data["sourceSeparation"] in {"DEVELOPMENT","UNAVAILABLE"}
def test_multi_asset_contract():
    data=client.post("/v1/mock-generation",json=request()).json();assert len(data["assets"])==6;assert data["assets"][0]["role"]=="MASTER";assert all(a["metadata"]["durationSeconds"]==1 for a in data["assets"])

def test_separation_input_keeps_wav_bytes(tmp_path:Path):
    source=io.BytesIO()
    with wave.open(source,"wb") as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b"\0\0"*160)
    destination=tmp_path/"master.wav"
    prepare_separation_wav(source.getvalue(),destination)
    assert destination.read_bytes()==source.getvalue()

def test_separation_input_decodes_compressed_audio(tmp_path:Path):
    encoded=io.BytesIO()
    with av.open(encoded,"w",format="mp3") as container:
        stream=container.add_stream("mp3",rate=16000)
        stream.layout="mono"
        frame=av.AudioFrame(format="s16",layout="mono",samples=1600)
        frame.sample_rate=16000
        frame.planes[0].update(b"\0\0"*1600)
        for packet in stream.encode(frame):container.mux(packet)
        for packet in stream.encode(None):container.mux(packet)
    destination=tmp_path/"master.wav"
    prepare_separation_wav(encoded.getvalue(),destination)
    assert destination.read_bytes()[:12].startswith(b"RIFF")
    with wave.open(str(destination),"rb") as wav:
        assert wav.getframerate()==16000
        assert wav.getnchannels()==1

def test_separation_input_rejects_non_audio(tmp_path:Path):
    with pytest.raises(RuntimeError,match="SEPARATION_AUDIO_DECODE_FAILED"):
        prepare_separation_wav(b"not audio",tmp_path/"master.wav")

def test_separated_stems_are_normalized_to_pcm16(tmp_path:Path):
    source=tmp_path/"float.wav"
    with av.open(str(source),"w",format="wav") as container:
        stream=container.add_stream("pcm_f32le",rate=48000)
        stream.layout="stereo"
        frame=av.AudioFrame(format="fltp",layout="stereo",samples=480)
        frame.sample_rate=48000
        frame.planes[0].update(b"\0"*(480*4))
        frame.planes[1].update(b"\0"*(480*4))
        for packet in stream.encode(frame):container.mux(packet)
        for packet in stream.encode(None):container.mux(packet)
    data,metadata=separated_wav_metadata(source)
    assert metadata["codec"]=="pcm_s16le"
    assert metadata["bitDepth"]==16
    assert len(data)<source.stat().st_size
    with wave.open(io.BytesIO(data),"rb") as wav:
        assert wav.getsampwidth()==2

def test_rvc_artifacts_must_remain_inside_private_model_root(tmp_path:Path):
    root=tmp_path/"rvc";root.mkdir()
    model=root/"voice.pth";model.write_bytes(b"model")
    outside=tmp_path/"outside.pth";outside.write_bytes(b"outside")
    assert resolve_rvc_artifact(str(model),root,".pth")==model.resolve()
    with pytest.raises(ValueError,match="VOCAL_PROFILE_MODEL_UNAVAILABLE"):
        resolve_rvc_artifact(str(outside),root,".pth")

def test_artist_vocal_endpoint_returns_master_and_editable_vocal(tmp_path:Path,monkeypatch):
    root=tmp_path/"rvc";model=root/"assets/weights/voice.pth";index=root/"assets/indices/voice.index"
    python=root/".venv/bin/python";cli=root/"infer/cli.py";separator=tmp_path/"separator";models=tmp_path/"models"
    for path in (model,index,python,cli,separator):
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b"ready")
    models.mkdir()
    monkeypatch.setenv("DOZI_RVC_ROOT",str(root));monkeypatch.setenv("BS_ROFORMER_BIN",str(separator));monkeypatch.setenv("BS_ROFORMER_MODELS_DIR",str(models))
    audio=io.BytesIO()
    with wave.open(audio,"wb") as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b"\0\0"*16000)
    metadata={"mimeType":"audio/wav","codec":"pcm_s16le","sampleRate":16000,"bitDepth":16,"channels":1,"durationSeconds":1.0,"checksum":"0"*64,"waveformData":[0.0]*96}
    def fake_render(*_args,**_kwargs):
        return {"master":{"bytes":audio.getvalue(),"metadata":metadata},"vocal":{"bytes":audio.getvalue(),"metadata":metadata},"processing":{"voiceModel":"voice.pth","retrievalIndex":"voice.index"}}
    monkeypatch.setattr("app.main.render_artist_vocal",fake_render)
    import base64
    response=client.post("/v1/artist-vocal-conversion",json={"jobId":"j","profileId":"p","profileVersionId":"v","modelRef":str(model),"indexRef":str(index),"sourceMimeType":"audio/wav","sourceAudioBase64":base64.b64encode(audio.getvalue()).decode()})
    assert response.status_code==200
    data=response.json();assert [asset["role"] for asset in data["assets"]]==["MASTER","NATIVE_TRACK"]
    assert data["assets"][1]["instrumentGroup"]=="VOCALS"
    assert data["providerMetadata"]["profileVersionId"]=="v"
