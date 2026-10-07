from app.hardware_profiler import hardware_profile


def test_hardware_profile_is_safe_without_privileged_system_access():
    profile = hardware_profile()
    assert "host" in profile
    assert "unifiedMemory" in profile
    assert profile["unifiedMemory"]["pressure"] in {"NORMAL", "ELEVATED", "CRITICAL", "UNKNOWN"}
    assert profile["process"]["gatewayPeakResidentBytes"] >= 0
