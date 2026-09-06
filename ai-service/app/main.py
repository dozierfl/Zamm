import asyncio, base64, hashlib, io, json, logging, math, os, struct, subprocess, tempfile, time, uuid, wave
from pathlib import Path
from typing import Any, Literal
from fastapi import FastAPI, Header, HTTPException, Request as HttpRequest
from fastapi.responses import Response
from pydantic import BaseModel, Field
from .ace_step import AceStepClient, AceStepError, AceStepRequestTranslator, AceStepSettings
from .minimax import MiniMaxClient, MiniMaxError, MiniMaxRequestTranslator, MiniMaxSettings
from .phrase_repair import render_phrase_repair
from .vocal_analysis import analyze_vocal, verify_identity_phrase

Role=Literal["MASTER","PREMASTER","NATIVE_TRACK","DERIVED_STEM","EFFECT_RETURN","ALTERNATIVE","REFERENCE","UPLOAD"]
Provenance=Literal["GENERATED_NATIVE","SEPARATED","RENDERED","UPLOADED","REFERENCE","DERIVED"]
class Instrument(BaseModel):instrument:str;instrumentGroup:str|None=None;role:str="";character:str=""
class Vocal(BaseModel):enabled:bool;role:str|None=None;tone:str="";delivery:str=""
class Plan(BaseModel):
    titleSuggestions:list[str]=[];genre:str="";subgenres:list[str]=[];mood:list[str]=[];bpm:int=Field(ge=40,le=220);key:str="";scale:str="";timeSignature:str="4/4";durationSeconds:int=Field(ge=1,le=600);instrumentation:list[Instrument]=[];vocal:Vocal=Vocal(enabled=False);structure:list[dict[str,Any]]=[];generationCaption:str="";negativeInstructions:list[str]=[]
class Request(BaseModel):
    jobId:str;userId:str;songId:str;versionId:str;compositionPlan:Plan;lyrics:str="";seed:int=Field(ge=0);outputMode:Literal["MASTER_ONLY","MULTI_ASSET"]="MASTER_ONLY";providerOptions:dict[str,Any]={}
LEGO_TARGETS={"woodwinds","brass","fx","synth","strings","percussion","keyboard","guitar","bass","drums","backing_vocals","vocals"}
class LegoRequest(BaseModel):
    jobId:str;userId:str;songId:str;versionId:str;sourceAssetId:str;targetInstrumentGroup:str;seed:int=Field(ge=0);caption:str;sourceMimeType:str="audio/wav";sourceAudioBase64:str;providerOptions:dict[str,Any]={}
class Audio(BaseModel):base64:str|None=None;sourceUrl:str|None=None
class Metadata(BaseModel):
    mimeType:str="audio/wav";codec:str="pcm_s16le";sampleRate:int=16000;bitDepth:int=16;channels:int=1;durationSeconds:float;checksum:str;waveformData:list[float]
class Asset(BaseModel):
    assetKey:str;role:Role;instrument:str|None=None;instrumentGroup:str|None=None;provenance:Provenance="GENERATED_NATIVE";isPrimary:bool=False;sortOrder:int;audio:Audio;metadata:Metadata;providerMetadata:dict[str,Any]={}
class Result(BaseModel):assets:list[Asset];providerMetadata:dict[str,Any]={}
class VocalAnalysisRequest(BaseModel):audioBase64:str;mimeType:str;minimumUsableSeconds:float=Field(default=15,ge=1,le=30)
class IdentityVerificationRequest(VocalAnalysisRequest):expectedPhrase:str
class PhraseRepairRequest(BaseModel):
    sourceAudioBase64:str;replacementAudioBase64:str;startSeconds:float=Field(ge=0);endSeconds:float=Field(gt=0);crossfadeMs:int=Field(default=80,ge=0,le=500)

SEPARATOR_STEMS=("vocals","drums","bass","guitar","piano","other")
separation_jobs:dict[str,dict[str,Any]]={}
separation_tasks:set[asyncio.Task[Any]]=set()

