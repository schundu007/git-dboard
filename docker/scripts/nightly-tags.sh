#!/usr/bin/env bash
# =============================================================================
# docker/scripts/nightly-tags.sh
#
# Purpose  : Compute all image tags and the Dockerfile path for one matrix cell.
#            Idempotent — safe to run locally for debugging.
# Inputs   : Environment variables (all mandatory):
#              BUILD_DATE          YYYYMMDD
#              SHORT_SHA           7-char git SHA
#              ISAAC_SIM_VERSION   e.g. 4.5.0
#              SIM_MAJOR_MINOR     e.g. 4.5
#              IMAGE_EXT           base | ros2 | cloudxr | ngc-slim
#              NGC_IMAGE           e.g. nvcr.io/nvidia/isaac-lab
#              GHCR_IMAGE          e.g. ghcr.io/isaac-sim/isaaclab
# Outputs  : Appended to $GITHUB_OUTPUT (or /dev/null locally)
#              nightly_tag, sha_tag, cache_tag,
#              ngc_nightly, ngc_sha,
#              ghcr_nightly, ghcr_sha, ghcr_cache,
#              dockerfile, compose_overlay, all_tags
# Secrets  : None (secrets are consumed by calling workflow jobs)
# =============================================================================
set -euo pipefail

# ── Validate required inputs ──────────────────────────────────────────────────
: "${BUILD_DATE:?BUILD_DATE is required (YYYYMMDD)}"
: "${SHORT_SHA:?SHORT_SHA is required (7-char git SHA)}"
: "${ISAAC_SIM_VERSION:?ISAAC_SIM_VERSION is required (e.g. 4.5.0)}"
: "${SIM_MAJOR_MINOR:?SIM_MAJOR_MINOR is required (e.g. 4.5)}"
: "${IMAGE_EXT:?IMAGE_EXT is required (base|ros2|cloudxr|ngc-slim)}"
: "${NGC_IMAGE:=nvcr.io/nvidia/isaac-lab}"
: "${GHCR_IMAGE:=ghcr.io/isaac-sim/isaaclab}"

# ── Tag names (no registry prefix) ───────────────────────────────────────────
NIGHTLY_TAG="nightly-${BUILD_DATE}-${IMAGE_EXT}-sim${SIM_MAJOR_MINOR}"
SHA_TAG="sha-${SHORT_SHA}-${IMAGE_EXT}-sim${SIM_MAJOR_MINOR}"
CACHE_TAG="cache-${IMAGE_EXT}-sim${SIM_MAJOR_MINOR}"

# ── Full image references ─────────────────────────────────────────────────────
NGC_NIGHTLY="${NGC_IMAGE}:${NIGHTLY_TAG}"
NGC_SHA="${NGC_IMAGE}:${SHA_TAG}"
GHCR_NIGHTLY="${GHCR_IMAGE}:${NIGHTLY_TAG}"
GHCR_SHA="${GHCR_IMAGE}:${SHA_TAG}"
GHCR_CACHE="${GHCR_IMAGE}:${CACHE_TAG}"

# ── Dockerfile and compose overlay selection ──────────────────────────────────
# The isaac-sim/IsaacLab repo uses docker/Dockerfile.base (not docker/Dockerfile).
# ros2 ships docker/Dockerfile.ros2; other extensions use the base Dockerfile.
case "${IMAGE_EXT}" in
  base)
    # Use Dockerfile.base (the repo's canonical base image Dockerfile)
    DOCKERFILE="docker/Dockerfile.base"
    COMPOSE_OVERLAY=""
    ;;
  ros2)
    # Prefer dedicated ros2 Dockerfile when present; fall back to base.
    if [[ -f "docker/Dockerfile.ros2" ]]; then
      DOCKERFILE="docker/Dockerfile.ros2"
    else
      DOCKERFILE="docker/Dockerfile.base"
    fi
    COMPOSE_OVERLAY="docker/docker-compose.ros2.yaml"
    ;;
  cloudxr)
    # CloudXR extends the base image; compose patch applies the runtime overlay.
    DOCKERFILE="docker/Dockerfile.base"
    COMPOSE_OVERLAY="docker/docker-compose.cloudxr-runtime.patch.yaml"
    ;;
  ngc-slim)
    # Minimal NGC pre-built container — uses a slim Dockerfile if present.
    if [[ -f "docker/Dockerfile.slim" ]]; then
      DOCKERFILE="docker/Dockerfile.slim"
    else
      DOCKERFILE="docker/Dockerfile.base"
    fi
    COMPOSE_OVERLAY=""
    ;;
  *)
    echo "ERROR: unknown IMAGE_EXT '${IMAGE_EXT}'" >&2
    exit 1
    ;;
esac

# ── Write to GITHUB_OUTPUT ────────────────────────────────────────────────────
{
  echo "nightly_tag=${NIGHTLY_TAG}"
  echo "sha_tag=${SHA_TAG}"
  echo "cache_tag=${CACHE_TAG}"

  echo "ngc_nightly=${NGC_NIGHTLY}"
  echo "ngc_sha=${NGC_SHA}"
  echo "ghcr_nightly=${GHCR_NIGHTLY}"
  echo "ghcr_sha=${GHCR_SHA}"
  echo "ghcr_cache=${GHCR_CACHE}"

  echo "dockerfile=${DOCKERFILE}"
  echo "compose_overlay=${COMPOSE_OVERLAY}"

  # Multiline block: docker/build-push-action consumes newline-separated tags.
  echo "all_tags<<TAGS_EOF"
  echo "${NGC_NIGHTLY}"
  echo "${NGC_SHA}"
  echo "${GHCR_NIGHTLY}"
  echo "${GHCR_SHA}"
  echo "TAGS_EOF"
} >> "${GITHUB_OUTPUT:-/dev/null}"

# ── Human-readable summary (always printed to runner log) ─────────────────────
cat <<SUMMARY
──────────────────────────────────────────────────────
Tag plan for ${IMAGE_EXT} · sim${SIM_MAJOR_MINOR}
  Nightly tag  : ${NIGHTLY_TAG}
  SHA tag      : ${SHA_TAG}
  Cache tag    : ${CACHE_TAG}
  NGC nightly  : ${NGC_NIGHTLY}
  NGC SHA      : ${NGC_SHA}
  GHCR nightly : ${GHCR_NIGHTLY}
  GHCR SHA     : ${GHCR_SHA}
  GHCR cache   : ${GHCR_CACHE}
  Dockerfile   : ${DOCKERFILE}
  Overlay      : ${COMPOSE_OVERLAY:-none}
──────────────────────────────────────────────────────
SUMMARY
