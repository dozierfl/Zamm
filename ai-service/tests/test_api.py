from fastapi.testclient import TestClient
from app.main import app
client=TestClient(app)
def request(mode="MULTI_ASSET"):
    return {"jobId":"j","userId":"u","songId":"s","versionId":"v","compositionPlan":{"bpm":84,"durationSeconds":1},"seed":7,"outputMode":mode}
def test_health(): assert client.get("/health").json()["status"]=="ready"
def test_multi_asset_contract():
    data=client.post("/v1/mock-generation",json=request()).json();assert len(data["assets"])==6;assert data["assets"][0]["role"]=="MASTER";assert all(a["metadata"]["durationSeconds"]==1 for a in data["assets"])