def separator_config():
    projects=Path(os.getenv("DOZI_PROJECTS_DIR","/Users/F.D/Projects"))
    return {
        "binary":Path(os.getenv("BS_ROFORMER_BIN",str(projects/".tools/bs-roformer-venv/bin/bs-roformer-infer"))),
        "models":Path(os.getenv("BS_ROFORMER_MODELS_DIR",str(projects/".tools/bs-roformer-models"))),
        "model":os.getenv("BS_ROFORMER_MODEL","roformer-model-bs-roformer-sw-by-jarredou"),
        "device":os.getenv("BS_ROFORMER_DEVICE","mps"),
    }

def separator_available():
    cfg=separator_config()
    return cfg["binary"].is_file() and cfg["models"].is_dir()

def separated_wav_metadata(path:Path):
    import av
    import numpy as np
    arrays=[];sample_rate=48000;channels=2
    with av.open(str(path)) as container:
        stream=container.streams.audio[0]
        sample_rate=int(stream.rate or 48000)
        for frame in container.decode(stream):
            values=frame.to_ndarray()
            if values.ndim==1:values=values[None,:]
            if values.shape[0]>8:values=values.reshape(1,-1)
            arrays.append(values.astype(np.float32,copy=False))
        channels=len(stream.codec_context.layout.channels) if stream.codec_context.layout else (arrays[0].shape[0] if arrays else 2)
    if not arrays:raise ValueError("SEPARATION_EMPTY_STEM")
    samples=np.concatenate(arrays,axis=1)
    if samples.shape[0]!=channels and channels>1:samples=samples.reshape(channels,-1,order="F")
    mono=np.max(np.abs(samples),axis=0)
    waveform=[round(float(part.max()),4) if part.size else 0.0 for part in np.array_split(mono,96)]
    data=path.read_bytes()
    return data,{
        "mimeType":"audio/wav","codec":"pcm_f32le","sampleRate":sample_rate,
        "bitDepth":32,"channels":channels,"durationSeconds":round(samples.shape[1]/sample_rate,6),
        "checksum":hashlib.sha256(data).hexdigest(),"waveformData":waveform,
    }

def run_separation(job_id:str,audio:bytes,mime_type:str):
    state=separation_jobs[job_id]
    try:
        cfg=separator_config();state.update(status="PROCESSING",progress=18,message="Loading the separation model")
        suffix=".wav" if "wav" in mime_type else ".mp3" if "mpeg" in mime_type else ".audio"
        with tempfile.TemporaryDirectory(prefix="dozi-separation-") as root:
            source_dir=Path(root)/"source";output_dir=Path(root)/"output"
            source_dir.mkdir();output_dir.mkdir();source_path=source_dir/f"master{suffix}";source_path.write_bytes(audio)
            state.update(progress=28,message="Separating vocals and instruments")
            command=[
                str(cfg["binary"]),"--model",str(cfg["model"]),"--models_dir",str(cfg["models"]),
                "--input_folder",str(source_dir),"--store_dir",str(output_dir),"--device",str(cfg["device"]),
            ]
            process=subprocess.run(command,capture_output=True,text=True,timeout=3600,check=False)
            if process.returncode!=0 and cfg["device"]=="mps" and "MPS backend" in process.stderr:
                state.update(progress=24,message="Apple acceleration unavailable; retrying safely on CPU")
                command[-1]="cpu";process=subprocess.run(command,capture_output=True,text=True,timeout=3600,check=False)
            if process.returncode!=0:
                logger.error(json.dumps({"event":"stem_separation_failed","jobId":job_id,"stderr":process.stderr[-2000:]}))
                raise RuntimeError("SEPARATION_ENGINE_FAILED")
            state.update(progress=90,message="Preparing separated tracks")
            assets=[]
            for index,stem in enumerate(SEPARATOR_STEMS):
                matches=sorted(output_dir.glob(f"*_{stem}.wav"))
                if not matches:continue
                data,metadata=separated_wav_metadata(matches[0]);token=hashlib.sha256(f"{job_id}:{stem}:{metadata['checksum']}".encode()).hexdigest()
                ace_assets[token]=(data,"audio/wav")
                assets.append({
                    "assetKey":f"separated-{stem}","role":"DERIVED_STEM","instrument":stem.title(),
                    "instrumentGroup":"VOCALS" if stem=="vocals" else "DRUMS" if stem=="drums" else "MUSIC",
                    "provenance":"SEPARATED","isPrimary":False,"sortOrder":index,
                    "audio":{"sourceUrl":f"{os.getenv('AI_SERVICE_PUBLIC_BASE_URL','http://127.0.0.1:8000')}/v1/separation-assets/{token}"},
                    "metadata":metadata,"providerMetadata":{"generationMethod":"SEPARATION","separator":cfg["model"],"editingAid":True},
                })
            if len(assets)<4:raise RuntimeError("SEPARATION_INCOMPLETE_RESULT")
            state.update(status="COMPLETE",progress=100,message="Separated tracks are ready",assets=assets)
    except Exception as exc:
        logger.exception("Stem separation failed")
        state.update(status="FAILED",progress=0,message="Stem separation could not finish",errorCode=str(exc))

