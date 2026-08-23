import asyncio, hashlib, io, json, time, wave
from dataclasses import dataclass
from typing import Any
import httpx
from pydantic import BaseModel, Field

class AceStepError(Exception):
    def __init__(self,code:str,retryable:bool=False): super().__init__(code);self.code=code;self.retryable=retryable

class AceStepSettings(BaseModel):
    base_url:str="http://127.0.0.1:8001";api_key:str|None=None;model:str="acestep-v15-turbo";timeout_seconds:float=900;poll_interval_seconds:float=2;thinking:bool=False;inference_steps:int=8

class AceStepRequestTranslator:
    def __init__(self,settings:AceStepSettings):self.settings=settings
    def translate(self,request:Any)->dict[str,Any]:
        plan=request.compositionPlan
        instruments=", ".join(f"{x.instrument} ({x.character})" for x in plan.instrumentation)
        moods=", ".join(plan.mood)
        caption=f"{plan.genre}; {moods}; {plan.bpm} BPM; {plan.key} {plan.scale}; {plan.timeSignature}; instrumentation: {instruments}; arrangement: {plan.generationCaption}"
        instrumental=not plan.vocal.enabled
        lyrics="[instrumental]" if instrumental else (request.lyrics.strip() or "[instrumental]")
        options=request.providerOptions or {}
        batch=max(1,min(int(options.get("variationCount",1)),8))
        return{"prompt":caption,"lyrics":lyrics,"task_type":"text2music","model":options.get("model",self.settings.model),"thinking":bool(options.get("thinking",self.settings.thinking)),"audio_format":"wav","bpm":plan.bpm,"key_scale":f"{plan.key} {plan.scale}","time_signature":plan.timeSignature.split("/")[0],"audio_duration":max(10,plan.durationSeconds),"use_random_seed":False,"seed":request.seed,"batch_size":batch,"inference_steps":int(options.get("inferenceSteps",self.settings.inference_steps)),"use_cot_caption":False,"use_cot_language":False}
    def translate_lego(self,request:Any)->dict[str,Any]:
        options=request.providerOptions or {};target=request.targetInstrumentGroup
        return{"prompt":request.caption,"global_caption":request.caption,"lyrics":"[instrumental]","task_type":"lego","track_name":target,"instruction":f"Generate the {target.upper()} track based on the audio context:","model":options.get("model","acestep-v15-base"),"thinking":False,"audio_format":"wav","use_random_seed":False,"seed":request.seed,"batch_size":1,"inference_steps":int(options.get("inferenceSteps",8)),"guidance_scale":float(options.get("guidanceScale",7.0)),"shift":float(options.get("shift",3.0)),"repainting_start":0.0,"repainting_end":-1,"use_cot_caption":False,"use_cot_language":False}

@dataclass
class AceStepAudio:
    data:bytes;mime_type:str;codec:str;sample_rate:int;bit_depth:int;channels:int;duration_seconds:float;checksum:str;waveform:list[float];provider_metadata:dict[str,Any]

