"""SLURM/PBS cluster access via SSH using paramiko."""
import json
from functools import partial
from typing import Dict, List, Optional

import paramiko

from config import settings


def _connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs: dict = {
        "hostname": settings.CLUSTER_HOST,
        "username": settings.CLUSTER_USER,
        "timeout": 30,
    }
    if settings.CLUSTER_KEY_PATH:
        kwargs["key_filename"] = settings.CLUSTER_KEY_PATH
    client.connect(**kwargs)
    return client


def _exec(client: paramiko.SSHClient, cmd: str) -> str:
    _, stdout, _ = client.exec_command(cmd, timeout=30)
    return stdout.read().decode("utf-8", errors="replace")


def _available() -> bool:
    return bool(settings.CLUSTER_HOST and settings.CLUSTER_USER)


# ── SLURM ────────────────────────────────────────────────────────────────────

def get_slurm_queue(user: Optional[str] = None) -> List[Dict]:
    if not _available():
        return []
    client = _connect()
    try:
        cmd = "squeue --format='%i|%j|%u|%T|%M|%l|%R|%P' --noheader"
        if user:
            cmd += f" -u {user}"
        output = _exec(client, cmd)
        jobs = []
        for line in output.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 8:
                jobs.append(
                    {
                        "job_id": parts[0].strip(),
                        "name": parts[1].strip(),
                        "user": parts[2].strip(),
                        "state": parts[3].strip(),
                        "time": parts[4].strip(),
                        "time_limit": parts[5].strip(),
                        "reason": parts[6].strip(),
                        "partition": parts[7].strip(),
                        "scheduler": "slurm",
                    }
                )
        return jobs
    finally:
        client.close()


def get_slurm_nodes() -> List[Dict]:
    if not _available():
        return []
    client = _connect()
    try:
        output = _exec(
            client,
            "sinfo --format='%n|%T|%c|%m|%G|%P' --noheader 2>/dev/null",
        )
        nodes = []
        for line in output.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 6:
                nodes.append(
                    {
                        "name": parts[0].strip(),
                        "state": parts[1].strip(),
                        "cpus": parts[2].strip(),
                        "memory_mb": parts[3].strip(),
                        "gres": parts[4].strip(),
                        "partition": parts[5].strip(),
                        "scheduler": "slurm",
                    }
                )
        return nodes
    finally:
        client.close()


def cancel_slurm_job(job_id: str) -> bool:
    if not _available():
        return False
    client = _connect()
    try:
        _exec(client, f"scancel {job_id}")
        return True
    finally:
        client.close()


# ── PBS ──────────────────────────────────────────────────────────────────────

def get_pbs_queue(user: Optional[str] = None) -> List[Dict]:
    if not _available():
        return []
    client = _connect()
    try:
        cmd = "qstat -f -F json"
        if user:
            cmd = f"qstat -u {user} -f -F json"
        output = _exec(client, cmd)
        try:
            data = json.loads(output)
        except json.JSONDecodeError:
            return []
        jobs = []
        for job_id, info in data.get("Jobs", {}).items():
            jobs.append(
                {
                    "job_id": job_id,
                    "name": info.get("Job_Name", ""),
                    "user": info.get("Job_Owner", "").split("@")[0],
                    "state": info.get("job_state", ""),
                    "time": info.get("resources_used", {}).get("walltime", ""),
                    "time_limit": info.get("Resource_List", {}).get("walltime", ""),
                    "reason": "",
                    "partition": info.get("queue", ""),
                    "scheduler": "pbs",
                }
            )
        return jobs
    finally:
        client.close()


def cancel_pbs_job(job_id: str) -> bool:
    if not _available():
        return False
    client = _connect()
    try:
        _exec(client, f"qdel {job_id}")
        return True
    finally:
        client.close()


# ── Unified ───────────────────────────────────────────────────────────────────

def get_cluster_queue(scheduler: str = "slurm", user: Optional[str] = None) -> List[Dict]:
    if scheduler == "pbs":
        return get_pbs_queue(user)
    return get_slurm_queue(user)


def get_cluster_nodes() -> List[Dict]:
    return get_slurm_nodes()


def cancel_job(job_id: str, scheduler: str = "slurm") -> bool:
    if scheduler == "pbs":
        return cancel_pbs_job(job_id)
    return cancel_slurm_job(job_id)


def get_job_output(job_id: str, log_dir: str = "~/slurm_logs") -> str:
    if not _available():
        return ""
    client = _connect()
    try:
        output = _exec(client, f"cat {log_dir}/slurm-{job_id}.out 2>/dev/null | tail -300")
        return output
    finally:
        client.close()


def ping() -> bool:
    """Quick connectivity test — returns True if SSH succeeds."""
    if not _available():
        return False
    try:
        client = _connect()
        _exec(client, "echo ok")
        client.close()
        return True
    except Exception:
        return False