def settings():return AceStepSettings(base_url=os.getenv("ACESTEP_BASE_URL","http://127.0.0.1:8001"),api_key=os.getenv("ACESTEP_API_KEY") or None,model=os.getenv("ACESTEP_MODEL","acestep-v15-turbo"),timeout_seconds=float(os.getenv("ACESTEP_TIMEOUT_SECONDS","900")),poll_interval_seconds=float(os.getenv("ACESTEP_POLL_INTERVAL_MS","2000"))/1000,thinking=os.getenv("ACESTEP_THINKING","false").lower()=="true",inference_steps=int(os.getenv("ACESTEP_INFERENCE_STEPS","8")))
def minimax_settings():return MiniMaxSettings(base_url=os.getenv("MINIMAX_BASE_URL","http://127.0.0.1:8002"),model=os.getenv("MINIMAX_MODEL","MiniMax-Music3-mxfp8"),timeout_seconds=float(os.getenv("MINIMAX_TIMEOUT_SECONDS","1800")),steps=int(os.getenv("MINIMAX_STEPS","30")))
app=FastAPI(title="Dozi AI Service",version="0.2.0")
logger=logging.getLogger("dozi.ai")
ace_assets:dict[str,tuple[bytes,str]]={}
def authorize(value:str|None):
    token=os.getenv("AI_SERVICE_TOKEN")
    if token and value!=f"Bearer {token}":raise HTTPException(401,"invalid service token")
@app.post("/v1/vocal-analysis")
def vocal_analysis(request:VocalAnalysisRequest,authorization:str|None=Header(default=None)):
    authorize(authorization)
    try:data=base64.b64decode(request.audioBase64,validate=True);return analyze_vocal(data,request.minimumUsableSeconds)
    except (ValueError,base64.binascii.Error) as exc:raise HTTPException(422,detail={"code":str(exc),"retryable":False}) from None
@app.post("/v1/vocal-analysis-audio")
async def vocal_analysis_audio(request:HttpRequest,authorization:str|None=Header(default=None),x_minimum_usable_seconds:float=Header(default=15)):
    authorize(authorization)
    try:return analyze_vocal(await request.body(),max(1,min(30,x_minimum_usable_seconds)))
    except ValueError as exc:raise HTTPException(422,detail={"code":str(exc),"retryable":False}) from None
@app.post("/v1/identity-verification")
def identity_verification(request:IdentityVerificationRequest,authorization:str|None=Header(default=None)):
    authorize(authorization)
    try:data=base64.b64decode(request.audioBase64,validate=True);return verify_identity_phrase(data,request.expectedPhrase)
    except (ValueError,base64.binascii.Error) as exc:raise HTTPException(422,detail={"code":str(exc),"retryable":False}) from None
