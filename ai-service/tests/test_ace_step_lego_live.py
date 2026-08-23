import base64, os
from pathlib import Path
import httpx, pytest

pytestmark=pytest.mark.skipif(os.getenv("RUN_ACESTEP_LEGO_INTEGRATION")!="1",reason="set RUN_ACESTEP_LEGO_INTEGRATION=1 and ACESTEP_LEGO_SOURCE")
def test_real_lego_bass_through_gateway():
    source=Path(os.environ["ACESTEP_LEGO_SOURCE"]).read_bytes();gateway=os.getenv("AI_SERVICE_BASE_URL","http://127.0.0.1:8000")
    payload={"jobId":"live-lego-bass","userId":"rd","songId":"rd","versionId":"rd","sourceAssetId":"00000000-0000-4000-8000-000000000001","targetInstrumentGroup":"bass","seed":8401,"caption":"warm reflective neo-soul at 74 BPM in F# minor","sourceMimeType":"audio/wav","sourceAudioBase64":base64.b64encode(source).decode(),"providerOptions":{"model":"acestep-v15-base","inferenceSteps":8,"guidanceScale":7,"shift":3}}
    result=httpx.post(f"{gateway}/v1/ace-step-lego",json=payload,timeout=1200).json();asset=result["assets"][0]
    assert asset["role"]=="NATIVE_TRACK";assert asset["provenance"]=="GENERATED_NATIVE";assert asset["providerMetadata"]["generationMethod"]=="LEGO_CONTEXTUAL";assert len(base64.b64decode(asset["audio"]["base64"]))>44
