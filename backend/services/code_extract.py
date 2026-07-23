"""backend/services/code_extract.py

Tree-sitter structural extraction — the real (function-level) analysis behind the
knowledge graph. For a file it returns its functions, classes and imports, which
the graph builder turns into function/class nodes and contains/imports edges (the
lines that make the graph a connected web, not directory boxes).

Fully defensive: if tree-sitter or a grammar is unavailable, or a file fails to
parse, extraction returns empty and graph generation degrades to file-level
(never breaks).
"""
from __future__ import annotations

import logging

logger = logging.getLogger("code_extract")

try:
    from tree_sitter_language_pack import get_parser
    _AVAILABLE = True
except Exception as e:  # pragma: no cover
    _AVAILABLE = False
    logger.warning("tree-sitter-language-pack unavailable: %s", e)

_EXT_LANG = {
    ".py": "python", ".ts": "typescript", ".tsx": "tsx", ".js": "javascript",
    ".jsx": "javascript", ".mjs": "javascript", ".go": "go", ".rs": "rust",
    ".java": "java", ".rb": "ruby", ".php": "php", ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".cs": "csharp",
    ".kt": "kotlin", ".swift": "swift", ".scala": "scala",
}

_FUNC = {
    "python": {"function_definition"},
    "typescript": {"function_declaration", "method_definition", "generator_function_declaration"},
    "tsx": {"function_declaration", "method_definition"},
    "javascript": {"function_declaration", "method_definition", "generator_function_declaration"},
    "go": {"function_declaration", "method_declaration"},
    "rust": {"function_item"},
    "java": {"method_declaration", "constructor_declaration"},
    "ruby": {"method", "singleton_method"},
    "php": {"function_definition", "method_declaration"},
    "c": {"function_definition"},
    "cpp": {"function_definition"},
    "csharp": {"method_declaration", "constructor_declaration", "local_function_statement"},
    "kotlin": {"function_declaration"},
    "swift": {"function_declaration"},
    "scala": {"function_definition"},
}
_CLASS = {
    "python": {"class_definition"},
    "typescript": {"class_declaration", "interface_declaration"},
    "tsx": {"class_declaration", "interface_declaration"},
    "javascript": {"class_declaration"},
    "go": {"type_declaration"},
    "rust": {"struct_item", "enum_item", "trait_item"},
    "java": {"class_declaration", "interface_declaration", "enum_declaration"},
    "ruby": {"class", "module"},
    "php": {"class_declaration", "interface_declaration", "trait_declaration"},
    "c": {"struct_specifier"},
    "cpp": {"class_specifier", "struct_specifier"},
    "csharp": {"class_declaration", "interface_declaration", "struct_declaration", "record_declaration"},
    "kotlin": {"class_declaration", "object_declaration"},
    "swift": {"class_declaration", "protocol_declaration", "struct_declaration", "enum_declaration"},
    "scala": {"class_definition", "object_definition", "trait_definition"},
}
_IMPORT = {
    "python": {"import_statement", "import_from_statement"},
    "typescript": {"import_statement"},
    "tsx": {"import_statement"},
    "javascript": {"import_statement"},
    "go": {"import_declaration"},
    "rust": {"use_declaration"},
    "java": {"import_declaration"},
    "php": {"namespace_use_declaration"},
    "c": {"preproc_include"},
    "cpp": {"preproc_include"},
    "csharp": {"using_directive"},
    "kotlin": {"import_header"},
    "swift": {"import_declaration"},
    "scala": {"import_declaration"},
}


def lang_for(path: str) -> str | None:
    fn = path.rsplit("/", 1)[-1]
    ext = fn[fn.rfind("."):].lower() if "." in fn else ""
    return _EXT_LANG.get(ext)


def _name(node, src: bytes) -> str | None:
    nm = node.child_by_field_name("name")
    if nm is not None:
        return src[nm.start_byte:nm.end_byte].decode("utf-8", "replace")
    for c in node.children:
        if "identifier" in c.type or c.type == "name":
            return src[c.start_byte:c.end_byte].decode("utf-8", "replace")
    return None


def extract(path: str, content: str) -> dict:
    """Return {lang, functions:[{name,line}], classes:[{name,line}], imports:[str]}."""
    out: dict = {"lang": None, "functions": [], "classes": [], "imports": []}
    lang = lang_for(path)
    if not lang or not _AVAILABLE:
        return out
    out["lang"] = lang
    try:
        parser = get_parser(lang)
        src = content.encode("utf-8", "replace")
        root = parser.parse(src).root_node
    except Exception as e:
        logger.debug("tree-sitter parse failed for %s (%s): %s", path, lang, e)
        return out

    funcs, classes, imports = _FUNC.get(lang, set()), _CLASS.get(lang, set()), _IMPORT.get(lang, set())
    seen_f: set[str] = set()
    seen_c: set[str] = set()

    def walk(n):
        t = n.type
        if t in funcs:
            nm = _name(n, src)
            if nm and nm not in seen_f:
                seen_f.add(nm)
                out["functions"].append({"name": nm, "line": n.start_point[0] + 1})
        elif t in classes:
            nm = _name(n, src)
            if nm and nm not in seen_c:
                seen_c.add(nm)
                out["classes"].append({"name": nm, "line": n.start_point[0] + 1})
        elif t in imports:
            txt = src[n.start_byte:n.end_byte].decode("utf-8", "replace").strip()
            if 0 < len(txt) < 200:
                out["imports"].append(txt)
        for c in n.children:
            walk(c)

    try:
        walk(root)
    except Exception as e:
        logger.debug("walk failed for %s: %s", path, e)

    out["functions"] = out["functions"][:100]
    out["classes"] = out["classes"][:50]
    out["imports"] = out["imports"][:80]
    return out