class AceStepClient:
    def __init__(self,settings:AceStepSettings,client:httpx.AsyncClient|None=None):self.settings=settings;self.client=client or httpx.AsyncClient(timeout=30)
    def headers(self):return{"Authorization":f"Bearer {self.settings.api_key}"} if self.settings.api_key else {}
    async def health(self)->dict[str,Any]:
        try:
            health=await self.client.get(f"{self.settings.base_url}/health",headers=self.headers());models=await self.client.get(f"{self.settings.base_url}/v1/models",headers=self.headers());health_data=(health.json().get("data") or {}) if health.is_success else {};model_data=models.json().get("data",[]) if models.is_success else []
            return{"apiAvailable":health.is_success,"modelDiscoveryAvailable":models.is_success,"models":model_data,"modelsInitialized":health_data.get("models_initialized",False),"llmInitialized":health_data.get("llm_initialized",False),"loadedModel":health_data.get("loaded_model"),"ready":health.is_success and models.is_success and bool(health_data.get("models_initialized")) and bool(model_data)}
        except httpx.HTTPError:return{"apiAvailable":False,"modelDiscoveryAvailable":False,"models":[],"ready":False}
    async def generate(self,payload:dict[str,Any],source_audio:bytes|None=None,source_mime_type:str="audio/wav")->list[AceStepAudio]:
        try:
            if source_audio is None:response=await self.client.post(f"{self.settings.base_url}/release_task",json=payload,headers=self.headers())
            else:
                form={key:(str(value).lower() if isinstance(value,bool) else str(value)) for key,value in payload.items() if value is not None}
                response=await self.client.post(f"{self.settings.base_url}/release_task",data=form,files={"src_audio":("context.wav",source_audio,source_mime_type)},headers=self.headers())
        except httpx.HTTPError as exc:raise AceStepError("GENERATION_PROVIDER_UNAVAILABLE",True) from exc
        envelope=self._envelope(response);task_id=(envelope.get("data") or {}).get("task_id")
        if not task_id:raise AceStepError("GENERATION_INVALID_RESULT")
        deadline=time.monotonic()+self.settings.timeout_seconds
        while time.monotonic()<deadline:
            await asyncio.sleep(self.settings.poll_interval_seconds)
            try:query=await self.client.post(f"{self.settings.base_url}/query_result",json={"task_id_list":[task_id]},headers=self.headers())
            except httpx.HTTPError as exc:raise AceStepError("GENERATION_PROVIDER_UNAVAILABLE",True) from exc
            item=self._query_item(query,task_id)
            if item["status"]==2:raise AceStepError("GENERATION_PROVIDER_FAILED")
            if item["status"]==1:return await self._download_results(task_id,item["result"])
        raise AceStepError("GENERATION_TIMEOUT",True)
    def _envelope(self,response:httpx.Response)->dict[str,Any]:
        if not response.is_success:raise AceStepError("GENERATION_PROVIDER_UNAVAILABLE",response.status_code>=500)
        try:data=response.json()
        except ValueError as exc:raise AceStepError("GENERATION_INVALID_RESULT") from exc
        if not isinstance(data,dict) or data.get("code")!=200:raise AceStepError("GENERATION_PROVIDER_FAILED")
        return data
    def _query_item(self,response:httpx.Response,task_id:str)->dict[str,Any]:
        data=self._envelope(response).get("data")
        if not isinstance(data,list) or not data or data[0].get("task_id")!=task_id:raise AceStepError("GENERATION_INVALID_RESULT")
        item=data[0]
        if item.get("status") not in (0,1,2):raise AceStepError("GENERATION_INVALID_RESULT")
        if item["status"]==1:
            try:item={**item,"result":json.loads(item.get("result","[]"))}
            except (TypeError,json.JSONDecodeError) as exc:raise AceStepError("GENERATION_INVALID_RESULT") from exc
            if not isinstance(item["result"],list) or not item["result"]:raise AceStepError("GENERATION_INVALID_RESULT")
        return item
    async def _download_results(self,task_id:str,results:list[dict[str,Any]])->list[AceStepAudio]:
        output=[]
        for index,result in enumerate(results):
            path=result.get("file")
            if not isinstance(path,str) or not path.startswith("/v1/audio?"):raise AceStepError("GENERATION_INVALID_RESULT")
            try:response=await self.client.get(f"{self.settings.base_url}{path}",headers=self.headers())
            except httpx.HTTPError as exc:raise AceStepError("GENERATION_PROVIDER_UNAVAILABLE",True) from exc
            if not response.is_success or len(response.content)<44:raise AceStepError("GENERATION_INVALID_RESULT")
            output.append(self._inspect_wav(response.content,{"aceStepTaskId":task_id,"batchIndex":index,"ditModel":result.get("dit_model"),"lmModel":result.get("lm_model"),"actualSeed":result.get("seed_value"),"generationInfo":result.get("generation_info")}))
        return output
    def _inspect_wav(self,data:bytes,metadata:dict[str,Any])->AceStepAudio:
        try:
            with wave.open(io.BytesIO(data),"rb") as audio:
                channels=audio.getnchannels();rate=audio.getframerate();width=audio.getsampwidth();frames=audio.getnframes();duration=frames/rate
                if channels not in (1,2) or rate<8000 or width not in (2,3,4) or duration<1:raise ValueError
                raw=audio.readframes(frames);waveform=[];step=max(1,frames//96)
                for i in range(96):
                    offset=min(len(raw)-width,max(0,i*step*channels*width));sample=int.from_bytes(raw[offset:offset+width],"little",signed=True);waveform.append(round(abs(sample)/(2**(width*8-1)),4))
        except (wave.Error,ValueError) as exc:raise AceStepError("GENERATION_INVALID_RESULT") from exc
        return AceStepAudio(data,"audio/wav",f"pcm_s{width*8}le",rate,width*8,channels,duration,hashlib.sha256(data).hexdigest(),waveform,metadata)
