from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Boolean
from sqlalchemy.sql import func
from database import Base


class LogEntry(Base):
    __tablename__ = "log_entries"
    id = Column(Integer, primary_key=True)
    source = Column(String(50))        # gha | docker | cluster
    run_id = Column(String(100))
    level = Column(String(20))
    message = Column(Text)
    timestamp = Column(DateTime, server_default=func.now())
    meta = Column(JSON, default={})


class BuildRecord(Base):
    __tablename__ = "build_records"
    id = Column(Integer, primary_key=True)
    run_id = Column(String(100), unique=True)
    branch = Column(String(200))
    commit_sha = Column(String(40))
    status = Column(String(50))
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    image_tags = Column(JSON, default=[])
    registries = Column(JSON, default=[])


class NightlyRun(Base):
    __tablename__ = "nightly_runs"
    id = Column(Integer, primary_key=True)
    run_id = Column(String(100), unique=True)
    runtime_version = Column(String(50))
    date = Column(String(20))           # YYYY-MM-DD
    status = Column(String(50))
    test_suite = Column(String(50))     # tasks | general
    passed = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    duration_seconds = Column(Integer)
    artifact_url = Column(String(500))


class AISettings(Base):
    __tablename__ = "ai_settings"
    id = Column(Integer, primary_key=True, default=1)
    provider = Column(String(50), default="anthropic")   # anthropic|gemini|deepseek|cohere
    anthropic_key = Column(String(500), nullable=True)
    gemini_key = Column(String(500), nullable=True)
    deepseek_key = Column(String(500), nullable=True)
    cohere_key = Column(String(500), nullable=True)


class AwsSettings(Base):
    __tablename__ = "aws_settings"
    id = Column(Integer, primary_key=True, default=1)
    access_key_id = Column(String(200), nullable=True)
    secret_access_key = Column(String(500), nullable=True)
    region = Column(String(50), default="us-east-1")


class RepoConfig(Base):
    __tablename__ = "repo_configs"
    id = Column(Integer, primary_key=True)
    name = Column(String(200))
    owner = Column(String(100))
    repo = Column(String(200))
    gh_pat = Column(String(500), default="")   # blank = inherit from env
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    capabilities = Column(JSON, default={})
    business_unit = Column(String(100), nullable=True, default=None)


class GraphFileSummary(Base):
    """Per-file summary used to build a project's knowledge graph.

    Cached by content sha256 like FileAnalysis, so each distinct file version is
    summarised for the graph exactly once and re-analysis only touches changed
    files (the incremental path).
    """
    __tablename__ = "graph_file_summaries"
    id = Column(Integer, primary_key=True)
    repo_slug = Column(String(200), index=True)
    path = Column(String(500), index=True)
    content_sha = Column(String(64), index=True)
    result = Column(JSON, default={})          # {summary, tags[], complexity, role}
    created_at = Column(DateTime, server_default=func.now())


class GraphAnalysis(Base):
    """A generated knowledge-graph.json + meta.json for a repo (one row per repo).

    The graph is a file-level KnowledgeGraph (nodes = files + directory modules,
    edges = containment); the shape matches the Understand Anything dashboard
    contract so git-graph's viewer can render it directly.
    """
    __tablename__ = "graph_analyses"
    id = Column(Integer, primary_key=True)
    repo_slug = Column(String(200), index=True, unique=True)
    graph = Column(JSON, default={})           # knowledge-graph.json
    meta = Column(JSON, default={})            # meta.json
    commit_sha = Column(String(40), nullable=True)
    analyzed_files = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class FileAnalysis(Base):
    """Cached LLM analysis of a single CI/infra file.

    Keyed by the sha256 of the file *content*, so an unchanged file is analysed
    once and reused forever; editing the file upstream produces a new hash and
    therefore a fresh analysis. Nothing here is derived from the filename alone.
    """
    __tablename__ = "file_analyses"
    id = Column(Integer, primary_key=True)
    repo_slug = Column(String(200), index=True)
    path = Column(String(500), index=True)
    content_sha = Column(String(64), index=True)
    lang = Column(String(30))
    result = Column(JSON, default={})          # {summary, steps, concepts, issues, deep_dive}
    provider = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
