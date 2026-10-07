from app.coreml_classifier import classifier_status


def test_classifier_is_standby_without_an_owner_configured_model(monkeypatch):
    monkeypatch.delenv("DOZI_COREML_AUDIO_CLASSIFIER", raising=False)
    status = classifier_status()
    assert status["state"] in {"STANDBY", "UNAVAILABLE"}
    assert status["modelConfigured"] is False
    assert status["computeUnits"] == "ALL"