@app.post("/v1/phrase-repair-render")
def phrase_repair_render(request:PhraseRepairRequest,authorization:str|None=Header(default=None)):
    authorize(authorization)
    try:
        source=base64.b64decode(request.sourceAudioBase64,validate=True);replacement=base64.b64decode(request.replacementAudioBase64,validate=True)
        return render_phrase_repair(source,replacement,start_seconds=request.startSeconds,end_seconds=request.endSeconds,crossfade_ms=request.crossfadeMs)
    except (ValueError,base64.binascii.Error) as exc:raise HTTPException(422,detail={"code":str(exc),"retryable":False}) from None
@app.post("/v1/stem-separation")
async def stem_separation(request:HttpRequest,authorization:str|None=Header(default=None),x_audio_mime_type:str=Header(default="audio/wav")):
    authorize(authorization)
    if not separator_available():raise HTTPException(503,detail={"code":"SEPARATION_ENGINE_UNAVAILABLE","retryable":True})
    audio=await request.body()
    if len(audio)<512 or len(audio)>120*1024*1024:raise HTTPException(422,detail={"code":"INVALID_SEPARATION_AUDIO","retryable":False})
    job_id=uuid.uuid4().hex;separation_jobs[job_id]={"jobId":job_id,"status":"QUEUED","progress":8,"message":"Separation queued","assets":[]}
    task=asyncio.create_task(asyncio.to_thread(run_separation,job_id,audio,x_audio_mime_type));separation_tasks.add(task);task.add_done_callback(separation_tasks.discard)
    return separation_jobs[job_id]
@app.get("/v1/stem-separation/{job_id}")
def stem_separation_status(job_id:str,authorization:str|None=Header(default=None)):
    authorize(authorization);state=separation_jobs.get(job_id)
    if not state:raise HTTPException(404,detail={"code":"SEPARATION_JOB_NOT_FOUND","retryable":False})
    return state
def wav_bytes(seed:int,duration:int,bpm:int):
    rate=16000;out=io.BytesIO()
    with wave.open(out,"wb") as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(b"".join(struct.pack("<h",int(5000*math.sin(2*math.pi*(110+(seed%12)*7)*i/rate))) for i in range(rate*duration)))
    return out.getvalue(),[0.1526]*96
@app.get("/health")
async def health():return{"status":"ready","gatewayAvailable":True,"stemSeparation":{"available":separator_available(),"engine":"bs-roformer"},"aceStep":await AceStepClient(settings()).health(),"minimax":await MiniMaxClient(minimax_settings()).health()}
@app.get("/capabilities")
async def capabilities(authorization:str|None=Header(default=None)):
    authorize(authorization);state=await AceStepClient(settings()).health();return{"provider":"ace-step-1.5","available":state["ready"],"textToMusic":True,"lyrics":True,"instrumental":True,"bpm":True,"keyScale":True,"timeSignature":True,"seed":True,"batchAlternatives":True,"referenceAudio":"integrated-for-lego","cover":"supported-not-integrated","repaint":"supported-not-integrated","extract":"base-model-not-integrated","lego":"integrated-experimental-base-model","legoTargets":sorted(LEGO_TARGETS),"complete":"base-model-not-integrated","nativeMultitrack":False,"masterGeneration":"EXPERIMENTAL","contextualRegeneration":"EXPERIMENTAL","sourceSeparation":"DEVELOPMENT" if separator_available() else "UNAVAILABLE","aceStep":state}
