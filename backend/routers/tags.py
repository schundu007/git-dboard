"""
Tag naming, build matrix, and lifecycle policy — pure computation, no GitHub API calls.
"""
from datetime import date as date_cls
from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(prefix="/tags", tags=["tags"])

ALL_SIM_VERSIONS = ["4.5.0", "5.0.0", "5.1.0"]
ALL_IMAGE_EXTS   = ["base", "ros2", "cloudxr", "ngc-slim"]

UNSUPPORTED: set[tuple[str, str]] = {
    ("5.0.0", "ngc-slim"),
    ("5.1.0", "ngc-slim"),
}

NGC_IMAGE  = "nvcr.io/nvidia/isaac-lab"
GHCR_IMAGE = "ghcr.io/isaac-sim/isaaclab"

DOCKERFILE_MAP = {
    "base":     "docker/Dockerfile",
    "ros2":     "docker/Dockerfile.ros2",
    "cloudxr":  "docker/Dockerfile",
    "ngc-slim": "docker/Dockerfile.slim",
}

COMPOSE_MAP = {
    "ros2":     "docker/docker-compose.ros2.yaml",
    "cloudxr":  "docker/docker-compose.cloudxr.yaml",
    "base":     "",
    "ngc-slim": "",
}

UNSUPPORTED_REASON = "ngc-slim pre-built container not yet published by NVIDIA for this Isaac Sim version"


def _mm(version: str) -> str:
    return ".".join(version.split(".")[:2])


@router.get("/compute")
def compute_tags(
    mode: str               = Query("nightly", description="nightly | release"),
    build_date: Optional[str] = Query(None,    description="YYYYMMDD — nightly mode"),
    release_version: Optional[str] = Query(None, description="e.g. 2.3.2 — release mode"),
    short_sha: str          = Query("abc1234", description="7-char git SHA"),
    image_ext: str          = Query("base",    description="base | ros2 | cloudxr | ngc-slim"),
    sim_version: str        = Query("4.5.0",   description="e.g. 4.5.0"),
):
    mm          = _mm(sim_version)
    cell_slug   = f"{image_ext}-sim{mm}"
    supported   = (sim_version, image_ext) not in UNSUPPORTED
    sha_tag     = f"sha-{short_sha}-{image_ext}-sim{mm}"
    cache_tag   = f"cache-{image_ext}-sim{mm}"
    ghcr_cache  = f"{GHCR_IMAGE}:{cache_tag}"

    if mode == "nightly":
        d           = build_date or date_cls.today().strftime("%Y%m%d")
        nightly_tag = f"nightly-{d}-{image_ext}-sim{mm}"
        release_tag = ""
        latest_tag  = ""
        ngc_tags    = [f"{NGC_IMAGE}:{nightly_tag}", f"{NGC_IMAGE}:{sha_tag}"]
        ghcr_tags   = [f"{GHCR_IMAGE}:{nightly_tag}", f"{GHCR_IMAGE}:{sha_tag}"]
    else:
        ver         = release_version or "0.0.0"
        nightly_tag = ""
        release_tag = f"{ver}-{image_ext}-sim{mm}"
        latest_tag  = f"latest-{image_ext}-sim{mm}"
        ngc_tags    = [
            f"{NGC_IMAGE}:{release_tag}",
            f"{NGC_IMAGE}:{latest_tag}",
            f"{NGC_IMAGE}:{sha_tag}",
        ]
        ghcr_tags   = [
            f"{GHCR_IMAGE}:{release_tag}",
            f"{GHCR_IMAGE}:{latest_tag}",
            f"{GHCR_IMAGE}:{sha_tag}",
        ]

    return {
        "cell_slug":       cell_slug,
        "mode":            mode,
        "supported":       supported,
        "unsupported_reason": UNSUPPORTED_REASON if not supported else None,
        "dockerfile":      DOCKERFILE_MAP.get(image_ext, "docker/Dockerfile"),
        "compose_overlay": COMPOSE_MAP.get(image_ext, ""),
        "ghcr_cache":      ghcr_cache,
        "sha_tag":         sha_tag,
        "nightly_tag":     nightly_tag,
        "release_tag":     release_tag,
        "latest_tag":      latest_tag,
        "ngc_tags":        ngc_tags,
        "ghcr_tags":       ghcr_tags,
        "all_tags":        ngc_tags + ghcr_tags,
    }


@router.get("/matrix")
def get_matrix():
    cells = []
    for sim in ALL_SIM_VERSIONS:
        for ext in ALL_IMAGE_EXTS:
            mm        = _mm(sim)
            supported = (sim, ext) not in UNSUPPORTED
            cells.append({
                "sim_version":     sim,
                "sim_major_minor": mm,
                "image_ext":       ext,
                "cell_slug":       f"{ext}-sim{mm}",
                "supported":       supported,
                "unsupported_reason": UNSUPPORTED_REASON if not supported else None,
            })

    return {
        "sim_versions":  ALL_SIM_VERSIONS,
        "image_exts":    ALL_IMAGE_EXTS,
        "cells":         cells,
        "total_valid":   sum(1 for c in cells if c["supported"]),
        "total_skipped": sum(1 for c in cells if not c["supported"]),
    }


@router.get("/lifecycle")
def get_lifecycle():
    return {
        "policies": [
            {
                "pattern":    "nightly-YYYYMMDD-*",
                "category":   "nightly",
                "ttl_days":   30,
                "age_source": "Date embedded in tag name",
                "example":    "nightly-20260512-base-sim4.5",
                "permanent":  False,
                "registries": ["NGC", "GHCR"],
            },
            {
                "pattern":    "sha-<hash>-*",
                "category":   "sha",
                "ttl_days":   90,
                "age_source": "Package version created_at",
                "example":    "sha-abc1234-base-sim4.5",
                "permanent":  False,
                "registries": ["NGC", "GHCR"],
            },
            {
                "pattern":    "cache-*",
                "category":   "cache",
                "ttl_days":   7,
                "age_source": "Package version created_at",
                "example":    "cache-base-sim4.5",
                "permanent":  False,
                "registries": ["GHCR only"],
            },
            {
                "pattern":    "{semver}-*",
                "category":   "release",
                "ttl_days":   None,
                "age_source": "—",
                "example":    "2.3.2-base-sim4.5",
                "permanent":  True,
                "registries": ["NGC", "GHCR"],
            },
            {
                "pattern":    "latest-*",
                "category":   "latest",
                "ttl_days":   None,
                "age_source": "—",
                "example":    "latest-base-sim4.5",
                "permanent":  True,
                "registries": ["NGC", "GHCR"],
            },
        ]
    }
