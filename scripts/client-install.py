"""Real CLI installation, not an exporter substitute. Execute only in hosted CI.

No model session, MCP command, login, OAuth, existing HOME/config/credential is used.
The only settings touched belong to a newly created, job-private client HOME.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.request

REPOSITORY = "ibank-ax/madang-plugins"
PUBLIC_GIT = "https://github.com/ibank-ax/madang-plugins.git"
SOURCE = "cae1f0851c7ca07dd0233ae8719929b9d2ee6562"
PRODUCTS = ("dev", "docs", "ux", "works", "asset", "aio")
PRODUCT_SETS = {
    "madang-six-cae": (SOURCE, PRODUCTS, PRODUCTS),
    "aca-bootstrap-d83": ("d83f367210625ff9dc3fbbd6b29fa4bba5fdfbda", ("aca",), PRODUCTS + ("aca",)),
}
INSTALLERS = {
    # Official installation pages, retrieved 2026-11-04:
    # https://learn.chatgpt.com/docs/codex/cli
    # https://code.claude.com/docs/en/setup
    # https://cursor.com/docs/cli/installation
    "codex": ("https://chatgpt.com/codex/install.sh", "sh"),
    "claude": ("https://claude.ai/install.sh", "bash"),
    "cursor": ("https://cursor.com/install", "bash"),
}


class VerificationError(RuntimeError):
    pass


class PayloadSetError(VerificationError):
    def __init__(self, missing: set[str], extra: set[str]) -> None:
        super().__init__("PAYLOAD_FILESET_MISMATCH")
        self.difference = {"missing": sorted(missing), "extra": sorted(extra)}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(value: object, code: str) -> None:
    if value is not True:
        raise VerificationError(code)


def expected_integrity(integrity: object) -> tuple[str, bytes]:
    require(isinstance(integrity, str), "PACKAGE_SRI_REQUIRED")
    match = re.fullmatch(r"(sha512|sha256)-([A-Za-z0-9+/]+={0,2})", integrity)
    require(match is not None, "PACKAGE_SRI_INVALID")
    try:
        expected = base64.b64decode(match[2], validate=True)
    except ValueError:
        raise VerificationError("PACKAGE_SRI_INVALID") from None
    require(len(expected) == {"sha512": 64, "sha256": 32}[match[1]], "PACKAGE_SRI_INVALID")
    return match[1], expected


def verified_integrity(data: bytes, integrity: object) -> str:
    algorithm, expected = expected_integrity(integrity)
    actual = hashlib.new(algorithm, data).digest()
    require(actual == expected, "PACKAGE_SRI_MISMATCH")
    return algorithm + "-" + base64.b64encode(actual).decode()


def integrity_controls() -> dict:
    data = b"synthetic SRI control, not a client package"
    sri = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
    require(verified_integrity(data, sri) == sri, "SRI_POSITIVE_CONTROL_FAILED")
    negatives = ((data, None), (data, "sha512-AAAA"), (data + b"changed", sri))
    for body, value in negatives:
        try:
            verified_integrity(body, value)
        except VerificationError:
            continue
        raise VerificationError("SRI_NEGATIVE_CONTROL_FAILED")
    return {"syntheticOnly": True, "positive": 1, "negative": 3}


def regular_files(root: Path) -> dict[str, Path]:
    require(root.is_dir() and not root.is_symlink(), "PAYLOAD_ROOT_INVALID")
    result = {}
    for path in root.rglob("*"):
        require(not path.is_symlink(), "PAYLOAD_SYMLINK_UNSUPPORTED")
        if path.is_dir():
            continue
        require(path.is_file(), "PAYLOAD_SPECIAL_FILE_UNSUPPORTED")
        result[path.relative_to(root).as_posix()] = path
    return result


def matched_tree(actual: Path, reference: Path) -> dict[str, Path]:
    expected, installed = regular_files(reference), regular_files(actual)
    require(bool(expected), "REFERENCE_PACKAGE_EMPTY")
    if set(expected) != set(installed):
        raise PayloadSetError(set(expected) - set(installed), set(installed) - set(expected))
    require(all(installed[name].read_bytes() == path.read_bytes() for name, path in expected.items()),
            "PAYLOAD_BYTES_MISMATCH")
    return installed


def safe_package(root: Path, relative: object) -> Path:
    require(isinstance(relative, str) and not Path(relative).is_absolute(), "PACKAGE_PATH_INVALID")
    current = root
    require(current.is_dir() and not current.is_symlink(), "PACKAGE_ROOT_INVALID")
    for part in Path(relative).parts:
        require(part not in ("..", ""), "PACKAGE_PATH_ESCAPE")
        current = current / part
        require(not current.is_symlink(), "PACKAGE_PATH_SYMLINK")
    require(current.resolve().is_relative_to(root.resolve()), "PACKAGE_PATH_ESCAPE")
    return current


def payload_controls(temporary: Path) -> dict:
    reference, actual = temporary / "reference-control", temporary / "installed-control"
    reference.mkdir()
    actual.mkdir()
    (reference / "SKILL.md").write_text("synthetic file-set control, not a plugin")
    shutil.copyfile(reference / "SKILL.md", actual / "SKILL.md")
    require(len(matched_tree(actual, reference)) == 1, "PAYLOAD_POSITIVE_CONTROL_FAILED")
    hook = actual / "hooks"
    hook.mkdir()
    (hook / "hooks.json").write_text('{"hooks":{}}')
    variants = ("extra-hook", "missing", "file-symlink", "directory-symlink")
    for variant in variants:
        if variant == "missing":
            (hook / "hooks.json").unlink()
            hook.rmdir()
            (actual / "SKILL.md").unlink()
        elif variant == "file-symlink":
            (actual / "SKILL.md").symlink_to(reference / "SKILL.md")
        elif variant == "directory-symlink":
            (actual / "SKILL.md").unlink()
            shutil.copyfile(reference / "SKILL.md", actual / "SKILL.md")
            (actual / "alias").symlink_to(reference, target_is_directory=True)
        try:
            matched_tree(actual, reference)
        except VerificationError as error:
            expected = "PAYLOAD_FILESET_MISMATCH" if variant in ("extra-hook", "missing") else "PAYLOAD_SYMLINK_UNSUPPORTED"
            require(str(error) == expected, "PAYLOAD_NEGATIVE_CONTROL_WRONG_REASON")
            continue
        raise VerificationError("PAYLOAD_NEGATIVE_CONTROL_FAILED")
    return {"syntheticOnly": True, "positive": 1, "negative": 4, "variants": list(variants)}


def json_output(text: str) -> object:
    try:
        return json.loads(text)
    except ValueError:
        # Native Claude CLI documents its JSON result on the final stdout line.
        for line in reversed(text.splitlines()):
            try:
                return json.loads(line)
            except ValueError:
                continue
    raise VerificationError("CLIENT_JSON_MISSING")


def objects(value: object):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from objects(item)
    elif isinstance(value, list):
        for item in value:
            yield from objects(item)


class Verification:
    def __init__(self, client: str, temporary: Path, output: Path, product_set: str) -> None:
        self.client, self.temporary, self.output = client, temporary, output
        self.product_set = product_set
        self.source, self.products, self.catalog_products = PRODUCT_SETS[product_set]
        self.home = temporary / "client-home"
        self.work = temporary / "empty-project"
        self.home.mkdir()
        self.work.mkdir()
        # Deliberate allowlist. Do not copy a runner's credentials, API keys,
        # Git/CLI configuration, credential helpers, SSH agent or token variables.
        self.env = {
            "PATH": str(Path(shutil.which("node") or "/usr/bin/node").parent) + ":" + str(self.home / ".local/bin") + ":" + os.defpath,
            "HOME": str(self.home),
            "TMPDIR": str(temporary),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "XDG_DATA_HOME": str(self.home / ".local/share"),
            "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TERM": "dumb", "CI": "true",
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "/bin/false",
            "GIT_SSH_COMMAND": "false", "CLAUDE_CODE_PLUGIN_PREFER_HTTPS": "1",
            "DISABLE_TELEMETRY": "1", "DISABLE_ERROR_REPORTING": "1",
            "NPM_CONFIG_USERCONFIG": str(temporary / "empty-user.npmrc"),
            "NPM_CONFIG_GLOBALCONFIG": str(temporary / "empty-global.npmrc"),
            "npm_config_cache": str(temporary / "npm-cache"),
        }
        self.receipt: dict[str, object] = {
            "schema": 1, "client": client, "publicRepository": REPOSITORY,
            "productSet": product_set, "requestedPublicRevision": self.source,
            "controllerRevision": os.environ.get("GITHUB_SHA"),
            "productsRequired": list(self.products), "requiredInstallations": len(self.products),
            "installedAndListed": 0, "plugins": [], "commands": [],
            "personalHomeRead": False, "existingCredentialsUsed": False,
            "loginExecuted": False, "oauthConsentExecuted": False, "modelSessionExecuted": False,
            "mcpInvocationExecuted": False, "guiVerified": False,
            "skillsEvidence": "native-installed payload references; no model/skill execution",
            "complete": False,
        }

    def clean(self, text: str) -> str:
        return text.replace(str(self.temporary), "$ISOLATED_ROOT")

    def run(self, phase: str, argv: list[str], *, timeout: int = 180,
            allow_failure: bool = False, help_output: bool = False) -> str:
        result = subprocess.run(argv, env=self.env, cwd=self.work, input=b"",
                                capture_output=True, timeout=timeout, check=False)
        self.receipt["commands"].append({
            "phase": phase, "argv": [self.clean(arg) for arg in argv], "exitCode": result.returncode,
            "stdoutSha256": digest(result.stdout), "stderrSha256": digest(result.stderr),
        })
        text = result.stdout.decode("utf-8", errors="replace")
        if help_output:
            (self.output / (phase + ".txt")).write_text(self.clean(text))
        if result.returncode != 0 and not allow_failure:
            self.receipt["failedPhase"] = phase
            # Public CLI diagnostics only: no full logs, state, environment or data.
            tail = result.stderr.decode("utf-8", errors="replace")[-1500:]
            self.receipt["publicClientDiagnostic"] = self.clean(tail)
            raise VerificationError("NATIVE_COMMAND_FAILED")
        print(f"CLIENT_PHASE {self.client} {phase} exit={result.returncode}", flush=True)
        return text

    def install_client(self) -> str:
        if self.client in ("codex", "claude"):
            # Both vendors document this public distribution. The first CI's
            # standalone HTTP download failure remains a separate receipt.
            # https://learn.chatgpt.com/docs/changelog
            # https://code.claude.com/docs/en/setup#install-with-npm
            package = "@openai/codex" if self.client == "codex" else "@anthropic-ai/claude-code"
            npm = shutil.which("npm")
            require(npm is not None, "NPM_BINARY_MISSING")
            metadata = json_output(self.run("official-npm-version", [npm, "view", package + "@latest",
                "version", "dist.integrity", "--json", "--registry=https://registry.npmjs.org"]))
            require(isinstance(metadata, dict) and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", metadata.get("version", "")) is not None,
                    "OFFICIAL_PACKAGE_VERSION_INVALID")
            # Validate the advertised SRI before any installation. Pack may
            # re-query the registry, so compare its actual bytes to the original
            # query's SRI instead of treating that re-query as verification.
            integrity = metadata.get("dist.integrity")
            expected_integrity(integrity)
            pack_root = self.temporary / "verified-package"
            pack_root.mkdir()
            packed = json_output(self.run("official-npm-pack", [npm, "pack", package + "@" + metadata["version"],
                "--ignore-scripts", "--pack-destination", str(pack_root), "--json", "--registry=https://registry.npmjs.org"]))
            require(isinstance(packed, list) and len(packed) == 1, "PACKAGE_PACK_RESULT_INVALID")
            item = packed[0]
            require(item.get("name") == package and item.get("version") == metadata["version"], "PACKAGE_PACK_IDENTITY_MISMATCH")
            filename = item.get("filename")
            require(isinstance(filename, str) and re.fullmatch(r"[A-Za-z0-9_.-]+\.tgz", filename) is not None,
                    "PACKAGE_PACK_FILENAME_INVALID")
            artifact = pack_root / filename
            require(artifact.is_file() and not artifact.is_symlink(), "PACKAGE_TARBALL_MISSING")
            data = artifact.read_bytes()
            actual_integrity = verified_integrity(data, integrity)
            require(item.get("integrity") == actual_integrity, "PACKAGE_PACK_SRI_MISMATCH")
            prefix = self.temporary / "official-client-prefix"
            self.receipt["installer"] = {"distribution": "official-npm", "package": package,
                "version": metadata["version"], "integrity": actual_integrity,
                "tarballSha256": digest(data), "tarballBytes": len(data), "tarballSriVerified": True}
            self.run("official-npm-install", [npm, "install", "--global", "--prefix", str(prefix),
                "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", str(artifact)], timeout=300)
            binary = prefix / "bin" / self.client
            require(binary.is_file(), "OFFICIAL_CLIENT_BINARY_MISSING")
            version = self.run("version", [str(binary), "--version"]).strip()
            expected = "codex-cli " + metadata["version"] if self.client == "codex" else metadata["version"] + " (Claude Code)"
            require(version == expected, "CLIENT_VERSION_MISMATCH")
            self.receipt["installer"]["actualVersionMatched"] = True
            self.receipt["clientVersion"] = self.clean(version)
            self.client_help = self.run("client-help", [str(binary), "--help"], help_output=True)
            return str(binary)
        url, shell = INSTALLERS[self.client]
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(2 * 1024 * 1024 + 1)
        require(len(data) <= 2 * 1024 * 1024, "INSTALLER_TOO_LARGE")
        installer = self.temporary / "official-installer.sh"
        installer.write_bytes(data)
        self.receipt["installer"] = {"url": url, "sha256": digest(data)}
        self.run("official-installer", [shell, str(installer)], timeout=300)
        names = ("agent", "cursor-agent") if self.client == "cursor" else (self.client,)
        candidates = [self.home / ".local/bin" / name for name in names]
        binary = next((p for p in candidates if p.is_file()), None)
        require(binary is not None, "OFFICIAL_CLIENT_BINARY_MISSING")
        version = self.run("version", [str(binary), "--version"]).strip()
        require(bool(version) and len(version) < 300, "CLIENT_VERSION_INVALID")
        self.receipt["clientVersion"] = self.clean(version)
        self.client_help = self.run("client-help", [str(binary), "--help"], help_output=True)
        return str(binary)

    def reference(self) -> tuple[Path, dict[str, dict]]:
        source = self.temporary / "anonymous-public-source"
        self.run("anonymous-clone", ["git", "-c", "credential.helper=", "clone", "--no-checkout", PUBLIC_GIT, str(source)])
        self.run("anonymous-checkout", ["git", "-C", str(source), "checkout", "--detach", self.source])
        actual = self.run("anonymous-revision", ["git", "-C", str(source), "rev-parse", "HEAD"]).strip()
        require(actual == self.source, "PUBLIC_REVISION_MISMATCH")
        catalogs = {"codex": ".agents/plugins/marketplace.json", "claude": ".claude-plugin/marketplace.json",
                    "cursor": ".cursor-plugin/marketplace.json"}
        catalog = json.loads((source / catalogs[self.client]).read_text())
        require(catalog["name"] == "madang", "MARKETPLACE_NAME_MISMATCH")
        entries = {entry["name"]: entry for entry in catalog["plugins"]}
        require(len(catalog["plugins"]) == len(self.catalog_products)
                and set(entries) == set(self.catalog_products), "REFERENCE_CATALOG_DENOMINATOR_CHANGED")
        self.receipt["anonymousPublicRevision"] = actual
        self.receipt["catalogSha256"] = digest((source / catalogs[self.client]).read_bytes())
        if self.product_set == "aca-bootstrap-d83":
            counts = {}
            for client, relative in catalogs.items():
                reference = json.loads((source / relative).read_text())
                require(len(reference["plugins"]) == 7
                        and {entry["name"] for entry in reference["plugins"]} == set(self.catalog_products),
                        "ACA_REFERENCE_CATALOG_DENOMINATOR_CHANGED")
                counts[client] = 7
            state = json.loads((source / "plugins/aca/provenance.json").read_text())
            require(state["endpointStatus"] == "tenant_variant_pending"
                    and state["organizationOriginRequired"] is True and state["familyDiscovery"] == "unavailable"
                    and all(state[key] is False for key in ("operationalEnabled", "threeIdeInstalled", "oauthAccepted", "actualReadAccepted")),
                    "ACA_BOOTSTRAP_SOURCE_STATE_CHANGED")
            self.receipt["referenceCatalogDataOnly"] = {"entriesPerClient": counts, "totalEntries": 21}
            self.receipt["bootstrapSourceState"] = {"endpointStatus": "tenant_variant_pending",
                "organizationOriginRequired": True, "familyDiscovery": "unavailable", "operationalEnabled": False}
        return source, entries

    def payload(self, installed: Path, reference: Path, name: str, version: str) -> dict:
        require(installed.is_dir() and installed.resolve().is_relative_to(self.home.resolve()), "INSTALLED_PATH_OUTSIDE_ISOLATION")
        files = matched_tree(installed, reference)
        skills = []
        for relative, actual in files.items():
            if Path(relative).name == "SKILL.md":
                skills.append({"path": relative, "sha256": digest(actual.read_bytes())})
        result = {"name": name, "version": version, "installed": True, "listedByNativeClient": True,
                "matchedPayloadFiles": len(files), "exactFileSet": True,
                "skills": skills, "skillReferences": len(skills)}
        if self.product_set == "aca-bootstrap-d83":
            manifest = ".codex-plugin/plugin.json" if self.client == "codex" else ".claude-plugin/plugin.json"
            require(set(files) == {manifest, "README.md", "skills/aca-read/SKILL.md", "skills/aca-setup/SKILL.md"},
                    "ACA_BOOTSTRAP_FILESET_CHANGED")
            value = json.loads(files[manifest].read_text())
            require(value["name"] == "aca" and value["version"] == "0.1.0"
                    and all(not (set(item) & {"mcpServers", "mcp", "endpoint", "url", "command", "args", "env"}) for item in objects(value)),
                    "ACA_BOOTSTRAP_ENDPOINT_PRESENT")
            require(len(skills) == 2 and "tenant_variant_pending" in files["README.md"].read_text()
                    and "tenant_variant_pending" in files["skills/aca-setup/SKILL.md"].read_text(),
                    "ACA_BOOTSTRAP_STATE_MISSING")
            result.update(endpointStatus="tenant_variant_pending", configuredMcpEndpoints=0,
                          organizationVariantGenerated=False, actualReadAccepted=False)
        return result

    def native_payload(self, snapshot: Path, source: Path, entries: dict, name: str) -> Path:
        require(snapshot.resolve().is_relative_to(self.home.resolve()), "NATIVE_SNAPSHOT_OUTSIDE_ISOLATION")
        catalog = ".agents/plugins/marketplace.json" if self.client == "codex" else ".claude-plugin/marketplace.json"
        value = json.loads(safe_package(snapshot, catalog).read_text())
        require(value.get("name") == "madang", "NATIVE_MARKETPLACE_NAME_CHANGED")
        found = [entry for entry in value["plugins"] if entry.get("name") == name]
        require(len(found) == 1 and found[0] == entries[name], "NATIVE_CATALOG_ENTRY_CHANGED")
        entry = found[0]
        relative = entry["source"]["path"] if isinstance(entry["source"], dict) else entry["source"]
        reference = safe_package(source, relative)
        self.receipt["payloadCheckStage"] = "native-snapshot-" + name
        matched_tree(safe_package(snapshot, relative), reference)
        return reference

    def verify(self, binary: str, source: Path, entries: dict[str, dict]) -> None:
        self.run("plugin-help", [binary, "plugin", "--help"], help_output=True)
        if self.client == "codex":
            registered = json_output(self.run("marketplace-add", [binary, "plugin", "marketplace", "add", PUBLIC_GIT,
                                                                      "--ref", self.source, "--json"]))
            require(isinstance(registered, dict) and registered.get("marketplaceName") == "madang", "MARKETPLACE_NOT_REGISTERED")
            self.run("marketplace-list", [binary, "plugin", "marketplace", "list", "--json"])
            require(isinstance(registered.get("installedRoot"), str), "NATIVE_MARKETPLACE_SNAPSHOT_MISSING")
            snapshot = Path(registered["installedRoot"])
        else:
            # Claude's documented #ref is a branch/tag, not an arbitrary SHA.
            # Record the native Git snapshot actually fetched from the public
            # default branch; verify selected payloads against the fixed reference.
            registered = json_output(self.run("marketplace-add", [binary, "plugin", "marketplace", "add",
                                                                      PUBLIC_GIT, "--json"]))
            require(isinstance(registered, dict) and registered.get("outcome") == "ok", "MARKETPLACE_NOT_REGISTERED")
            self.run("marketplace-list", [binary, "plugin", "marketplace", "list", "--json"])
            snapshot = self.home / ".claude/plugins/marketplaces/madang"
            require(snapshot.is_dir(), "NATIVE_MARKETPLACE_SNAPSHOT_MISSING")
            revision = self.run("native-marketplace-revision", ["git", "-C", str(snapshot), "rev-parse", "HEAD"]).strip()
            require(re.fullmatch(r"[0-9a-f]{40}", revision) is not None, "NATIVE_MARKETPLACE_REVISION_INVALID")
            self.receipt["nativeMarketplaceRevision"] = revision
        self.receipt["nativeMarketplaceRegistered"] = True
        for name in self.products:
            reference = self.native_payload(snapshot, source, entries, name)
            verb = "add" if self.client == "codex" else "install"
            result = json_output(self.run("install-" + name, [binary, "plugin", verb, name + "@madang", "--json"]))
            if self.client == "claude":
                require(isinstance(result, dict) and result.get("outcome") == "ok", "PLUGIN_INSTALL_NOT_OK")
            listing = json_output(self.run("list-" + name, [binary, "plugin", "list", "--json"]))
            pool = listing.get("installed", []) if self.client == "codex" and isinstance(listing, dict) else listing
            listed = [item for item in objects(pool) if item.get("id") == name + "@madang"
                      or item.get("pluginId") == name + "@madang"
                      or (item.get("name") == name and item.get("marketplaceName") == "madang")]
            require(bool(listed), "PLUGIN_NOT_IN_NATIVE_LIST")
            path = result.get("installedPath") if isinstance(result, dict) else None
            if not path:
                path = next((item.get("installPath") or item.get("installedPath") for item in listed
                             if item.get("installPath") or item.get("installedPath")), None)
            if not path and self.client == "claude":
                state = self.home / ".claude/plugins/installed_plugins.json"
                require(state.is_file(), "NATIVE_INSTALL_STATE_MISSING")
                state_items = json.loads(state.read_text()).get("plugins", {}).get(name + "@madang", [])
                path = next((item.get("installPath") for item in state_items if item.get("installPath")), None)
            require(isinstance(path, str), "NATIVE_INSTALLED_PATH_MISSING")
            entry = entries[name]
            self.receipt["payloadCheckStage"] = "installed-" + name
            plugin = self.payload(Path(path), reference, name, entry["version"])
            self.native_payload(snapshot, source, entries, name)
            self.receipt["plugins"].append(plugin)
            self.receipt["installedAndListed"] = len(self.receipt["plugins"])
        require(self.receipt["installedAndListed"] == len(self.products), "INSTALLATION_DENOMINATOR_INCOMPLETE")
        self.receipt["complete"] = True

    def cursor_capabilities(self, binary: str) -> None:
        # Official Cursor docs specify GUI/team import for installation. Do not
        # invent an unattended installation command or report a file copy as one.
        command = re.search(r"(?m)^\s+(plugins?)\b", self.client_help)
        text = self.run("cursor-plugin-help", [binary, command.group(1), "--help"],
                        allow_failure=True, help_output=True) if command else ""
        if re.search(r"(?m)^\s+marketplace\b", text):
            self.run("cursor-marketplace-help", [binary, command.group(1), "marketplace", "--help"], help_output=True)
            self.run("cursor-marketplace-add-help", [binary, command.group(1), "marketplace", "add", "--help"], help_output=True)
            self.run("cursor-marketplace-list-help", [binary, command.group(1), "marketplace", "list", "--help"], help_output=True)
        self.receipt["cursorCapabilityProbe"] = {
            "installVerbAdvertised": re.search(r"(?m)^\s+(?:install|add)\b", text) is not None,
            "pluginCommandAdvertised": command is not None,
            "officialInstallSurface": "Customize / Team Marketplace UI",
            "remoteGuiVerified": False,
        }
        self.receipt["limitation"] = "CURSOR_UNATTENDED_INSTALL_NOT_YET_VERIFIED"
        self.receipt["capabilityDiscoveryComplete"] = True
        if re.search(r"(?m)^\s+marketplace\b", text):
            # These exact commands/flags were advertised by current native
            # agent 2026.10.22-27dcf5f in run 41742477225. No account/login retry.
            self.run("cursor-marketplace-add", [binary, command.group(1), "marketplace", "add", PUBLIC_GIT,
                                                 "--git-ref", self.source])
            listing = json_output(self.run("cursor-marketplace-list", [binary, command.group(1), "marketplace",
                                                                         "list", "--format", "json"]))
            require(any(item.get("name") == "madang" or item.get("marketplaceName") == "madang"
                        for item in objects(listing)), "NATIVE_MARKETPLACE_NOT_LISTED")
            self.receipt["nativeMarketplaceRegistered"] = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client", choices=INSTALLERS, required=True)
    parser.add_argument("--product-set", choices=PRODUCT_SETS, default="madang-six-cae")
    args = parser.parse_args()
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted",
            "GITHUB_HOSTED_ONLY")
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "REPOSITORY_MISMATCH")
    root = Path(__file__).resolve().parents[1]
    output = root / "results/client-install" / args.product_set / args.client
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="public-plugin-client-", dir=os.environ["RUNNER_TEMP"]) as directory:
        verification = Verification(args.client, Path(directory), output, args.product_set)
        code = 1
        try:
            if args.client == "cursor":
                verification.receipt["priorAuthRefusal"] = {"run": 41743350261,
                    "clientVersion": "2026.10.22-27dcf5f", "phase": "cursor-marketplace-add"}
                raise VerificationError("CURSOR_AUTHENTICATION_REQUIRED_NO_RETRY")
            verification.receipt["integrityControls"] = integrity_controls()
            verification.receipt["payloadSetControls"] = payload_controls(Path(directory))
            verification.receipt["controllerRevision"] = verification.run(
                "controller-revision", ["git", "-C", str(root), "rev-parse", "HEAD"]).strip()
            binary = verification.install_client()
            source, entries = verification.reference()
            if args.client == "cursor":
                verification.cursor_capabilities(binary)
                code = 0  # Capability probe only; complete remains false, installed=0.
            else:
                verification.verify(binary, source, entries)
                code = 0
        except Exception as error:
            verification.receipt["failureCode"] = str(error) if isinstance(error, VerificationError) else type(error).__name__
            if isinstance(error, PayloadSetError):
                verification.receipt["payloadSetDifference"] = error.difference
        finally:
            (output / "receipt.json").write_text(json.dumps(verification.receipt, ensure_ascii=False, indent=2) + "\n")
        print(f"CLIENT_RESULT {args.client} productSet={args.product_set} installed={verification.receipt['installedAndListed']}/{len(verification.products)} complete={verification.receipt['complete']}", flush=True)
        return code


if __name__ == "__main__":
    raise SystemExit(main())