@app.post("/v1/ace-step-generation",response_model=Result)
async def ace_generate(request:Request,authorization:str|None=Header(default=None)):
    authorize(authorization);cfg=settings();payload=AceStepRequestTranslator(cfg).translate(request);started=time.monotonic();logger.info(json.dumps({"event":"ace_step_started","jobId":request.jobId,"provider":"ace-step-1.5","model":payload["model"]}))
    try:outputs=await AceStepClient(cfg).generate(payload)
    except AceStepError as exc:logger.warning(json.dumps({"event":"ace_step_failed","jobId":request.jobId,"code":exc.code,"retryable":exc.retryable,"elapsedSeconds":round(time.monotonic()-started,3)}));raise HTTPException(503 if exc.retryable else 422,detail={"code":exc.code,"retryable":exc.retryable}) from None
    assets=[]
    public_base=os.getenv("AI_SERVICE_PUBLIC_BASE_URL","http://127.0.0.1:8000")
    for index,item in enumerate(outputs):
        asset_token=hashlib.sha256(f"{request.jobId}:{index}:{item.checksum}".encode()).hexdigest();ace_assets[asset_token]=(item.data,item.mime_type);assets.append(Asset(assetKey="master" if index==0 else f"alternative-{index}",role="MASTER" if index==0 else "ALTERNATIVE",provenance="GENERATED_NATIVE",isPrimary=index==0,sortOrder=index,audio=Audio(sourceUrl=f"{public_base}/v1/ace-assets/{asset_token}"),metadata=Metadata(mimeType=item.mime_type,codec=item.codec,sampleRate=item.sample_rate,bitDepth=item.bit_depth,channels=item.channels,durationSeconds=item.duration_seconds,checksum=item.checksum,waveformData=item.waveform),providerMetadata=item.provider_metadata))
    logger.info(json.dumps({"event":"ace_step_completed","jobId":request.jobId,"taskId":assets[0].providerMetadata.get("aceStepTaskId"),"resultCount":len(assets),"elapsedSeconds":round(time.monotonic()-started,3)}));return Result(assets=assets,providerMetadata={"provider":"ace-step-1.5","model":payload["model"],"requestedSeed":request.seed,"taskId":assets[0].providerMetadata.get("aceStepTaskId")})
@app.post("/v1/minimax-generation",response_model=Result)
async def minimax_generate(request:Request,authorization:str|None=Header(default=None)):
    authorize(authorization)
    if request.outputMode!="MASTER_ONLY":raise HTTPException(422,detail={"code":"PROVIDER_OUTPUT_MODE_UNSUPPORTED","retryable":False})
    cfg=minimax_settings();payload=MiniMaxRequestTranslator(cfg).translate(request);started=time.monotonic();logger.info(json.dumps({"event":"minimax_started","jobId":request.jobId,"provider":"minimax-music3-mlx","model":cfg.model}))
    try:item=await MiniMaxClient(cfg).generate(payload)
    except MiniMaxError as exc:logger.warning(json.dumps({"event":"minimax_failed","jobId":request.jobId,"code":exc.code,"retryable":exc.retryable,"elapsedSeconds":round(time.monotonic()-started,3)}));raise HTTPException(503 if exc.retryable else 422,detail={"code":exc.code,"retryable":exc.retryable}) from None
    asset_token=hashlib.sha256(f"{request.jobId}:{item.checksum}".encode()).hexdigest();ace_assets[asset_token]=(item.data,item.mime_type);public_base=os.getenv("AI_SERVICE_PUBLIC_BASE_URL","http://127.0.0.1:8000");elapsed=round(time.monotonic()-started,3);metadata={**item.provider_metadata,"generationMethod":"FULL_SONG","elapsedSeconds":elapsed}
    asset=Asset(assetKey="master",role="MASTER",provenance="GENERATED_NATIVE",isPrimary=True,sortOrder=0,audio=Audio(sourceUrl=f"{public_base}/v1/generated-assets/{asset_token}"),metadata=Metadata(mimeType=item.mime_type,codec=item.codec,sampleRate=item.sample_rate,bitDepth=item.bit_depth,channels=item.channels,durationSeconds=item.duration_seconds,checksum=item.checksum,waveformData=item.waveform),providerMetadata=metadata)
    logger.info(json.dumps({"event":"minimax_completed","jobId":request.jobId,"elapsedSeconds":elapsed}));return Result(assets=[asset],providerMetadata={"provider":"minimax-music3-mlx","model":cfg.model,"requestedSeed":request.seed,"elapsedSeconds":elapsed})
