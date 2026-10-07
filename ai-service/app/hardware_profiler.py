"""Small, dependency-free local hardware profiler for Dozi diagnostics."""

from __future__ import annotations

import os
from pathlib import Path
import platform
import re
import resource
import subprocess
from typing import Any


def _command(*args: str) -> str:
    try:
        return subprocess.run(args, check=False, capture_output=True, text=True, timeout=2).stdout.strip()
    # Sandboxed environments can deny a harmless diagnostic command such as
    # ``ps``. Diagnostics must never make the gateway unavailable.
    except (FileNotFoundError, PermissionError, OSError, subprocess.TimeoutExpired):
        return ""


def _sysctl(name: str) -> str:
    return _command("sysctl", "-n", name)


def _number(value: str) -> int | None:
    try:
        return int(value.strip())
    except ValueError:
        return None


def _mac_memory() -> dict[str, Any]:
    vm_stat, page_size = _command("vm_stat"), 4096
    match = re.search(r"page size of (\d+) bytes", vm_stat)
    if match:
        page_size = int(match.group(1))
    values = {key.lower().replace(" ", "_"): int(raw) for key, raw in re.findall(r"Pages ([^:]+):\s+(\d+)", vm_stat)}
    total = _number(_sysctl("hw.memsize"))
    free_pages = values.get("free", 0) + values.get("speculative", 0)
    available_pages = free_pages + values.get("inactive", 0) + values.get("purgeable", 0)
    compressed_pages = values.get("occupied_by_compressor", 0) or values.get("compressed", 0)
    pressure_output = _command("memory_pressure", "-Q")
    free_match = re.search(r"memory free percentage:\s*(\d+)%", pressure_output, re.I)
    free_percent = int(free_match.group(1)) if free_match else (round(free_pages * page_size / total * 100, 1) if total else None)
    pressure = "UNKNOWN" if free_percent is None else "NORMAL" if free_percent >= 20 else "ELEVATED" if free_percent >= 10 else "CRITICAL"
    return {"totalBytes": total,"availableBytes": available_pages * page_size if vm_stat else None,"compressedBytes": compressed_pages * page_size if vm_stat else None,"freePercent": free_percent,"pressure": pressure}


def _generic_memory() -> dict[str, Any]:
    try:
        entries = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines() if ":" in line)
        total = int(entries["MemTotal"].split()[0]) * 1024
        available = int(entries.get("MemAvailable", "0").split()[0]) * 1024
        free_percent = round(available / total * 100, 1) if total else None
        return {"totalBytes": total,"availableBytes": available,"compressedBytes": None,"freePercent": free_percent,"pressure": "NORMAL" if free_percent is not None and free_percent >= 20 else "ELEVATED"}
    except (FileNotFoundError, KeyError, ValueError):
        return {"totalBytes": None,"availableBytes": None,"compressedBytes": None,"freePercent": None,"pressure": "UNKNOWN"}


def hardware_profile() -> dict[str, Any]:
    """Return a current, privacy-safe snapshot without requiring sudo."""
    is_macos = platform.system() == "Darwin"
    memory = _mac_memory() if is_macos else _generic_memory()
    power = _command("pmset", "-g", "batt") if is_macos else ""
    source_match = re.search(r"Now drawing from '([^']+)'", power)
    process_rss = _command("ps", "-o", "rss=", "-p", str(os.getpid()))
    process_rss_bytes = (_number(process_rss) or 0) * 1024
    return {
        "host": {"system": platform.system(),"release": platform.release(),"machine": platform.machine(),"model": _sysctl("hw.model") if is_macos else None,"cpu": _sysctl("machdep.cpu.brand_string") if is_macos else platform.processor() or None,"physicalCpuCores": _number(_sysctl("hw.physicalcpu")) if is_macos else os.cpu_count(),"logicalCpuCores": _number(_sysctl("hw.logicalcpu")) if is_macos else os.cpu_count(),"appleSilicon": is_macos and platform.machine().lower() in {"arm64", "aarch64"}},
        "unifiedMemory": memory,
        "power": {"source": source_match.group(1) if source_match else "UNKNOWN","thermalState": "UNAVAILABLE_WITHOUT_PRIVILEGED_SENSOR_ACCESS"},
        "process": {"gatewayPeakResidentBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if is_macos else 1024),"gatewayResidentBytes": process_rss_bytes or None},
        "gpu": {"utilization": "UNAVAILABLE_WITHOUT_VENDOR_COUNTER_ACCESS","note": "Metal/MLX workload selection is reported by Dozi compute capabilities."},
    }
