import base64, hashlib, io, math, os, struct, wave
from typing import Any, Literal
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

Role=Literal["MASTER","PREMASTER","NATIVE_TRACK","DERIVED_STEM","EFFECT_RETURN","ALTERNATIVE","REFERENCE","UPLOAD"]
Provenance=Literal["GENERATED_NATIVE","SEPARATED","RENDERED","UPLOADED","REFERENCE","DERIVED"]
class Plan(BaseModel):
    bpm:int=Field(ge=40,le=220); durationSeconds:int=Field(ge=1,le=600)
    model_config={"extra":"allow"}
class Request(BaseModel):
    jobId:str; userId:str; songId:str; versionId:str; compositionPlan:Plan; seed:int=Field(ge=0)
    outputMode:Literal["MASTER_ONLY","MULTI_ASSET"]="MASTER_ONLY"
class Audio(BaseModel): base64:str
class Metadata(BaseModel):
    mimeType:str="audio/wav"; codec:str="pcm_s16le"; sampleRate:int=16000; bitDepth:int=16; channels:int=1; durationSeconds:float; checksum:str; waveformData:list[float]
class Asset(BaseModel):
    assetKey:str; role:Role; instrument:str|None=None; instrumentGroup:str|None=None; provenance:Provenance="GENERATED_NATIVE"; isPrimary:bool=False; sortOrder:int; audio:Audio; metadata:Metadata; providerMetadata:dict[str,Any]={}
class Result(BaseModel): assets:list[Asset]; providerMetadata:dict[str,Any]={}

app=FastAPI(title="Dozi AI Service",version="0.1.0")
def authorize(value:str|None):
    token=os.getenv("AI_SERVICE_TOKEN")
    if token and value!=f"Bearer {token}": raise HTTPException(401,"invalid service token")
def wav_bytes(seed:int,duration:int,bpm:int):
    rate=16000; out=io.BytesIO()
    with wave.open(out,"wb") as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate)
        frequency=110+(seed%12)*7
        wav.writeframes(b"".join(struct.pack("<h",int(5000*math.sin(2*math.pi*frequency*i/rate))) for i in range(rate*duration)))
    data=out.getvalue();return data,[0.1526]*96
@app.get("/health")
def health(): return {"status":"ready","provider":"fastapi-mock"}
@app.get("/capabilities")
def capabilities(authorization:str|None=Header(default=None)):
    authorize(authorization);return {"textToMusic":True,"lyrics":True,"nativeMultitrack":True,"stems":False,"seed":True,"transport":"inline-test-only"}
@app.post("/v1/mock-generation",response_model=Result)
def generate(request:Request,authorization:str|None=Header(default=None)):
    authorize(authorization)
    definitions=[("MASTER",None,None),("PREMASTER",None,None),("NATIVE_TRACK","Kick","DRUMS"),("NATIVE_TRACK","Snare","DRUMS"),("NATIVE_TRACK","Bass","MUSIC"),("NATIVE_TRACK","Lead Vocal","VOCALS")]
    if request.outputMode=="MASTER_ONLY":definitions=definitions[:1]
    assets=[]
    for index,(role,instrument,group) in enumerate(definitions):
        data,waveform=wav_bytes(request.seed+index*97,request.compositionPlan.durationSeconds,request.compositionPlan.bpm);checksum=hashlib.sha256(data).hexdigest();key=f"{role.lower()}-{(instrument or 'mix').lower().replace(' ','-')}"
        assets.append(Asset(assetKey=key,role=role,instrument=instrument,instrumentGroup=group,isPrimary=role=="MASTER",sortOrder=index,audio=Audio(base64=base64.b64encode(data).decode()),metadata=Metadata(durationSeconds=request.compositionPlan.durationSeconds,checksum=checksum,waveformData=waveform)))
    return Result(assets=assets,providerMetadata={"transport":"INLINE_TEST","model":"fastapi-mock-v1"})
