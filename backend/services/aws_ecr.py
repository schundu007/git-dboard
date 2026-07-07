import base64
import boto3
from typing import List, Dict
from config import settings


def _client():
    return boto3.client("ecr", region_name=settings.AWS_REGION)


def is_configured() -> bool:
    """True only when the ECR repo + account are set, so callers can degrade
    gracefully instead of letting boto3 raise on an empty repositoryName."""
    return bool(settings.ECR_REPO and settings.ECR_ACCOUNT_ID)


def get_login_token() -> Dict:
    client = _client()
    resp = client.get_authorization_token(registryIds=[settings.ECR_ACCOUNT_ID])
    auth = resp["authorizationData"][0]
    decoded = base64.b64decode(auth["authorizationToken"]).decode()
    username, password = decoded.split(":", 1)
    return {
        "username": username,
        "password": password,
        "registry": auth["proxyEndpoint"],
        "expires_at": auth["expiresAt"].isoformat(),
    }


def list_images(max_results: int = 100) -> List[Dict]:
    client = _client()
    images = []
    paginator = client.get_paginator("describe_images")
    for page in paginator.paginate(
        registryId=settings.ECR_ACCOUNT_ID,
        repositoryName=settings.ECR_REPO,
        PaginationConfig={"MaxItems": max_results},
    ):
        for img in page["imageDetails"]:
            images.append(
                {
                    "digest": img["imageDigest"],
                    "tags": img.get("imageTags", []),
                    "pushed_at": img["imagePushedAt"].isoformat(),
                    "size_mb": round(img["imageSizeInBytes"] / 1024 / 1024, 1),
                    "repository": settings.ECR_REPO,
                    "registry": f"{settings.ECR_ACCOUNT_ID}.dkr.ecr.{settings.AWS_REGION}.amazonaws.com",
                }
            )
    images.sort(key=lambda x: x["pushed_at"], reverse=True)
    return images


def delete_image(tag: str) -> bool:
    client = _client()
    client.batch_delete_image(
        registryId=settings.ECR_ACCOUNT_ID,
        repositoryName=settings.ECR_REPO,
        imageIds=[{"imageTag": tag}],
    )
    return True


def get_ecr_uri() -> str:
    return (
        f"{settings.ECR_ACCOUNT_ID}.dkr.ecr.{settings.AWS_REGION}.amazonaws.com"
        f"/{settings.ECR_REPO}"
    )


def describe_repository() -> Dict:
    client = _client()
    resp = client.describe_repositories(
        registryId=settings.ECR_ACCOUNT_ID,
        repositoryNames=[settings.ECR_REPO],
    )
    repos = resp.get("repositories", [])
    return repos[0] if repos else {}