@app.post("/v1/ace-step-lego",response_model=Result)
async def ace_lego(request:LegoRequest,authorization:str|None=Header(default=None)):
    authorize(authorization)
    if request.targetInstrumentGroup not in LEGO_TARGETS:raise HTTPException(422,detail={"code":"UNSUPPORTED_CONTEXTUAL_TRACK_TARGET","retryable":False})
    try:source=base64.b64decode(request.sourceAudioBase64,validate=True)
    except (ValueError,base64.binascii.Error):raise HTTPException(422,detail={"code":"INVALID_SOURCE_AUDIO","retryable":False}) from None
    cfg=settings();payload=AceStepRequestTranslator(cfg).translate_lego(request);started=time.monotonic()
    try:outputs=await AceStepClient(cfg).generate(payload,source,request.sourceMimeType)
    except AceStepError as exc:raise HTTPException(503 if exc.retryable else 422,detail={"code":exc.code,"retryable":exc.retryable}) from None
    if len(outputs)!=1:raise HTTPException(422,detail={"code":"GENERATION_INVALID_RESULT","retryable":False})
    item=outputs[0];target=request.targetInstrumentGroup;metadata={**item.provider_metadata,"sourceAssetId":request.sourceAssetId,"generationMethod":"LEGO_CONTEXTUAL","targetInstrumentGroup":target,"elapsedSeconds":round(time.monotonic()-started,3)}
    asset=Asset(assetKey=f"lego-{target}",role="NATIVE_TRACK",instrument=target,instrumentGroup=target,provenance="GENERATED_NATIVE",isPrimary=False,sortOrder=0,audio=Audio(base64=base64.b64encode(item.data).decode()),metadata=Metadata(mimeType=item.mime_type,codec=item.codec,sampleRate=item.sample_rate,bitDepth=item.bit_depth,channels=item.channels,durationSeconds=item.duration_seconds,checksum=item.checksum,waveformData=item.waveform),providerMetadata=metadata)
    return Result(assets=[asset],providerMetadata={"provider":"ace-step-1.5","model":payload["model"],"requestedSeed":request.seed,"taskId":item.provider_metadata.get("aceStepTaskId"),"generationMethod":"LEGO_CONTEXTUAL","sourceAssetId":request.sourceAssetId})
@app.get("/v1/ace-assets/{asset_token}")
def ace_asset(asset_token:str,authorization:str|None=Header(default=None)):
    authorize(authorization);item=ace_assets.pop(asset_token,None)
    if not item:raise HTTPException(404,"asset unavailable")
    return Response(item[0],media_type=item[1],headers={"cache-control":"no-store"})
@app.get("/v1/generated-assets/{asset_token}")
def generated_asset(asset_token:str,authorization:str|None=Header(default=None)):
    return ace_asset(asset_token,authorization)
@app.get("/v1/separation-assets/{asset_token}")
def separation_asset(asset_token:str,authorization:str|None=Header(default=None)):
    authorize(authorization);item=ace_assets.get(asset_token)
    if not item:raise HTTPException(404,"asset unavailable")
    return Response(item[0],media_type=item[1],headers={"cache-control":"no-store"})
@app.post("/v1/mock-generation",response_model=Result)
def mock_generate(request:Request,authorization:str|None=Header(default=None)):
    authorize(authorization);definitions=[("MASTER",None,None),("PREMASTER",None,None),("NATIVE_TRACK","Kick","DRUMS"),("NATIVE_TRACK","Snare","DRUMS"),("NATIVE_TRACK","Bass","MUSIC"),("NATIVE_TRACK","Lead Vocal","VOCALS")]
    if request.outputMode=="MASTER_ONLY":definitions=definitions[:1]
    assets=[]
    for index,(role,instrument,group) in enumerate(definitions):
        data,waveform=wav_bytes(request.seed+index*97,request.compositionPlan.durationSeconds,request.compositionPlan.bpm);checksum=hashlib.sha256(data).hexdigest();key=f"{role.lower()}-{(instrument or 'mix').lower().replace(' ','-')}";assets.append(Asset(assetKey=key,role=role,instrument=instrument,instrumentGroup=group,isPrimary=role=="MASTER",sortOrder=index,audio=Audio(base64=base64.b64encode(data).decode()),metadata=Metadata(durationSeconds=request.compositionPlan.durationSeconds,checksum=checksum,waveformData=waveform)))
    return Result(assets=assets,providerMetadata={"transport":"INLINE_TEST","model":"fastapi-mock-v1"})
