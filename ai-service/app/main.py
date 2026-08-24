import base64, hashlib, io, json, logging, math, os, struct, time, wave
from typing import Any, Literal
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from .ace_step import AceStepClient, AceStepError, AceStepRequestTranslator, AceStepSettings

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

def settings():return AceStepSettings(base_url=os.getenv("ACESTEP_BASE_URL","http://127.0.0.1:8001"),api_key=os.getenv("ACESTEP_API_KEY") or None,model=os.getenv("ACESTEP_MODEL","acestep-v15-turbo"),timeout_seconds=float(os.getenv("ACESTEP_TIMEOUT_SECONDS","900")),poll_interval_seconds=float(os.getenv("ACESTEP_POLL_INTERVAL_MS","2000"))/1000,thinking=os.getenv("ACESTEP_THINKING","false").lower()=="true",inference_steps=int(os.getenv("ACESTEP_INFERENCE_STEPS","8")))
app=FastAPI(title="Dozi AI Service",version="0.2.0")
logger=logging.getLogger("dozi.ai")
ace_assets:dict[str,tuple[bytes,str]]={}
def authorize(value:str|None):
    token=os.getenv("AI_SERVICE_TOKEN")
    if token and value!=f"Bearer {token}":raise HTTPException(401,"invalid service token")
def wav_bytes(seed:int,duration:int,bpm:int):
    rate=16000;out=io.BytesIO()
    with wave.open(out,"wb") as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(b"".join(struct.pack("<h",int(5000*math.sin(2*math.pi*(110+(seed%12)*7)*i/rate))) for i in range(rate*duration)))
    return out.getvalue(),[0.1526]*96
@app.get("/health")
async def health():return{"status":"ready","gatewayAvailable":True,"aceStep":await AceStepClient(settings()).health()}
@app.get("/capabilities")
async def capabilities(authorization:str|None=Header(default=None)):
    authorize(authorization);state=await AceStepClient(settings()).health();return{"provider":"ace-step-1.5","available":state["ready"],"textToMusic":True,"lyrics":True,"instrumental":True,"bpm":True,"keyScale":True,"timeSignature":True,"seed":True,"batchAlternatives":True,"referenceAudio":"integrated-for-lego","cover":"supported-not-integrated","repaint":"supported-not-integrated","extract":"base-model-not-integrated","lego":"integrated-experimental-base-model","legoTargets":sorted(LEGO_TARGETS),"complete":"base-model-not-integrated","nativeMultitrack":False,"masterGeneration":"EXPERIMENTAL","contextualRegeneration":"EXPERIMENTAL","sourceSeparation":"UNAVAILABLE","aceStep":state}
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
@app.post("/v1/mock-generation",response_model=Result)
def mock_generate(request:Request,authorization:str|None=Header(default=None)):
    authorize(authorization);definitions=[("MASTER",None,None),("PREMASTER",None,None),("NATIVE_TRACK","Kick","DRUMS"),("NATIVE_TRACK","Snare","DRUMS"),("NATIVE_TRACK","Bass","MUSIC"),("NATIVE_TRACK","Lead Vocal","VOCALS")]
    if request.outputMode=="MASTER_ONLY":definitions=definitions[:1]
    assets=[]
    for index,(role,instrument,group) in enumerate(definitions):
        data,waveform=wav_bytes(request.seed+index*97,request.compositionPlan.durationSeconds,request.compositionPlan.bpm);checksum=hashlib.sha256(data).hexdigest();key=f"{role.lower()}-{(instrument or 'mix').lower().replace(' ','-')}";assets.append(Asset(assetKey=key,role=role,instrument=instrument,instrumentGroup=group,isPrimary=role=="MASTER",sortOrder=index,audio=Audio(base64=base64.b64encode(data).decode()),metadata=Metadata(durationSeconds=request.compositionPlan.durationSeconds,checksum=checksum,waveformData=waveform)))
    return Result(assets=assets,providerMetadata={"transport":"INLINE_TEST","model":"fastapi-mock-v1"})
